import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as XLSX from "@stackline/xlsx";
import { approveImportBatch, createImportPreview, dryRunImportBatch, executeImportBatch, parseImportWorkbook, rollbackImportBatch } from "../lib/data-import.ts";
import { getImportTarget, importHeaderFingerprint, mapImportRow, normalizeArabicDigits, suggestImportMapping } from "../lib/import-definitions.ts";
import { scopedModels, scopePrismaArgs } from "../lib/data-scope.ts";
import { enqueueBackgroundJob, runBackgroundJob } from "../lib/background-jobs.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-import-test-"));
const database = join(directory, "import.db");
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
let unitId, itemId, partyId;
let openingAccountCodes;

function workbookBytes(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

async function approve(batchId) {
  await prisma.$transaction((tx) => dryRunImportBatch(tx, batchId, "test"));
  await prisma.$transaction((tx) => approveImportBatch(tx, batchId, "test"));
}

async function approveAndExecute(batchId) {
  await approve(batchId);
  return prisma.$transaction((tx) => executeImportBatch(tx, batchId, "test"));
}

before(async () => {
  const unit = await prisma.unit.create({ data: { code: `IMP-${suffix}`, nameAr: "وحدة استيراد", nameEn: "Import Unit" } });
  unitId = unit.id;
  const item = await prisma.item.create({ data: { code: `IMP-ITEM-${suffix}`, nameAr: "مادة استيراد", unitId } });
  itemId = item.id;
  partyId = (await prisma.party.create({ data: { nameAr: `عميل سند استيراد ${suffix}`, unifiedNumber: `NOTE-P-${suffix}`, isCustomer: true } })).id;
  const debitAccount = await prisma.account.create({ data: { code: `IMP-DR-${suffix}`, nameAr: "حساب مدين للاستيراد", accountType: "ASSET" } });
  const creditAccount = await prisma.account.create({ data: { code: `IMP-CR-${suffix}`, nameAr: "حساب دائن للاستيراد", accountType: "EQUITY" } });
  openingAccountCodes = [debitAccount.code, creditAccount.code];
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("محلل الاستيراد يقرأ XLSX متعدد الأوراق وCSV ويحفظ رقم الورقة والصف", () => {
  const bytes = workbookBytes({ العملاء: [{ "الاسم العربي": "ألف" }], الموردون: [{ "الاسم العربي": "باء" }] });
  const parsed = parseImportWorkbook(bytes, "legacy.xlsx");
  assert.equal(parsed.sheets.length, 2); assert.equal(parsed.rows.length, 2); assert.equal(parsed.rows[0].sourceRow, 2); assert.equal(parsed.rows[1].sourceSheet, "الموردون");
  const csv = parseImportWorkbook(new TextEncoder().encode("Item Code,Quantity\nA,4\n"), "opening.csv");
  assert.equal(csv.rows.length, 1); assert.equal(csv.headers[0], "Item Code");
  const titled = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(titled, XLSX.utils.aoa_to_sheet([["تقرير العملاء"], ["Customer Code", "Customer Name"], ["C-1", "Acme"]]), "Customers");
  const detected = parseImportWorkbook(new Uint8Array(XLSX.write(titled, { type: "buffer", bookType: "xlsx" })), "header-detection.xlsx");
  assert.deepEqual(detected.headers, ["Customer Code", "Customer Name"]); assert.equal(detected.rows[0].sourceRow, 3);
});

test("اقتراح ربط الأعمدة يفهم العربية والإنجليزية والتحويل يحافظ على القيم الرقمية والتواريخ", () => {
  const target = getImportTarget("COMPANY_STOCK");
  const mapping = suggestImportMapping(["Item Code", "الكمية", "Balance Date"], target);
  assert.equal(mapping.itemCode, "Item Code"); assert.equal(mapping.quantity, "الكمية");
  const result = mapImportRow({ "Item Code": "ABC", "الكمية": "1,250.5", "Balance Date": "2026-01-05" }, mapping, target);
  assert.equal(result.mapped.quantity, 1250.5); assert.match(result.mapped.movementDate, /^2026-01-05/); assert.equal(result.errors.length, 0);
});

test("التطبيع العربي يوحّد أسماء العملاء والأرقام والفواصل والقيم السالبة", () => {
  const target = getImportTarget("CUSTOMERS"), headers = ["رقم العميل", "إسم العميل", "الهاتف"];
  const mapping = suggestImportMapping(headers, target);
  assert.equal(mapping.legacyCode, "رقم العميل");
  assert.equal(mapping.nameAr, "إسم العميل");
  assert.equal(normalizeArabicDigits("١٢۳٤"), "1234");
  const stock = getImportTarget("PARTY_STOCK");
  const result = mapImportRow({ Party: "C-1", "Item Code": "I-1", Quantity: "(١٬٢٥٠٫٥)" }, { partyKey: "Party", itemCode: "Item Code", quantity: "Quantity" }, stock);
  assert.equal(result.mapped.quantity, -1250.5);
});

test("الربط الإنجليزي يتعرف على Customer Code وCustomer Name تلقائيًا", () => {
  const target = getImportTarget("CUSTOMERS"), mapping = suggestImportMapping(["Customer Code", "Customer Name", "Mobile"], target);
  assert.equal(mapping.legacyCode, "Customer Code");
  assert.equal(mapping.nameAr, "Customer Name");
  assert.equal(mapping.telephone, "Mobile");
  assert.ok(importHeaderFingerprint(["Customer Name", "Customer Code"]).includes("customercode"));
});

test("التاريخ غير الصالح والمرجع المفقود يظهران كأخطاء قبل Dry Run", async () => {
  const bytes = workbookBytes({ Sales: [{ "رقم الفاتورة": `BAD-${suffix}`, "تاريخ الفاتورة": "31/02/2026", "العميل أو المورد": "MISSING-CUSTOMER", "كود المادة": `IMP-ITEM-${suffix}`, "رقم السطر": 1, "الكمية": 1, "سعر الوحدة": 10 }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "invalid-sales.xlsx", targetType: "SALES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(preview.invalidRows, 1);
  assert.ok(preview.rows[0].errors.some((error) => error.includes("مطلوب") || error.includes("غير موجود")));
  assert.equal(await prisma.sale.count({ where: { invoiceNumber: `BAD-${suffix}` } }), 0);
});

test("لا يمكن التنفيذ قبل Dry Run والاعتماد وDry Run لا يكتب بيانات تشغيلية", async () => {
  const unified = `GATE-${suffix}`, before = await prisma.party.count();
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل بوابة الاعتماد", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "approval-gate.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  await assert.rejects(prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test")), /Dry Run|الاعتماد/);
  const dry = await prisma.$transaction((tx) => dryRunImportBatch(tx, preview.id, "test"));
  assert.equal(dry.status, "DRY_RUN"); assert.equal(await prisma.party.count(), before);
  await prisma.$transaction((tx) => approveImportBatch(tx, preview.id, "test"));
  await prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test"));
  assert.equal(await prisma.party.count({ where: { unifiedNumber: unified } }), 1);
});

test("التقرير الملخص التاريخي يحفظ مرجعًا ولا ينشئ قيدًا محاسبيًا", async () => {
  const journalBefore = await prisma.journalEntry.count();
  const bytes = workbookBytes({ Summary: [{ "اسم البند": "صافي الربح", "الفترة": "2025", "المبلغ": "١٢٬٥٠٠٫٢٥-" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "income-summary.xlsx", targetType: "INCOME_STATEMENT_REFERENCE", importMode: "HISTORICAL", duplicateStrategy: "SKIP", createdBy: "test" }));
  const executed = await approveAndExecute(preview.id);
  assert.equal(executed.status, "COMPLETED"); assert.equal(await prisma.legacyReferenceSnapshot.count({ where: { importBatchId: preview.id } }), 1); assert.equal(await prisma.journalEntry.count(), journalBefore);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(await prisma.legacyReferenceSnapshot.count({ where: { importBatchId: preview.id } }), 0);
});

test("إعادة رفع الملف تُعلّم التحذير ولا تنشئ العميل مرتين", async () => {
  const unified = `REPEAT-${suffix}`, bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل مكرر", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const first = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "repeat.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  await approveAndExecute(first.id);
  const second = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "repeat.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(second.duplicateRows, 1); assert.ok(second.warningRows >= 1);
  await approveAndExecute(second.id);
  assert.equal(await prisma.party.count({ where: { unifiedNumber: unified } }), 1);
});

test("التراجع يُمنع عندما تعتمد حركة لاحقة على سجل أنشأته الدفعة", async () => {
  const unified = `BLOCK-${suffix}`, bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل مرتبط", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "blocked-rollback.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  await approveAndExecute(preview.id);
  const party = await prisma.party.findUniqueOrThrow({ where: { unifiedNumber: unified } });
  await prisma.partyStockAccount.create({ data: { partyId: party.id, itemId, quantity: 0 } });
  await assert.rejects(prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test")), /معاملات لاحقة/);
  assert.equal(await prisma.party.count({ where: { id: party.id } }), 1);
});

test("المعاينة تعالج آلاف الصفوف دفعة واحدة دون إسقاط المصدر", async () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ "الاسم العربي": `عميل تحميل ${suffix}-${index}`, "الرقم الموحد": `LOAD-${suffix}-${index}`, "عميل": "نعم" }));
  const bytes = workbookBytes({ Bulk: rows });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "bulk-2000.xlsx", targetType: "PARTIES", importMode: "HISTORICAL", duplicateStrategy: "SKIP", createdBy: "load-test" }), { timeout: 120_000 });
  assert.equal(preview.totalRows, 2000); assert.equal(preview.validRows, 2000); assert.equal(preview.rows.length, 200);
  assert.equal(await prisma.importRow.count({ where: { importBatchId: preview.id } }), 2000);
});

test("المعاينة تكشف الحقول المفقودة والتكرار قبل أي كتابة تشغيلية", async () => {
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": `عميل ${suffix}`, "الرقم الموحد": `U-${suffix}` }, { "الاسم العربي": "", "الهاتف": "0500000000" }] });
  const before = await prisma.party.count();
  const batch = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "parties.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(batch.totalRows, 2); assert.equal(batch.validRows, 1); assert.equal(batch.invalidRows, 1); assert.equal(await prisma.party.count(), before);
  await assert.rejects(prisma.$transaction((tx) => dryRunImportBatch(tx, batch.id, "test")), /الصفوف غير الصالحة/);
});

test("تنفيذ master data ينشئ السجل والتتبع والتراجع يحذفه عند عدم وجود اعتماديات", async () => {
  const unified = `ROLL-${suffix}`;
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل قابل للتراجع", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "party-rollback.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  const executed = await approveAndExecute(preview.id);
  assert.equal(executed.status, "COMPLETED"); assert.equal(executed.createdRows, 1);
  const party = await prisma.party.findUniqueOrThrow({ where: { unifiedNumber: unified } });
  const link = await prisma.legacyRecordLink.findFirstOrThrow({ where: { importBatchId: preview.id } });
  assert.equal(link.entityId, party.id); assert.equal(link.sourceFile, "party-rollback.xlsx"); assert.equal(link.sourceRow, 2);
  const rolledBack = await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(rolledBack.status, "ROLLED_BACK"); assert.equal(await prisma.party.count({ where: { id: party.id } }), 0);
});

test("التراجع عن تحديث سجل موجود لا يحذف بيانات NETAj الأصلية", async () => {
  const unified = `KEEP-${suffix}`;
  const existing = await prisma.party.create({ data: { nameAr: "اسم قبل التحديث", unifiedNumber: unified, isCustomer: true } });
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "اسم بعد التحديث", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "party-update.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "UPDATE", createdBy: "test" }));
  await approveAndExecute(preview.id);
  assert.equal((await prisma.party.findUniqueOrThrow({ where: { id: existing.id } })).nameAr, "اسم بعد التحديث");
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(await prisma.party.count({ where: { id: existing.id } }), 1);
});

test("الرصيد الافتتاحي للمخزون ينشئ حركة حقيقية ويعيد الحالة السابقة عند التراجع", async () => {
  const before = await prisma.companyStock.findUnique({ where: { itemId } });
  const quantityBefore = Number(before?.quantity ?? 0), averageBefore = Number(before?.averageCost ?? 0);
  const bytes = workbookBytes({ Stock: [{ "كود المادة": `IMP-ITEM-${suffix}`, "الكمية": 7, "تكلفة الوحدة": 11, "تاريخ الرصيد": "2026-01-01" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "stock.xlsx", targetType: "COMPANY_STOCK", importMode: "OPENING", duplicateStrategy: "SKIP", createdBy: "test" }));
  await approveAndExecute(preview.id);
  const afterImport = await prisma.companyStock.findUniqueOrThrow({ where: { itemId } });
  assert.equal(Number(afterImport.quantity), quantityBefore + 7);
  const movement = await prisma.stockMovement.findFirstOrThrow({ where: { referenceType: "IMPORT_BATCH", referenceId: preview.id } });
  assert.equal(Number(movement.balanceAfter), quantityBefore + 7);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  const afterRollback = await prisma.companyStock.findUniqueOrThrow({ where: { itemId } });
  assert.equal(Number(afterRollback.quantity), quantityBefore); assert.equal(Number(afterRollback.averageCost), averageBefore);
});

test("رصيد مخزون العميل السالب مسموح بينما رصيد الشركة السالب يُرفض", async () => {
  const partyBytes = workbookBytes({ Stock: [{ "العميل": `NOTE-P-${suffix}`, "كود المادة": `IMP-ITEM-${suffix}`, "الكمية": -4, "قيمة الوحدة": 9, "تاريخ الرصيد": "2026-01-01" }] });
  const partyPreview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes: partyBytes, filename: "negative-party-stock.xlsx", targetType: "PARTY_STOCK", importMode: "OPENING", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(partyPreview.invalidRows, 0); await approveAndExecute(partyPreview.id);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), -4);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, partyPreview.id, "test"));
  const companyBytes = workbookBytes({ Stock: [{ "كود المادة": `IMP-ITEM-${suffix}`, "الكمية": -4, "تكلفة الوحدة": 9 }] });
  const companyPreview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes: companyBytes, filename: "negative-company-stock.xlsx", targetType: "COMPANY_STOCK", importMode: "OPENING", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(companyPreview.invalidRows, 1);
});

