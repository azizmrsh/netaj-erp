import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createBalancedJournal, ensureFiscalCalendar, postSalesInvoiceJournal } from "../lib/accounting.ts";
import { approveBudget, budgetVsActual, createBudget } from "../lib/budgeting.ts";
import { saveExchangeRate } from "../lib/currency.ts";
import { createPdf, createXlsx, toReportTable } from "../lib/financial-export.ts";
import { createAndPostExpense, createAndPostRevenue, createBankAccount, createVoucher, ensureFinanceFoundation, postVoucher } from "../lib/finance.ts";
import { createFxRevaluation, postFxRevaluation, reverseFxRevaluation } from "../lib/fx-revaluation.ts";
import { createCreditDebitNote, postCreditDebitNote } from "../lib/financial-adjustments.ts";
import { buildVatSnapshot } from "../lib/financial-reconciliation.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-financial-completion-test-"));
const databasePath = join(directory, "financial-completion.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
const suffix = Date.now().toString(36).toUpperCase();
let customer, usdBank, settledSale, openSale, fiscalYear, currentPeriod;

before(async () => {
  await prisma.currency.upsert({ where: { code: "USD" }, create: { code: "USD", nameAr: "دولار أمريكي", nameEn: "US Dollar", symbol: "$" }, update: { isActive: true } });
  await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
  await prisma.$transaction((tx) => saveExchangeRate(tx, { baseCurrencyCode: "USD", quoteCurrencyCode: "SAR", rateDate: "2026-09-01T00:00:00.000Z", rate: 3.75, source: "TEST" }, "tester"));
  await prisma.$transaction((tx) => saveExchangeRate(tx, { baseCurrencyCode: "USD", quoteCurrencyCode: "SAR", rateDate: "2026-09-19T00:00:00.000Z", rate: 3.8, source: "TEST" }, "tester"));
  customer = await prisma.party.create({ data: { nameAr: `عميل عملة ${suffix}`, isCustomer: true } });
  settledSale = await prisma.sale.create({ data: { invoiceNumber: `FX-S1-${suffix}`, invoiceDate: new Date("2026-09-01T10:00:00.000Z"), partyId: customer.id, status: "COMPLETED", currency: "USD", subtotal: 100, totalAmount: 100 } });
  openSale = await prisma.sale.create({ data: { invoiceNumber: `FX-S2-${suffix}`, invoiceDate: new Date("2026-09-01T10:00:00.000Z"), partyId: customer.id, status: "COMPLETED", currency: "USD", subtotal: 200, totalAmount: 200 } });
  await prisma.$transaction((tx) => postSalesInvoiceJournal(tx, settledSale.id));
  await prisma.$transaction((tx) => postSalesInvoiceJournal(tx, openSale.id));
  usdBank = await prisma.$transaction((tx) => createBankAccount(tx, { name: `USD Bank ${suffix}`, currency: "USD", openingBalance: 0 }));
  fiscalYear = await prisma.$transaction((tx) => ensureFiscalCalendar(tx, new Date("2026-09-19T00:00:00.000Z")));
  currentPeriod = fiscalYear.periods.find((period) => period.startDate <= new Date("2026-09-19T00:00:00.000Z") && period.endDate >= new Date("2026-09-19T00:00:00.000Z"));
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("فاتورة العملة الأجنبية تحفظ المبلغين وسعر الصرف التاريخي", async () => {
  const sale = await prisma.sale.findUniqueOrThrow({ where: { id: settledSale.id } });
  const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "SALES_INVOICE", referenceId: settledSale.id }, include: { lines: true } });
  assert.equal(Number(sale.exchangeRate), 3.75);
  assert.equal(Number(sale.functionalTotalAmount), 375);
  assert.equal(journal.transactionCurrencyCode, "USD");
  assert.equal(journal.functionalCurrencyCode, "SAR");
  assert.equal(Number(journal.totalTransactionDebit), 100);
  assert.equal(Number(journal.totalDebit), 375);
  assert.equal(Number(journal.lines.find((line) => line.partyId === customer.id).transactionDebit), 100);
});

