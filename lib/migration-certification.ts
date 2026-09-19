import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { createPdf, createXlsx, type ReportTable } from "@/lib/financial-export";
import { audit } from "@/lib/audit";

type Tx = Prisma.TransactionClient;
type Control = { key: string; label: string; legacyTotal: number; netajTotal: number; difference: number; status: "MATCHED" | "WARNING" | "MISMATCH"; explanation: string; drillDown?: string };

export class MigrationCertificationError extends Error {
  constructor(message: string, public readonly code = "CERTIFICATION_ERROR", public readonly statusCode = 400) { super(message); }
}

const n = (value: unknown) => Number(value ?? 0);
const parse = (value: string) => { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } };
const control = (key: string, label: string, legacyTotal: number, netajTotal: number, explanation: string, drillDown?: string): Control => {
  const difference = Number((netajTotal - legacyTotal).toFixed(2)), tolerance = Math.max(.01, Math.abs(legacyTotal) * .000001);
  return { key, label, legacyTotal, netajTotal, difference, status: Math.abs(difference) <= tolerance ? "MATCHED" : legacyTotal === 0 || netajTotal === 0 ? "WARNING" : "MISMATCH", explanation, drillDown };
};

export async function buildMigrationCertificate(tx: Tx, importBatchId: number, userId?: string | null) {
  const batch = await tx.importBatch.findFirst({ where: { id: importBatchId }, include: { rows: { orderBy: { id: "asc" } }, links: true, referenceSnapshots: true } });
  if (!batch) throw new MigrationCertificationError("دفعة الاستيراد غير موجودة", "NOT_FOUND", 404);
  if (batch.status !== "COMPLETED") throw new MigrationCertificationError("تُنشأ الشهادة بعد اكتمال الاستيراد فقط", "INVALID_STATUS", 409);
  const importedRows = batch.rows.filter((row) => row.status === "IMPORTED").map((row) => parse(row.mappedDataJson)), links = batch.links, ids = (entityType: string) => [...new Set(links.filter((link) => link.entityType === entityType).map((link) => link.entityId))];
  const controls: Control[] = [];

  if (["PARTIES", "CUSTOMERS", "SUPPLIERS"].includes(batch.targetType)) controls.push(control("PARTIES", batch.targetType === "SUPPLIERS" ? "الموردون" : batch.targetType === "CUSTOMERS" ? "العملاء" : "العملاء والموردون", importedRows.length, ids("PARTY").length, "عدد صفوف المصدر المنفذة مقابل سجلات الأطراف المرتبطة", "/parties"));
  else if (batch.targetType === "SALES") {
    const legacy = groupedDocumentTotal(importedRows, "invoiceNumber"), records = await tx.sale.findMany({ where: { id: { in: ids("SALE") } } });
    controls.push(control("SALES", "إجمالي المبيعات", legacy, records.reduce((sum, row) => sum + n(row.totalAmount), 0), "إجمالي المستندات القديمة مقابل فواتير NETAJ المرتبطة", "/sales"));
  } else if (batch.targetType === "PURCHASES") {
    const legacy = groupedDocumentTotal(importedRows, "purchaseNumber"), records = await tx.purchase.findMany({ where: { id: { in: ids("PURCHASE") } } });
    controls.push(control("PURCHASES", "إجمالي المشتريات", legacy, records.reduce((sum, row) => sum + n(row.totalAmount), 0), "إجمالي المستندات القديمة مقابل مشتريات NETAJ المرتبطة", "/purchases"));
  } else if (["COMPANY_STOCK", "PARTY_STOCK", "INVENTORY_MOVEMENTS"].includes(batch.targetType)) {
    const legacyQty = importedRows.reduce((sum, row) => sum + signedQuantity(batch.targetType, row), 0), movementIds = ids("STOCK_MOVEMENT"), movements = await tx.stockMovement.findMany({ where: { id: { in: movementIds } } });
    controls.push(control("INVENTORY_QTY", "كمية المخزون", legacyQty, movements.reduce((sum, row) => sum + n(row.quantityIn) - n(row.quantityOut), 0), "صافي كمية المصدر مقابل الحركات المرتبطة", "/inventory"));
    controls.push(control("INVENTORY_VALUE", "قيمة المخزون", importedRows.reduce((sum, row) => sum + signedQuantity(batch.targetType, row) * n(row.unitCost), 0), movements.reduce((sum, row) => sum + (n(row.quantityIn) - n(row.quantityOut)) * n(row.unitCost), 0), "قيمة المصدر بالكمية والتكلفة مقابل قيمة الحركات", "/inventory"));
  } else if (["OPENING_BALANCES", "JOURNAL_ENTRIES"].includes(batch.targetType)) {
    const journals = await tx.journalEntry.findMany({ where: { id: { in: ids("JOURNAL_ENTRY") } } });
    controls.push(control("TRIAL_DEBIT", "ميزان المراجعة — مدين", importedRows.reduce((sum, row) => sum + n(row.debit) * n(row.exchangeRate || 1), 0), journals.reduce((sum, row) => sum + n(row.totalDebit), 0), "إجمالي المدين الوظيفي للمصدر مقابل القيود المرتبطة", "/accounting?tab=reports&report=trial-balance"));
    controls.push(control("TRIAL_CREDIT", "ميزان المراجعة — دائن", importedRows.reduce((sum, row) => sum + n(row.credit) * n(row.exchangeRate || 1), 0), journals.reduce((sum, row) => sum + n(row.totalCredit), 0), "إجمالي الدائن الوظيفي للمصدر مقابل القيود المرتبطة", "/accounting?tab=reports&report=trial-balance"));
  } else if (batch.targetType === "TRIAL_BALANCE_REFERENCE") {
    const source = batch.referenceSnapshots.map((row) => parse(row.dataJson)), [ledgerDebit, ledgerCredit] = await Promise.all([tx.journalEntryLine.aggregate({ where: { journalEntry: { status: "POSTED" } }, _sum: { debit: true } }), tx.journalEntryLine.aggregate({ where: { journalEntry: { status: "POSTED" } }, _sum: { credit: true } })]);
    controls.push(control("TRIAL_DEBIT", "ميزان المراجعة المرجعي — مدين", source.reduce((sum, row) => sum + n(row.closingDebit), 0), n(ledgerDebit._sum.debit), "التقرير القديم المرجعي مقابل كامل الأستاذ المرحل في NETAJ", "/accounting?tab=reports&report=trial-balance"));
    controls.push(control("TRIAL_CREDIT", "ميزان المراجعة المرجعي — دائن", source.reduce((sum, row) => sum + n(row.closingCredit), 0), n(ledgerCredit._sum.credit), "التقرير القديم المرجعي مقابل كامل الأستاذ المرحل في NETAJ", "/accounting?tab=reports&report=trial-balance"));
  } else if (["RECEIPTS", "PAYMENTS"].includes(batch.targetType)) {
    const vouchers = await tx.financialVoucher.findMany({ where: { id: { in: ids("FINANCIAL_VOUCHER") } } });
    controls.push(control(batch.targetType, batch.targetType === "RECEIPTS" ? "سندات القبض" : "سندات الصرف", importedRows.reduce((sum, row) => sum + n(row.amount), 0), vouchers.reduce((sum, row) => sum + n(row.amount), 0), "مبالغ المصدر مقابل السندات المرتبطة", "/accounting?tab=vouchers"));
  } else if (batch.targetType === "AR_AP_BALANCES") {
    const journals = await tx.journalEntry.findMany({ where: { id: { in: ids("JOURNAL_ENTRY") } } });
    controls.push(control("AR_AP", "أرصدة العملاء والموردين", importedRows.reduce((sum, row) => sum + Math.abs(n(row.amount) * n(row.exchangeRate || 1)), 0), journals.reduce((sum, row) => sum + n(row.totalDebit), 0), "إجمالي الأرصدة الوظيفية مقابل قيد الافتتاح المرتبط", "/accounting?tab=reports"));
  } else if (batch.targetType === "BANKS_CASH") {
    const banks = await tx.bankAccount.findMany({ where: { id: { in: ids("BANK_ACCOUNT") } } });
    controls.push(control("BANKS", "البنوك والصناديق", importedRows.reduce((sum, row) => sum + n(row.openingBalance), 0), banks.reduce((sum, row) => sum + n(row.currentBalance), 0), "الأرصدة الافتتاحية مقابل الرصيد التشغيلي للحسابات المرتبطة", "/accounting?tab=banks"));
  } else if (batch.targetType === "VAT_REFERENCE") {
    const source = batch.referenceSnapshots.map((row) => parse(row.dataJson)), mappings = await tx.accountingMapping.findMany({ where: { key: { in: ["VAT_PAYABLE", "INPUT_VAT"] } } }), accountIds = mappings.map((row) => row.accountId), totals = await tx.journalEntryLine.aggregate({ where: { accountId: { in: accountIds }, journalEntry: { status: "POSTED" } }, _sum: { debit: true, credit: true } });
    controls.push(control("VAT", "ضريبة القيمة المضافة", source.reduce((sum, row) => sum + n(row.vatAmount), 0), Math.abs(n(totals._sum.credit) - n(totals._sum.debit)), "ضريبة التقرير القديم المرجعي مقابل صافي حسابات VAT المرحلة", "/accounting?tab=vat"));
  } else controls.push(control("ROWS", "السجلات المنفذة", importedRows.length, links.length || batch.referenceSnapshots.length, "عدد صفوف المصدر المنفذة مقابل السجلات أو المراجع المرتبطة"));

  const mismatches = controls.filter((row) => row.status === "MISMATCH").length, warnings = controls.filter((row) => row.status === "WARNING").length, status = mismatches ? "MISMATCH" : warnings ? "WARNING" : "MATCHED", certificateNumber = `MIG-CERT-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const certificate = await tx.migrationCertificate.create({ data: { certificateNumber, importBatchId: batch.id, status, controlsJson: JSON.stringify(controls), summaryJson: JSON.stringify({ sourceSystem: batch.legacySystem, sourceFile: batch.sourceFile, targetType: batch.targetType, controlCount: controls.length, matched: controls.filter((row) => row.status === "MATCHED").length, warnings, mismatches, statement: status === "MATCHED" ? "جميع الضوابط المادية متطابقة ضمن هامش التقريب" : "لا تُعد الهجرة ناجحة نهائيًا حتى تفسير الفروقات غير الصفرية" }), generatedBy: userId ?? null, certifiedAt: status === "MATCHED" ? new Date() : null, certifiedBy: status === "MATCHED" ? userId ?? null : null } });
  await audit(tx, { action: "MIGRATION_CERTIFICATE_GENERATE", entityType: "MIGRATION_CERTIFICATE", entityId: certificate.id, userId, metadata: { batchId: batch.id, status, mismatches, warnings } });
  return serializeCertificate(certificate);
}

function groupedDocumentTotal(rows: Record<string, unknown>[], numberKey: string) {
  const totals = new Map<string, { subtotal: number; discount: number; vat: number }>();
  for (const row of rows) { const key = String(row[numberKey] ?? ""), current = totals.get(key) ?? { subtotal: 0, discount: 0, vat: 0 }, base = n(row.quantity) * n(row.unitPrice), discount = n(row.discount), vat = (base - discount) * n(row.vatRate || 15) / 100; current.subtotal += base; current.discount += discount; current.vat += vat; totals.set(key, current); }
  return [...totals.values()].reduce((sum, row) => sum + row.subtotal - row.discount + row.vat, 0);
}

function signedQuantity(targetType: string, row: Record<string, unknown>) { if (targetType !== "INVENTORY_MOVEMENTS") return n(row.quantity); return ["OUT", "صادر", "خروج"].includes(String(row.direction ?? "").toUpperCase()) ? -Math.abs(n(row.quantity)) : Math.abs(n(row.quantity)); }
export function serializeCertificate<T extends { controlsJson: string; summaryJson: string }>(certificate: T) { return { ...certificate, controls: JSON.parse(certificate.controlsJson) as Control[], summary: JSON.parse(certificate.summaryJson) as Record<string, unknown> }; }
type ExportableCertificate = ReturnType<typeof serializeCertificate<{ certificateNumber: string; status: string; controlsJson: string; summaryJson: string }>>;
export function migrationCertificateFile(certificate: ExportableCertificate, format: "xlsx" | "pdf") { const table: ReportTable = { title: `NETAJ Migration Reconciliation Certificate — ${certificate.certificateNumber}`, subtitle: `Status: ${certificate.status}`, columns: ["Control", "Old System Total", "NETAJ Total", "Difference", "Status", "Explanation"], rows: certificate.controls.map((row) => [row.label, row.legacyTotal, row.netajTotal, row.difference, row.status, row.explanation]) }; return format === "xlsx" ? createXlsx(table) : createPdf(table); }