test("فواتير البيع والشراء تُنشأ كمسودات بلا ترحيل مزدوج ويمكن التراجع عنها", async () => {
  const supplier = await prisma.party.create({ data: { nameAr: `مورد استيراد ${suffix}`, unifiedNumber: `SUP-${suffix}`, isSupplier: true } });
  const saleNumber = `SALE-IMP-${suffix}`, purchaseNumber = `PUR-IMP-${suffix}`;
  const saleBytes = workbookBytes({ Sales: [{ "رقم الفاتورة": saleNumber, "تاريخ الفاتورة": "2026-03-01", "العميل أو المورد": `NOTE-P-${suffix}`, "كود المادة": `IMP-ITEM-${suffix}`, "رقم السطر": 1, "الكمية": 2, "سعر الوحدة": 30 }] });
  const purchaseBytes = workbookBytes({ Purchases: [{ "رقم الشراء": purchaseNumber, "تاريخ الشراء": "2026-03-02", "العميل أو المورد": supplier.unifiedNumber, "كود المادة": `IMP-ITEM-${suffix}`, "رقم السطر": 1, "الكمية": 3, "سعر الوحدة": 20 }] });
  const saleBatch = await prisma.$transaction((tx) => createImportPreview(tx, { bytes: saleBytes, filename: "sales.xlsx", targetType: "SALES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  const purchaseBatch = await prisma.$transaction((tx) => createImportPreview(tx, { bytes: purchaseBytes, filename: "purchases.xlsx", targetType: "PURCHASES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(saleBatch.invalidRows, 0); assert.equal(purchaseBatch.invalidRows, 0);
  await approveAndExecute(saleBatch.id); await approveAndExecute(purchaseBatch.id);
  const sale = await prisma.sale.findUniqueOrThrow({ where: { invoiceNumber: saleNumber } }), purchase = await prisma.purchase.findUniqueOrThrow({ where: { purchaseNumber } });
  assert.equal(sale.status, "DRAFT"); assert.equal(purchase.status, "DRAFT");
  assert.equal(await prisma.journalEntry.count({ where: { OR: [{ referenceType: "SALE", referenceId: sale.id }, { referenceType: "PURCHASE", referenceId: purchase.id }] } }), 0);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, saleBatch.id, "test")); await prisma.$transaction((tx) => rollbackImportBatch(tx, purchaseBatch.id, "test"));
  assert.equal(await prisma.sale.count({ where: { id: sale.id } }), 0); assert.equal(await prisma.purchase.count({ where: { id: purchase.id } }), 0);
});

test("الأرصدة الافتتاحية المحاسبية تنشئ قيدًا متوازنًا قابلًا للتراجع دون قيد مكرر", async () => {
  const bytes = workbookBytes({ GL: [{ "كود الحساب": openingAccountCodes[0], "مدين": 100, "دائن": 0, "تاريخ القيد": "2026-01-01" }, { "كود الحساب": openingAccountCodes[1], "مدين": 0, "دائن": 100, "تاريخ القيد": "2026-01-01" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "opening-gl.xlsx", targetType: "OPENING_BALANCES", importMode: "OPENING", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(preview.invalidRows, 0);
  await approveAndExecute(preview.id);
  const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "IMPORT_OPENING", referenceId: preview.id }, include: { lines: true } });
  assert.equal(Number(journal.totalDebit), 100); assert.equal(Number(journal.totalCredit), 100); assert.equal(journal.lines.length, 2);
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "IMPORT_OPENING", referenceId: preview.id } }), 1);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(await prisma.journalEntry.count({ where: { id: journal.id } }), 0);
});

