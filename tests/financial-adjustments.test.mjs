import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { postSalesInvoiceJournal, postSupplierInvoiceJournal } from "../lib/accounting.ts";
import { cancelAccountingAdjustment, cancelCreditDebitNote, createAccountingAdjustment, createCreditDebitNote, postAccountingAdjustment, postCreditDebitNote } from "../lib/financial-adjustments.ts";
import { buildVatSnapshot } from "../lib/financial-reconciliation.ts";
import { ensureFinanceFoundation } from "../lib/finance.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-adjustments-test-"));
const databasePath = join(directory, "adjustments.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
let saleId, purchaseId, revenueAccountId, expenseAccountId;

before(async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
  await prisma.accountingPeriod.upsert({ where: { startDate_endDate: { startDate: new Date("2036-01-01"), endDate: new Date("2036-12-31T23:59:59.999") } }, create: { name: "2036 isolated tests", startDate: new Date("2036-01-01"), endDate: new Date("2036-12-31T23:59:59.999") }, update: { status: "OPEN", closedAt: null } });
  const fiscalYear = await prisma.fiscalYear.upsert({ where: { companyId_startDate_endDate: { companyId: 1, startDate: new Date("2036-01-01"), endDate: new Date("2036-12-31T23:59:59.999") } }, create: { companyId: 1, name: "2036 isolated tests", startDate: new Date("2036-01-01"), endDate: new Date("2036-12-31T23:59:59.999") }, update: { status: "OPEN", closedAt: null } });
  await prisma.fiscalPeriod.upsert({ where: { fiscalYearId_periodNumber: { fiscalYearId: fiscalYear.id, periodNumber: 1 } }, create: { fiscalYearId: fiscalYear.id, periodNumber: 1, name: "2036 isolated tests", startDate: new Date("2036-01-01"), endDate: new Date("2036-12-31T23:59:59.999") }, update: { status: "OPEN", closedAt: null } });
  const [customer, supplier] = await Promise.all([
    prisma.party.create({ data: { nameAr: `عميل إشعار ${suffix}`, isCustomer: true } }),
    prisma.party.create({ data: { nameAr: `مورد إشعار ${suffix}`, isSupplier: true } }),
  ]);
  const sale = await prisma.sale.create({ data: { invoiceNumber: `ADJ-S-${suffix}`, invoiceDate: new Date("2036-06-10"), partyId: customer.id, status: "COMPLETED", subtotal: 1000, vatAmount: 150, totalAmount: 1150 } });
  const purchase = await prisma.purchase.create({ data: { purchaseNumber: `ADJ-P-${suffix}`, purchaseDate: new Date("2036-06-11"), partyId: supplier.id, status: "COMPLETED", subtotal: 500, vatAmount: 75, totalAmount: 575 } });
  await prisma.$transaction((tx) => postSalesInvoiceJournal(tx, sale.id));
  await prisma.$transaction((tx) => postSupplierInvoiceJournal(tx, purchase.id));
  saleId = sale.id; purchaseId = purchase.id;
  revenueAccountId = (await prisma.accountingMapping.findUniqueOrThrow({ where: { key: "SALES_REVENUE" } })).accountId;
  expenseAccountId = (await prisma.expenseCategory.findFirstOrThrow()).accountId;
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("الإشعار الدائن للمبيعات يخفض AR والإيراد والضريبة ويظهر في مطابقة VAT", async () => {
  const note = await prisma.$transaction((tx) => createCreditDebitNote(tx, { direction: "SALES", noteType: "CREDIT_NOTE", saleId, noteDate: "2036-06-15", amountBeforeVat: 100, vatAmount: 15, reason: "مرتجع مالي" }, "maker"));
  const posted = await prisma.$transaction((tx) => postCreditDebitNote(tx, note.id, "poster"));
  assert.equal(posted.status, "POSTED");
  assert.equal(Number(posted.journalEntry.totalDebit), 115);
  assert.equal(Number(posted.journalEntry.totalCredit), 115);
  const arLine = posted.journalEntry.lines.find((line) => line.accountName === "الذمم المدينة");
  assert.equal(Number(arLine.credit), 115);
  const snapshot = await prisma.$transaction((tx) => buildVatSnapshot(tx, new Date("2036-06-01"), new Date("2036-06-30T23:59:59.999")));
  assert.equal(Number(snapshot.documentOutputVat), 135);
  assert.equal(Number(snapshot.ledgerOutputVat), 135);
  assert.equal(Number(snapshot.variance), 0);
});

test("الإشعار المدين للمشتريات يزيد AP وضريبة المدخلات", async () => {
  const note = await prisma.$transaction((tx) => createCreditDebitNote(tx, { direction: "PURCHASE", noteType: "DEBIT_NOTE", purchaseId, noteDate: "2036-06-16", amountBeforeVat: 50, vatAmount: 7.5, reason: "تكلفة إضافية" }));
  const posted = await prisma.$transaction((tx) => postCreditDebitNote(tx, note.id));
  assert.equal(Number(posted.journalEntry.totalDebit), 57.5);
  assert.equal(Number(posted.journalEntry.totalCredit), 57.5);
  assert.equal(Number(posted.journalEntry.lines.find((line) => line.accountName === "الذمم الدائنة").credit), 57.5);
});

test("الإشعار الدائن لا يمكن أن يتجاوز الرصيد الأصلي ويُعكس عند الإلغاء", async () => {
  await assert.rejects(prisma.$transaction((tx) => createCreditDebitNote(tx, { direction: "SALES", noteType: "CREDIT_NOTE", saleId, amountBeforeVat: 2000, vatAmount: 300, reason: "غير صالح" })), /تتجاوز الرصيد/);
  const note = await prisma.$transaction((tx) => createCreditDebitNote(tx, { direction: "PURCHASE", noteType: "CREDIT_NOTE", purchaseId, amountBeforeVat: 20, vatAmount: 3, reason: "خصم مورد" }));
  await prisma.$transaction((tx) => postCreditDebitNote(tx, note.id));
  const cancelled = await prisma.$transaction((tx) => cancelCreditDebitNote(tx, note.id, "إدخال مكرر", "controller"));
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "CREDIT_DEBIT_NOTE_REVERSAL", referenceId: note.id } }), 1);
});

