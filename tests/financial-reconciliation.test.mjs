import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { postSalesInvoiceJournal, postSupplierInvoiceJournal } from "../lib/accounting.ts";
import { createBankAccount, ensureFinanceFoundation, recordBankMovement } from "../lib/finance.ts";
import { completeBankReconciliation, createBankReconciliation, createVatReturn, fileVatReturn, settleVatReturn } from "../lib/financial-reconciliation.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-reconciliation-test-"));
const databasePath = join(directory, "reconciliation.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
let bankId, badBankId, customerId, supplierId;

before(async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
  const [customer, supplier] = await Promise.all([
    prisma.party.create({ data: { nameAr: `عميل ضريبة ${suffix}`, isCustomer: true } }),
    prisma.party.create({ data: { nameAr: `مورد ضريبة ${suffix}`, isSupplier: true } }),
  ]);
  const bank = await prisma.$transaction((tx) => createBankAccount(tx, { name: `بنك تسوية ${suffix}`, openingBalance: 1000 }));
  const badBank = await prisma.$transaction((tx) => createBankAccount(tx, { name: `بنك فرق ${suffix}`, openingBalance: 500 }));
  bankId = bank.id; badBankId = badBank.id; customerId = customer.id; supplierId = supplier.id;
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("التسوية البنكية تحسب المطابق والفرق وتقفل فقط عند التطابق", async () => {
  const movement = await prisma.$transaction((tx) => recordBankMovement(tx, { bankAccountId: bankId, date: new Date("2026-09-19T12:00:00Z"), type: "TEST_DEPOSIT", amountIn: 100, referenceType: "TEST_RECONCILIATION", referenceId: bankId, referenceNumber: `TEST-${bankId}` }));
  assert.ok(movement.id);
  const candidates = await prisma.bankTransaction.findMany({ where: { bankAccountId: bankId } });
  const row = await prisma.$transaction((tx) => createBankReconciliation(tx, { bankAccountId: bankId, periodStart: "2026-01-01", periodEnd: "2026-12-31", statementOpeningBalance: 0, statementClosingBalance: 1100, transactionIds: candidates.map((item) => item.id) }, "tester"));
  assert.equal(Number(row.matchedNet), 1100);
  assert.equal(Number(row.difference), 0);
  const completed = await prisma.$transaction((tx) => completeBankReconciliation(tx, row.id, "checker"));
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.completedBy, "checker");
});

test("التسوية البنكية ترفض الإقفال عند وجود فرق", async () => {
  const row = await prisma.$transaction((tx) => createBankReconciliation(tx, { bankAccountId: badBankId, periodStart: "2026-01-01", periodEnd: "2026-12-31", statementOpeningBalance: 0, statementClosingBalance: 600, transactionIds: [] }));
  assert.equal(Number(row.difference), 600);
  await assert.rejects(prisma.$transaction((tx) => completeBankReconciliation(tx, row.id)), /لا يمكن إقفال التسوية/);
});

test("الإقرار الضريبي يطابق المستندات مع الأستاذ ويرحل التسوية والسداد", async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const sale = await prisma.sale.create({ data: { invoiceNumber: `VAT-S-${suffix}`, invoiceDate: new Date("2026-04-10"), partyId: customerId, status: "COMPLETED", subtotal: 1000, vatAmount: 150, totalAmount: 1150 } });
  const purchase = await prisma.purchase.create({ data: { purchaseNumber: `VAT-P-${suffix}`, purchaseDate: new Date("2026-04-12"), partyId: supplierId, status: "COMPLETED", subtotal: 500, vatAmount: 75, totalAmount: 575 } });
  await prisma.$transaction((tx) => postSalesInvoiceJournal(tx, sale.id));
  await prisma.$transaction((tx) => postSupplierInvoiceJournal(tx, purchase.id));
  const vatReturn = await prisma.$transaction((tx) => createVatReturn(tx, { periodStart: "2026-04-01", periodEnd: "2026-04-30" }, "maker"));
  assert.equal(Number(vatReturn.documentOutputVat), 150);
  assert.equal(Number(vatReturn.documentInputVat), 75);
  assert.equal(Number(vatReturn.netVatDue), 75);
  assert.equal(Number(vatReturn.variance), 0);
  assert.equal(vatReturn.lines.length, 2);
  const filed = await prisma.$transaction((tx) => fileVatReturn(tx, vatReturn.id, "checker"));
  assert.equal(filed.status, "FILED");
  assert.equal(Number(filed.filingJournal.totalDebit), 150);
  assert.equal(Number(filed.filingJournal.totalCredit), 150);
  const before = Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance);
  const settled = await prisma.$transaction((tx) => settleVatReturn(tx, vatReturn.id, bankId, "2026-09-19", "cashier"));
  assert.equal(settled.status, "SETTLED");
  assert.equal(Number(settled.settlementJournal.totalDebit), 75);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance), before - 75);
  assert.equal(await prisma.bankTransaction.count({ where: { referenceType: "VAT_RETURN_SETTLEMENT", referenceId: vatReturn.id } }), 1);
});

test("الإقرار ذو مستند غير مرحل يظهر فرقًا ويمنع الاعتماد", async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  await prisma.sale.create({ data: { invoiceNumber: `VAT-U-${suffix}`, invoiceDate: new Date("2026-05-10"), partyId: customerId, status: "COMPLETED", subtotal: 100, vatAmount: 15, totalAmount: 115 } });
  const vatReturn = await prisma.$transaction((tx) => createVatReturn(tx, { periodStart: "2026-05-01", periodEnd: "2026-05-31" }));
  assert.equal(Number(vatReturn.variance), 15);
  await assert.rejects(prisma.$transaction((tx) => fileVatReturn(tx, vatReturn.id)), /لا يمكن اعتماد الإقرار/);
});
