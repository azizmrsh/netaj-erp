import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { savePartner, createProfitDistribution, postProfitDistribution, partnerOverview } from "../lib/partners.ts";
import { ensureFinanceFoundation } from "../lib/finance.ts";
import { createBalancedJournal } from "../lib/accounting.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-partners-regression-"));
const databasePath = join(directory, "partners.db");
copyFileSync("prisma/netaj.db", databasePath);
process.env.DATABASE_URL = `file:${databasePath}`;
const { prisma } = await import("../lib/prisma.ts");
const currentDate = new Date().toISOString().slice(0, 10);
const accounts = {};
let partnerA, partnerB, draft;
const transaction = task => prisma.$transaction(task);
before(async () => {
  await transaction(tx => ensureFinanceFoundation(tx));
  await prisma.companyConfiguration.deleteMany({ where: { category: { in: ["PARTNERS", "PARTNER_DISTRIBUTIONS"] } } });
  for (const [key, type] of [["currentA", "EQUITY"], ["capitalA", "EQUITY"], ["currentB", "LIABILITY"], ["capitalB", "EQUITY"], ["retained", "EQUITY"], ["cash", "ASSET"], ["spare", "EQUITY"], ["spareCapital", "EQUITY"]]) accounts[key] = await prisma.account.create({ data: { code: `PARTNER-REG-${key}`, nameAr: key, accountType: type } });
  await prisma.accountingMapping.update({ where: { key: "RETAINED_EARNINGS" }, data: { accountId: accounts.retained.id } });
  await transaction(tx => createBalancedJournal(tx, { entryDate: new Date(`${currentDate}T00:00:00Z`), description: "أرباح محتجزة اختبار", referenceType: "PARTNER_REGRESSION_SEED", referenceId: accounts.retained.id, referenceNumber: "PARTNER-SEED", lines: [{ accountId: accounts.cash.id, debit: 1000 }, { accountId: accounts.retained.id, credit: 1000 }] }));
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("تعريف الشركاء مستقل عن العملاء ويتحقق من الحسابات والنسب", async () => {
  partnerA = await transaction(tx => savePartner(tx, { code: "PART-A", name: "شريك أ", currentAccountId: accounts.currentA.id, capitalAccountId: accounts.capitalA.id, ownershipPercent: 60 }, "admin"));
  await assert.rejects(transaction(tx => savePartner(tx, { code: "PART-B", name: "شريك ب", currentAccountId: accounts.currentB.id, capitalAccountId: accounts.capitalB.id, ownershipPercent: 40 }, "admin")), /اعتمد صراحة/);
  partnerB = await transaction(tx => savePartner(tx, { code: "PART-B", name: "شريك ب", currentAccountId: accounts.currentB.id, capitalAccountId: accounts.capitalB.id, ownershipPercent: 40, liabilityCurrentApproved: true }, "admin"));
  await assert.rejects(transaction(tx => savePartner(tx, { code: "PART-C", name: "شريك ج", currentAccountId: accounts.spare.id, capitalAccountId: accounts.spareCapital.id, ownershipPercent: 1 }, "admin")), /يتجاوز 100/);
  await assert.rejects(transaction(tx => savePartner(tx, { code: "PART-C", name: "شريك ج", currentAccountId: accounts.currentA.id, capitalAccountId: accounts.spareCapital.id, ownershipPercent: 0 }, "admin")), /مرتبط بشريك آخر/);
  await assert.rejects(transaction(tx => savePartner(tx, { code: "PART-C", name: "شريك ج", currentAccountId: accounts.cash.id, capitalAccountId: accounts.spareCapital.id, ownershipPercent: 0 }, "admin")), /التصنيف المحاسبي/);
});

test("المسودة تحتفظ بالأنصبة والهللات وترفض توزيع رأس المال أو أكثر من الأرباح", async () => {
  await assert.rejects(transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.capitalA.id, amount: 1, distributionDate: currentDate, decisionNumber: "WRONG" }, "maker")), /حساب الأرباح المحتجزة/);
  await assert.rejects(transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.retained.id, amount: 1001, distributionDate: currentDate, decisionNumber: "EXCESS" }, "maker")), /يتجاوز رصيد/);
  draft = await transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.retained.id, amount: 123.45, distributionDate: currentDate, decisionNumber: "DEC-001" }, "maker"));
  assert.equal(draft.status, "DRAFT");
  assert.equal(draft.lines[0].amount, "74.07");
  assert.equal(draft.lines[1].amount, "49.38");
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "PARTNER_PROFIT_DISTRIBUTION", referenceId: draft.id } }), 0);
});

