import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ensureAccountingFoundation } from "../lib/accounting.ts";
import { scopedModels, runWithDataScope } from "../lib/data-scope.ts";
import { createRecurringJournal, executeRecurringJournal, nextRecurringDate, recordRecurringFailure, setRecurringJournalStatus } from "../lib/recurring-journals.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-recurring-tests-"));
const databasePath = join(directory, "recurring.db");
let prisma, debitId, creditId, due;
const actor = "recurring-test";
const create = (overrides = {}) => prisma.$transaction(tx => createRecurringJournal(tx, { name: "إيجار دوري", description: "إثبات استحقاق إيجار", startDate: due.toISOString().slice(0, 10), frequency: "MONTHLY", lines: [{ accountId: debitId, debit: "100.25" }, { accountId: creditId, credit: "100.25" }], ...overrides }, actor));
before(async () => {
  const source = new Database("prisma/netaj.db", { readonly: true });
  await source.backup(databasePath); source.close();
  const copy = new Database(databasePath);
  if (!copy.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='RecurringJournal'").get()) copy.exec(readFileSync("prisma/migrations/20260921190000_recurring_journals/migration.sql", "utf8"));
  if (!copy.prepare('PRAGMA table_info("JournalEntry")').all().some(column => column.name === "branchId")) copy.exec(readFileSync("prisma/migrations/20260921192000_journal_branch/migration.sql", "utf8"));
  copy.close();
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  await prisma.$transaction(tx => ensureAccountingFoundation(tx));
  due = new Date(); due.setUTCHours(0, 0, 0, 0);
  const suffix = Date.now();
  debitId = (await prisma.account.create({ data: { code: `RJ-D-${suffix}`, nameAr: "مصروف اختبار دوري", accountType: "EXPENSE" } })).id;
  creditId = (await prisma.account.create({ data: { code: `RJ-C-${suffix}`, nameAr: "استحقاق اختبار دوري", accountType: "LIABILITY" } })).id;
});
after(async () => { await prisma?.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("التكرار الشهري يحافظ على يوم 31 بعد فبراير والربع والسنة", () => {
  const feb = nextRecurringDate(new Date("2028-01-31T00:00:00Z"), "MONTHLY", 31);
  assert.equal(feb.toISOString().slice(0, 10), "2028-02-29");
  assert.equal(nextRecurringDate(feb, "MONTHLY", 31).toISOString().slice(0, 10), "2028-03-31");
  assert.equal(nextRecurringDate(new Date("2026-01-31T00:00:00Z"), "QUARTERLY", 31).toISOString().slice(0, 10), "2026-04-30");
  assert.equal(nextRecurringDate(feb, "YEARLY", 29).toISOString().slice(0, 10), "2029-02-28");
});
test("يرفض القيد غير المتوازن والطرفين في نفس السطر والقيمة غير المحدودة", async () => {
  for (const lines of [
    [{ accountId: debitId, debit: 100 }, { accountId: creditId, credit: 99 }],
    [{ accountId: debitId, debit: 100, credit: 100 }, { accountId: creditId, debit: 100, credit: 100 }],
    [{ accountId: debitId, debit: "Infinity" }, { accountId: creditId, credit: "Infinity" }],
  ]) await assert.rejects(create({ lines }));
});
test("لا يرحل المسودة ثم ينشئ قيدًا واحدًا عند تكرار التنفيذ لنفس الموعد", async () => {
  const template = await create();
  await assert.rejects(prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor)), /اعتماد/);
  await prisma.$transaction(tx => setRecurringJournalStatus(tx, template.id, "ACTIVATE", actor));
  const first = await prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor));
  const second = await prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor));
  assert.equal(first.journalEntryId, second.journalEntryId); assert.equal(second.duplicate, true);
  const journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: first.journalEntryId }, include: { lines: true } });
  assert.equal(Number(journal.totalDebit), 100.25); assert.equal(Number(journal.totalCredit), 100.25);
  assert.equal(journal.referenceType, "RECURRING_JOURNAL"); assert.equal(journal.lines.length, 2);
  assert.equal((await prisma.recurringJournal.findUniqueOrThrow({ where: { id: template.id } })).executionCount, 1);
  assert.equal(await prisma.recurringJournalRun.count({ where: { recurringJournalId: template.id } }), 1);
});
test("الإيقاف يمنع الترحيل والمواعيد المستقبلية لا تنفذ مبكرًا", async () => {
  const future = new Date(due.getTime() + 86_400_000);
  const template = await create({ frequency: "DAILY", startDate: future.toISOString().slice(0, 10) });
  await prisma.$transaction(tx => setRecurringJournalStatus(tx, template.id, "ACTIVATE", actor));
  await assert.rejects(prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor)), /لم يحن/);
  await prisma.$transaction(tx => setRecurringJournalStatus(tx, template.id, "PAUSE", actor));
  await assert.rejects(prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor, future)), /اعتماد/);
});
test("الفترة المغلقة لا تترك قيدًا جزئيًا وتحفظ فشل التنفيذ خارج المعاملة", async () => {
  const template = await create({ endDate: due.toISOString().slice(0, 10) });
  await prisma.$transaction(tx => setRecurringJournalStatus(tx, template.id, "ACTIVATE", actor));
  const period = await prisma.accountingPeriod.findFirstOrThrow({ where: { startDate: { lte: due }, endDate: { gte: due } } });
  await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "CLOSED" } });
  let failure;
  try { await prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor)); } catch (error) { failure = error; }
  assert.ok(failure); assert.equal(await prisma.recurringJournalRun.count({ where: { recurringJournalId: template.id } }), 0);
  await prisma.$transaction(tx => recordRecurringFailure(tx, template.id, template.nextRunAt, failure, actor));
  const failed = await prisma.recurringJournalRun.findFirstOrThrow({ where: { recurringJournalId: template.id } });
  assert.equal(failed.status, "FAILED"); assert.equal(failed.journalEntryId, null);
  await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: period.status } });
  const result = await prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor));
  assert.equal(result.id, failed.id); assert.equal(result.attempts, 2);
  const complete = await prisma.recurringJournal.findUniqueOrThrow({ where: { id: template.id } });
  assert.equal(complete.status, "COMPLETED"); assert.equal(complete.nextRunAt, null);
});
test("نطاق الشركة يمنع استعمال حساب آخر أو تنفيذ قالب آخر", async () => {
  assert.ok(["RecurringJournal", "RecurringJournalLine", "RecurringJournalRun"].every(model => scopedModels.has(model)));
  const template = await create();
  await assert.rejects(runWithDataScope({ tenantId: 777, companyId: 777 }, () => prisma.$transaction(tx => executeRecurringJournal(tx, template.id, template.nextRunAt, actor))), /غير موجود/);
  const foreign = await prisma.account.create({ data: { tenantId: 777, companyId: 777, code: `RJ-F-${Date.now()}`, nameAr: "حساب شركة أخرى", accountType: "EXPENSE" } });
  await assert.rejects(create({ lines: [{ accountId: foreign.id, debit: 100 }, { accountId: creditId, credit: 100 }] }), /شركة أخرى/);
});