test("سداد عملة أجنبية يثبت فرق الصرف المحقق دون إخلال بتوازن القيد", async () => {
  const voucher = await prisma.$transaction((tx) => createVoucher(tx, { voucherType: "CUSTOMER_RECEIPT", voucherDate: "2026-09-19T10:00:00.000Z", partyId: customer.id, bankAccountId: usdBank.id, currency: "USD", amount: 100, allocations: [{ saleId: settledSale.id, amount: 100 }] }));
  const posted = await prisma.$transaction((tx) => postVoucher(tx, voucher.id));
  assert.equal(Number(posted.functionalAmount), 380);
  assert.equal(Number(posted.allocations[0].carryingFunctionalAmount), 375);
  assert.equal(Number(posted.allocations[0].realizedFxAmount), 5);
  assert.equal(Number(posted.journalEntry.totalDebit), Number(posted.journalEntry.totalCredit));
  assert.equal(posted.journalEntry.lines.some((line) => line.accountName.includes("محققة") && Number(line.credit) === 5), true);
});

test("الإشعار والـVAT يحتفظان بقيمة العملة الوظيفية للفواتير الأجنبية", async () => {
  const sale = await prisma.sale.create({ data: { invoiceNumber: `FX-VAT-${suffix}`, invoiceDate: new Date("2026-09-01T11:00:00.000Z"), partyId: customer.id, status: "COMPLETED", currency: "USD", subtotal: 100, vatAmount: 15, totalAmount: 115 } });
  await prisma.$transaction((tx) => postSalesInvoiceJournal(tx, sale.id));
  const note = await prisma.$transaction((tx) => createCreditDebitNote(tx, { direction: "SALES", noteType: "CREDIT_NOTE", saleId: sale.id, noteDate: "2026-09-10", amountBeforeVat: 10, vatAmount: 1.5, reason: "Foreign credit" }, "tester"));
  const posted = await prisma.$transaction((tx) => postCreditDebitNote(tx, note.id, "tester"));
  assert.equal(posted.currency, "USD");
  assert.equal(Number(posted.functionalVatAmount), 5.63);
  assert.equal(Number(posted.journalEntry.totalDebit), 43.13);
  assert.equal(Number(posted.journalEntry.totalTransactionDebit), 11.5);
  const snapshot = await prisma.$transaction((tx) => buildVatSnapshot(tx, new Date("2026-09-01T00:00:00.000Z"), new Date("2026-09-30T23:59:59.999Z")));
  const noteLine = snapshot.lines.find((line) => line.sourceType === "CREDIT_DEBIT_NOTE" && line.sourceId === note.id);
  assert.equal(Number(noteLine.documentVat), -5.63);
  assert.equal(Number(noteLine.variance), 0);
});

test("المصروف والإيراد النقديان بعملة أجنبية يرحلان المبلغين", async () => {
  const [expenseCategory, revenueCategory] = await Promise.all([prisma.expenseCategory.findFirstOrThrow(), prisma.revenueCategory.findFirstOrThrow()]);
  const expense = await prisma.$transaction((tx) => createAndPostExpense(tx, { expenseDate: "2026-09-19", categoryId: expenseCategory.id, bankAccountId: usdBank.id, amountBeforeVat: 10, vatAmount: 1.5, description: "USD expense" }));
  const revenue = await prisma.$transaction((tx) => createAndPostRevenue(tx, { revenueDate: "2026-09-19", categoryId: revenueCategory.id, bankAccountId: usdBank.id, amountBeforeVat: 20, vatAmount: 3, description: "USD revenue" }));
  assert.equal(expense.currency, "USD");
  assert.equal(Number(expense.functionalTotalAmount), 43.7);
  assert.equal(Number(expense.journalEntry.totalTransactionDebit), 11.5);
  assert.equal(Number(expense.journalEntry.totalDebit), 43.7);
  assert.equal(Number(revenue.functionalTotalAmount), 87.4);
  assert.equal(Number(revenue.journalEntry.totalTransactionCredit), 23);
  assert.equal(Number(revenue.journalEntry.totalCredit), 87.4);
});