test("اعتماد التوزيع يرحّل مرة واحدة ويطابق كشف الشركاء والأرباح المتبقية", async () => {
  const posted = await transaction(tx => postProfitDistribution(tx, draft.id, "approver"));
  const repeated = await transaction(tx => postProfitDistribution(tx, draft.id, "approver"));
  assert.equal(posted.journalEntryId, repeated.journalEntryId);
  assert.equal(posted.status, "POSTED");
  assert.equal(posted.postedBy, "approver");
  const journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: posted.journalEntryId }, include: { lines: true } });
  assert.equal(Number(journal.totalDebit), 123.45);
  assert.equal(Number(journal.totalCredit), 123.45);
  assert.equal(journal.lines.length, 3);
  const overview = await transaction(tx => partnerOverview(tx, new URLSearchParams({ to: currentDate })));
  assert.equal(overview.partners.find(row => row.id === partnerA.id).closingBalance, 74.07);
  assert.equal(overview.partners.find(row => row.id === partnerB.id).closingBalance, 49.38);
  assert.equal(overview.sources[0].available, 876.55);
  assert.equal(await prisma.auditLog.count({ where: { entityType: "PARTNER_DISTRIBUTION", entityId: draft.id, action: "PARTNER_DISTRIBUTION_POST" } }), 1);
  await assert.rejects(transaction(tx => savePartner(tx, { ...partnerA, currentAccountId: accounts.spare.id }, "admin")), /لها حركات/);
});

test("رصيد التوزيع يعاد التحقق منه وقت الاعتماد ولا يسمح بتجاوز الرصيد عبر مسودتين", async () => {
  const first = await transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.retained.id, amount: 600, distributionDate: currentDate, decisionNumber: "DEC-002" }, "maker"));
  const second = await transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.retained.id, amount: 600, distributionDate: currentDate, decisionNumber: "DEC-003" }, "maker"));
  await transaction(tx => postProfitDistribution(tx, first.id, "approver"));
  await assert.rejects(transaction(tx => postProfitDistribution(tx, second.id, "approver")), /رصيد الأرباح المحتجزة تغيّر/);
  const record = await prisma.companyConfiguration.findUniqueOrThrow({ where: { id: second.id } });
  assert.equal(JSON.parse(record.valueJson).status, "DRAFT");
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "PARTNER_PROFIT_DISTRIBUTION", referenceId: second.id } }), 0);
});

test("توزيع الهللة الواحدة لا ينشئ فروق تقريب أو قيودًا صفرية", async () => {
  const tiny = await transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.retained.id, amount: 0.01, distributionDate: currentDate, decisionNumber: "DEC-CENT" }, "maker"));
  assert.deepEqual(tiny.lines.map(row => row.amount), ["0.01", "0.00"]);
  const posted = await transaction(tx => postProfitDistribution(tx, tiny.id, "approver"));
  const journal = await prisma.journalEntry.findUniqueOrThrow({ where: { id: posted.journalEntryId }, include: { lines: true } });
  assert.equal(journal.lines.length, 2);
  assert.equal(Number(journal.totalCredit), 0.01);
});

test("كشف الشريك يحتفظ بالحركات المستوردة بالكود ولا يفقد قيودًا معكوسة تاريخيًا", async () => {
  const before = await transaction(tx => partnerOverview(tx, new URLSearchParams({ to: currentDate })));
  const oldBalance = before.partners.find(row => row.id === partnerA.id).closingBalance;
  const entry = await transaction(tx => createBalancedJournal(tx, { entryDate: new Date(`${currentDate}T00:00:00Z`), description: "حركة مستوردة", referenceType: "PARTNER_REG_LEGACY", referenceId: partnerA.id, lines: [{ accountId: accounts.cash.id, debit: 37.89 }, { accountId: accounts.currentA.id, credit: 7.89 }, { accountId: accounts.capitalA.id, credit: 30 }] }));
  await prisma.journalEntryLine.updateMany({ where: { journalEntryId: entry.id }, data: { accountId: null } });
  await prisma.journalEntry.update({ where: { id: entry.id }, data: { status: "REVERSED" } });
  const overview = await transaction(tx => partnerOverview(tx, new URLSearchParams({ to: currentDate })));
  const partner = overview.partners.find(row => row.id === partnerA.id);
  assert.equal(partner.capitalBalance, 30);
  assert.equal(Number((partner.closingBalance - oldBalance).toFixed(2)), 7.89);
  assert.ok(partner.movements.some(row => row.journalEntryId === entry.id && row.credit === 7.89));
});

test("الفترة المقفلة تمنع توزيع الأرباح بلا أثر جزئي", async () => {
  const blocked = await transaction(tx => createProfitDistribution(tx, { sourceAccountId: accounts.retained.id, amount: 1, distributionDate: currentDate, decisionNumber: "DEC-CLOSED" }, "maker"));
  const date = new Date(`${currentDate}T12:00:00Z`);
  const period = await prisma.accountingPeriod.findFirstOrThrow({ where: { startDate: { lte: date }, endDate: { gte: date } } });
  await prisma.accountingPeriod.update({ where: { id: period.id }, data: { status: "CLOSED" } });
  await assert.rejects(transaction(tx => postProfitDistribution(tx, blocked.id, "approver")), /الفترة المحاسبية مغلقة/);
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "PARTNER_PROFIT_DISTRIBUTION", referenceId: blocked.id } }), 0);
});