test("استيراد سند تشغيلي FULL يحدّث مخزون العميل مرة واحدة والتراجع يعكسه", async () => {
  const legacyNumber = `LEG-NOTE-${suffix}`;
  const bytes = workbookBytes({ Notes: [{ "رقم السند القديم": legacyNumber, "نوع السند": "استلام", "تاريخ السند": "2026-02-01", "العميل أو المورد": `NOTE-P-${suffix}`, "كود المادة": `IMP-ITEM-${suffix}`, "رقم السطر": 1, "الكمية": 3, "ملكية المخزون": "عميل" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "notes.xlsx", targetType: "NOTES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(preview.invalidRows, 0);
  await approveAndExecute(preview.id);
  const noteLink = await prisma.legacyRecordLink.findFirstOrThrow({ where: { importBatchId: preview.id, entityType: "DELIVERY_RECEIPT_NOTE" } });
  const note = await prisma.deliveryReceiptNote.findUniqueOrThrow({ where: { id: noteLink.entityId } });
  assert.equal(note.status, "POSTED"); assert.equal(noteLink.legacyDocumentNumber, legacyNumber);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), 3);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal((await prisma.deliveryReceiptNote.findUniqueOrThrow({ where: { id: note.id } })).status, "CANCELLED");
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), 0);
});