test("إعادة تقييم FX تنشئ قيدًا غير محقق ثم عكسًا في اليوم التالي", async () => {
  const draft = await prisma.$transaction((tx) => createFxRevaluation(tx, { currencyCode: "USD", revaluationDate: "2026-09-19T12:00:00.000Z" }, "tester"));
  const source = draft.lines.find((line) => line.sourceType === "SALE" && line.sourceId === openSale.id);
  assert.equal(Number(source.difference), 10);
  const posted = await prisma.$transaction((tx) => postFxRevaluation(tx, draft.id, "tester"));
  assert.equal(posted.status, "POSTED");
  assert.equal(Number(posted.journalEntry.totalDebit), Number(posted.journalEntry.totalCredit));
  const reversed = await prisma.$transaction((tx) => reverseFxRevaluation(tx, draft.id, "tester"));
  assert.equal(reversed.status, "REVERSED");
  assert.ok(reversed.reversalJournalEntryId);
});

test("الميزانية السنوية والشهرية تقارن الفعلي حسب الحساب والأبعاد مع drill-down", async () => {
  const expense = await prisma.account.create({ data: { code: `BUD-E-${suffix}`, nameAr: "مصروف ميزانية اختبار", accountType: "EXPENSE" } });
  const offset = await prisma.account.create({ data: { code: `BUD-O-${suffix}`, nameAr: "مقابل ميزانية اختبار", accountType: "ASSET" } });
  const center = await prisma.costCenter.findFirstOrThrow();
  await prisma.$transaction((tx) => createBalancedJournal(tx, { entryDate: new Date("2026-09-19T13:00:00.000Z"), description: "فعلي ميزانية", referenceType: "BUDGET_TEST_ACTUAL", referenceId: expense.id, referenceNumber: `BUD-A-${suffix}`, lines: [{ accountId: expense.id, debit: 60, costCenter: center.code, costCenterId: center.id, projectCode: "P-001" }, { accountId: offset.id, credit: 60, costCenter: center.code, costCenterId: center.id, projectCode: "P-001" }] }));
  const budget = await prisma.$transaction((tx) => createBudget(tx, { name: `ميزانية ${suffix}`, fiscalYearId: fiscalYear.id, lines: [{ accountId: expense.id, periodType: "MONTHLY", fiscalPeriodId: currentPeriod.id, costCenterId: center.id, projectCode: "P-001", amount: 100 }, { accountId: expense.id, periodType: "ANNUAL", amount: 1200 }] }, "tester"));
  await prisma.$transaction((tx) => approveBudget(tx, budget.id, "approver"));
  const report = await prisma.$transaction((tx) => budgetVsActual(tx, new URLSearchParams({ budgetId: String(budget.id), fiscalPeriodId: String(currentPeriod.id) })));
  const monthly = report.rows.find((row) => row.periodType === "MONTHLY");
  assert.equal(monthly.actual, 60);
  assert.equal(monthly.varianceAmount, -40);
  assert.equal(monthly.variancePercent, -40);
  assert.equal(monthly.transactions[0].referenceType, "BUDGET_TEST_ACTUAL");
});

test("Excel يحفظ عنوان التقرير العربي ومولد PDF القديم يحفظ نص ASCII", () => {
  const table = toReportTable("trial-balance", { rows: [{ code: "110100", name: "Accounts Receivable", debit: 375, credit: 0, balance: 375 }] }, "2026");
  // The financial-report endpoint uses structured Arabic print HTML. This
  // legacy low-level serializer is still tested only with its ASCII title.
  const xlsx = createXlsx(table), pdf = createPdf({ ...table, title: "Trial Balance" });
  assert.equal(xlsx.subarray(0, 2).toString(), "PK");
  assert.equal(xlsx.includes(Buffer.from("xl/worksheets/sheet1.xml")), true);
  assert.equal(xlsx.includes(Buffer.from("Financial Report")), true);
  assert.equal(xlsx.includes(Buffer.from("ميزان المراجعة")), true);
  assert.equal(pdf.subarray(0, 8).toString(), "%PDF-1.7");
  assert.equal(pdf.includes(Buffer.from("Trial Balance")), true);
  assert.equal(pdf.subarray(-5).toString(), "%%EOF");
});
