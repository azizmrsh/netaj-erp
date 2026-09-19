import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createAndPostExpense, createAndPostRevenue, createBankAccount, createBankTransfer, createVoucher, ensureFinanceFoundation, postVoucher, cancelVoucher } from "../lib/finance.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-finance-test-"));
const databasePath = join(directory, "finance.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
let customerId, supplierId, saleId, purchaseId, bankId, secondBankId, expenseCategoryId, revenueCategoryId;

before(async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
  const customer = await prisma.party.create({ data: { nameAr: `عميل محاسبة ${suffix}`, isCustomer: true } });
  const supplier = await prisma.party.create({ data: { nameAr: `مورد محاسبة ${suffix}`, isSupplier: true } });
  const sale = await prisma.sale.create({ data: { invoiceNumber: `FIN-S-${suffix}`, partyId: customer.id, status: "COMPLETED", subtotal: 1000, vatAmount: 150, totalAmount: 1150, dueDate: new Date("2026-09-01") } });
  const purchase = await prisma.purchase.create({ data: { purchaseNumber: `FIN-P-${suffix}`, partyId: supplier.id, status: "COMPLETED", subtotal: 500, vatAmount: 75, totalAmount: 575, dueDate: new Date("2026-09-01") } });
  const bank = await prisma.$transaction((tx) => createBankAccount(tx, { name: `بنك اختبار ${suffix}`, openingBalance: 2000 }));
  const secondBank = await prisma.$transaction((tx) => createBankAccount(tx, { name: `بنك اختبار ثان ${suffix}`, openingBalance: 0 }));
  const [expenseCategory, revenueCategory] = await Promise.all([prisma.expenseCategory.findFirstOrThrow(), prisma.revenueCategory.findFirstOrThrow()]);
  customerId = customer.id; supplierId = supplier.id; saleId = sale.id; purchaseId = purchase.id; bankId = bank.id; secondBankId = secondBank.id;
  expenseCategoryId = expenseCategory.id; revenueCategoryId = revenueCategory.id;
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("الرصيد الافتتاحي للبنك ينشئ حركة وقيدًا متوازنًا", async () => {
  const bank = await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId }, include: { transactions: true } });
  assert.equal(Number(bank.currentBalance), 2000);
  assert.equal(bank.transactions.length, 1);
  const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "BANK_OPENING_BALANCE", referenceId: bankId } });
  assert.equal(Number(journal.totalDebit), Number(journal.totalCredit));
});

test("قبض عميل جزئي يحدّث البنك والذمم مرة واحدة", async () => {
  const voucher = await prisma.$transaction((tx) => createVoucher(tx, { voucherType: "CUSTOMER_RECEIPT", partyId: customerId, bankAccountId: bankId, amount: 400, allocations: [{ saleId, amount: 400 }] }));
  const posted = await prisma.$transaction((tx) => postVoucher(tx, voucher.id));
  const repeated = await prisma.$transaction((tx) => postVoucher(tx, voucher.id));
  assert.equal(posted.journalEntryId, repeated.journalEntryId);
  assert.equal(Number(posted.journalEntry.totalDebit), 400);
  assert.equal(Number(posted.journalEntry.totalCredit), 400);
  assert.equal(await prisma.bankTransaction.count({ where: { referenceType: "FINANCIAL_VOUCHER", referenceId: voucher.id } }), 1);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance), 2400);
});

test("يرفض تخصيص قبض أكبر من رصيد فاتورة العميل", async () => {
  await assert.rejects(prisma.$transaction((tx) => createVoucher(tx, { voucherType: "CUSTOMER_RECEIPT", partyId: customerId, bankAccountId: bankId, amount: 800, allocations: [{ saleId, amount: 800 }] })), /يتجاوز رصيد الفاتورة/);
});

test("دفع مورد يخصم البنك وينشئ قيد ذمم متوازن", async () => {
  const voucher = await prisma.$transaction((tx) => createVoucher(tx, { voucherType: "SUPPLIER_PAYMENT", partyId: supplierId, bankAccountId: bankId, amount: 275, allocations: [{ purchaseId, amount: 275 }] }));
  const posted = await prisma.$transaction((tx) => postVoucher(tx, voucher.id));
  assert.equal(Number(posted.journalEntry.totalDebit), 275);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance), 2125);
});

test("إلغاء سند مرحل يعكس القيد والحركة البنكية", async () => {
  const voucher = await prisma.$transaction((tx) => createVoucher(tx, { voucherType: "CUSTOMER_RECEIPT", partyId: customerId, bankAccountId: bankId, amount: 100, allocations: [{ saleId, amount: 100 }] }));
  await prisma.$transaction((tx) => postVoucher(tx, voucher.id));
  const before = Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance);
  await prisma.$transaction((tx) => cancelVoucher(tx, voucher.id, "اختبار العكس"));
  const afterBalance = Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance);
  assert.equal(afterBalance, before - 100);
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "FINANCIAL_VOUCHER_REVERSAL", referenceId: voucher.id } }), 1);
});

test("المصروف والإيراد يرحّلان الضريبة وحركة البنك", async () => {
  const expense = await prisma.$transaction((tx) => createAndPostExpense(tx, { expenseDate: "2026-09-19", categoryId: expenseCategoryId, bankAccountId: bankId, amountBeforeVat: 100, vatAmount: 15, description: "مصروف اختبار" }));
  const revenue = await prisma.$transaction((tx) => createAndPostRevenue(tx, { revenueDate: "2026-09-19", categoryId: revenueCategoryId, bankAccountId: bankId, amountBeforeVat: 200, vatAmount: 30, description: "إيراد اختبار" }));
  assert.equal(Number(expense.journalEntry.totalDebit), 115);
  assert.equal(Number(revenue.journalEntry.totalCredit), 230);
  assert.equal(await prisma.bankTransaction.count({ where: { referenceType: { in: ["EXPENSE", "REVENUE"] }, referenceId: { in: [expense.id, revenue.id] } } }), 2);
});

test("التحويل البنكي يثبت الطرفين والرسوم بقيد متوازن", async () => {
  const beforeSource = Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance);
  const transfer = await prisma.$transaction((tx) => createBankTransfer(tx, { transferDate: "2026-09-19", fromBankAccountId: bankId, toBankAccountId: secondBankId, amount: 300, fees: 5 }));
  assert.equal(Number(transfer.journalEntry.totalDebit), 305);
  assert.equal(Number(transfer.journalEntry.totalCredit), 305);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: bankId } })).currentBalance), beforeSource - 305);
  assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: secondBankId } })).currentBalance), 300);
  assert.equal(await prisma.bankTransaction.count({ where: { referenceId: transfer.id, referenceType: { in: ["BANK_TRANSFER_OUT", "BANK_TRANSFER_IN"] } } }), 2);
});

test("الفترة المغلقة تمنع الترحيل المالي", async () => {
  const period = await prisma.accountingPeriod.findFirstOrThrow({ where: { startDate: { lte: new Date("2026-09-19") }, endDate: { gte: new Date("2026-09-19") } } });
  await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "CLOSED" } });
  await assert.rejects(prisma.$transaction((tx) => createAndPostExpense(tx, { expenseDate: "2026-09-19", categoryId: expenseCategoryId, bankAccountId: bankId, amountBeforeVat: 10, vatAmount: 0, description: "يجب رفضه" })), /الفترة المحاسبية مغلقة/);
  await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "OPEN" } });
});
