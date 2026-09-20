import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { assertOpenAccountingPeriod } from "../lib/accounting.ts";
import { createAndPostExpense, createAndPostRevenue, createBankAccount, ensureFinanceFoundation } from "../lib/finance.ts";
import { closeFiscalPeriod, closeFiscalYear, currentFiscalCalendar, reopenFiscalPeriod, reopenFiscalYear } from "../lib/fiscal-close.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-fiscal-close-test-"));
const databasePath = join(directory, "fiscal-close.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
let calendar, currentPeriod;

before(async () => {
  await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
  // Production snapshots may legitimately contain draft VAT returns. The
  // fiscal-close test isolates its own blocker instead of mutating production.
  await prisma.vatReturn.updateMany({ where: { status: "DRAFT" }, data: { status: "FILED" } });
  calendar = await prisma.$transaction((tx) => currentFiscalCalendar(tx));
  currentPeriod = calendar.periods.find((period) => period.startDate <= new Date() && period.endDate >= new Date());
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("التقويم المالي ينشئ سنة واثنتي عشرة فترة للشركة الحالية", () => {
  assert.equal(calendar.periods.length, 12);
  assert.ok(currentPeriod);
  assert.equal(calendar.companyId, 1);
});

test("إقفال الفترة يمنع العناصر المعلقة ثم يمنع الترحيل وإعادة الفتح تتطلب سببًا", async () => {
  const draft = await prisma.journalEntry.create({ data: { entryNumber: `DRAFT-${Date.now()}`, entryDate: currentPeriod.startDate, status: "DRAFT" } });
  await assert.rejects(prisma.$transaction((tx) => closeFiscalPeriod(tx, currentPeriod.id, "closer")), /العناصر المعلقة/);
  await prisma.journalEntry.update({ where: { id: draft.id }, data: { status: "POSTED", postedAt: new Date() } });
  const closed = await prisma.$transaction((tx) => closeFiscalPeriod(tx, currentPeriod.id, "closer"));
  assert.equal(closed.status, "CLOSED");
  await assert.rejects(prisma.$transaction((tx) => assertOpenAccountingPeriod(tx, currentPeriod.startDate)), /الفترة المحاسبية مغلقة/);
  await assert.rejects(prisma.$transaction((tx) => reopenFiscalPeriod(tx, currentPeriod.id, "")), /سبب إعادة فتح/);
  const reopened = await prisma.$transaction((tx) => reopenFiscalPeriod(tx, currentPeriod.id, "تصحيح قيد مثبت", "controller"));
  assert.equal(reopened.status, "OPEN");
  await prisma.$transaction((tx) => assertOpenAccountingPeriod(tx, currentPeriod.startDate));
});

test("إقفال السنة يصفر الإيرادات والمصروفات إلى الأرباح المبقاة بقيد متوازن ويمكن عكسه", async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const bank = await prisma.$transaction((tx) => createBankAccount(tx, { name: `بنك إقفال ${suffix}`, openingBalance: 1000 }));
  const [expenseCategory, revenueCategory] = await Promise.all([prisma.expenseCategory.findFirstOrThrow(), prisma.revenueCategory.findFirstOrThrow()]);
  const transactionDate = new Date();
  await prisma.$transaction((tx) => createAndPostRevenue(tx, { revenueDate: transactionDate.toISOString(), categoryId: revenueCategory.id, bankAccountId: bank.id, amountBeforeVat: 200, vatAmount: 0, description: "إيراد إقفال" }));
  await prisma.$transaction((tx) => createAndPostExpense(tx, { expenseDate: transactionDate.toISOString(), categoryId: expenseCategory.id, bankAccountId: bank.id, amountBeforeVat: 80, vatAmount: 0, description: "مصروف إقفال" }));
  const fresh = await prisma.$transaction((tx) => currentFiscalCalendar(tx));
  for (const period of fresh.periods.slice(0, -1)) {
    if (period.status === "OPEN") await prisma.$transaction((tx) => closeFiscalPeriod(tx, period.id, "year-controller"));
  }
  const closed = await prisma.$transaction((tx) => closeFiscalYear(tx, fresh.id, "year-controller"));
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.periods.every((period) => period.status === "CLOSED"), true);
  assert.ok(closed.closingJournal);
  assert.equal(Number(closed.closingJournal.totalDebit), Number(closed.closingJournal.totalCredit));
  assert.equal(closed.closingJournal.lines.some((line) => line.accountName === "الأرباح المبقاة"), true);
  await assert.rejects(prisma.$transaction((tx) => reopenFiscalYear(tx, fresh.id, "")), /سبب إعادة فتح/);
  const reopened = await prisma.$transaction((tx) => reopenFiscalYear(tx, fresh.id, "تصحيح سنوي معتمد", "controller"));
  assert.equal(reopened.status, "OPEN");
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: { startsWith: "FISCAL_YEAR_REOPEN_" }, referenceId: fresh.id } }), 1);
});