test("قيد الاستحقاق يحفظ مسودة متوازنة ثم يرحل ويُعكس مع audit", async () => {
  const adjustment = await prisma.$transaction((tx) => createAccountingAdjustment(tx, { adjustmentType: "ACCRUAL", adjustmentDate: "2036-07-10", description: "استحقاق تجريبي",
    lines: [{ accountId: expenseAccountId, debit: 250 }, { accountId: revenueAccountId, credit: 250 }] }, "maker"));
  assert.equal(adjustment.status, "DRAFT");
  const posted = await prisma.$transaction((tx) => postAccountingAdjustment(tx, adjustment.id, "poster"));
  assert.equal(posted.status, "POSTED");
  assert.equal(Number(posted.journalEntry.totalDebit), 250);
  assert.equal(Number(posted.journalEntry.totalCredit), 250);
  const cancelled = await prisma.$transaction((tx) => cancelAccountingAdjustment(tx, adjustment.id, "عكس الاستحقاق", "controller"));
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(await prisma.auditLog.count({ where: { entityType: "ACCOUNTING_ADJUSTMENT", entityId: adjustment.id } }), 3);
});

test("قيد التسوية غير المتوازن مرفوض قبل حفظه", async () => {
  await assert.rejects(prisma.$transaction((tx) => createAccountingAdjustment(tx, { adjustmentType: "ADJUSTMENT", description: "غير متوازن",
    lines: [{ accountId: expenseAccountId, debit: 100 }, { accountId: revenueAccountId, credit: 90 }] })), /غير متوازن/);
});