test("نماذج الاستيراد كلها ضمن tenant/company وID المباشر يُقيّد بالنطاق", () => {
  for (const model of ["ImportBatch", "ImportRow", "LegacyRecordLink", "ImportTemplate", "LegacySourceSystem", "LegacyReferenceSnapshot"]) assert.ok(scopedModels.has(model));
  const args = scopePrismaArgs("findUnique", { where: { id: 99 } }, { tenantId: 8, companyId: 12 });
  assert.deepEqual(args.where, { id: 99, tenantId: 8, companyId: 12 });
});

test("دفعة الاستيراد الثقيلة تنفذ مرة واحدة عبر الطابور الخلفي", async () => {
  const unified = `QUEUE-${suffix}`;
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل طابور", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "queued-party.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  await approve(preview.id);
  await prisma.importBatch.update({ where: { id: preview.id }, data: { status: "QUEUED" } });
  const queued = await prisma.$transaction((tx) => enqueueBackgroundJob(tx, { jobType: "IMPORT_EXECUTE", payload: { batchId: preview.id }, idempotencyKey: `import:${preview.id}` }, "test"));
  await prisma.$transaction((tx) => runBackgroundJob(tx, queued.job.id, "test"));
  assert.equal((await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } })).status, "COMPLETED");
  assert.equal(await prisma.party.count({ where: { unifiedNumber: unified } }), 1);
  const duplicate = await prisma.$transaction((tx) => enqueueBackgroundJob(tx, { jobType: "IMPORT_EXECUTE", payload: { batchId: preview.id }, idempotencyKey: `import:${preview.id}` }, "test"));
  assert.equal(duplicate.created, false);
});
