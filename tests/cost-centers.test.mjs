import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { costCenterReport, costCenterWorkspace, saveCostCenter, validateCostCenterForPosting } from "../lib/cost-centers.ts";
import { saveAsset } from "../lib/assets.ts";
import { ensureAccountingFoundation } from "../lib/accounting.ts";
import { runWithDataScope } from "../lib/data-scope.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-cost-centers-"));
const database = join(directory, "test.db");
copyFileSync("prisma/netaj.db", database);
const migrated = new Database(database);
if (!migrated.pragma('table_info("JournalEntry")').some(row => row.name === "branchId")) migrated.exec(readFileSync("prisma/migrations/20260921192000_journal_branch/migration.sql", "utf8"));
migrated.close();
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
const run = operation => runWithDataScope({ tenantId: 1, companyId: 1 }, () => prisma.$transaction(operation));
let parent, child, second, revenue, expense, offset;
before(async () => {
  await run(ensureAccountingFoundation);
  parent = await run(tx => saveCostCenter(tx, { code: `CC-P-${suffix}`, nameAr: "مركز رئيسي للاختبار", allowPosting: false }, "test"));
  child = await run(tx => saveCostCenter(tx, { code: `CC-C-${suffix}`, nameAr: "مركز حركة أول", parentId: parent.id }, "test"));
  second = await run(tx => saveCostCenter(tx, { code: `CC-D-${suffix}`, nameAr: "مركز حركة ثان", parentId: parent.id }, "test"));
  [revenue, expense, offset] = await Promise.all([
    prisma.account.create({ data: { code: `CC-R-${suffix}`, nameAr: "إيراد اختبار", accountType: "REVENUE" } }),
    prisma.account.create({ data: { code: `CC-E-${suffix}`, nameAr: "مصروف اختبار", accountType: "EXPENSE" } }),
    prisma.account.create({ data: { code: `CC-A-${suffix}`, nameAr: "مقابل اختبار", accountType: "ASSET" } }),
  ]);
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("حفظ الشجرة فعليًا والمستوى وسجل التدقيق ومنع الدورات", async () => {
  const data = await run(costCenterWorkspace);
  assert.equal(data.rows.find(row => row.id === child.id).level, 2);
  assert.equal(data.rows.find(row => row.id === parent.id).childCount, 2);
  await assert.rejects(() => run(tx => saveCostCenter(tx, { id: parent.id, parentId: parent.id }, "test")), /بنفسه|بأحد فروعه/);
  await assert.rejects(() => run(tx => saveCostCenter(tx, { id: parent.id, allowPosting: true }, "test")), /رئيسيًا/);
  await assert.rejects(() => run(tx => saveCostCenter(tx, { id: child.id, code: "RENAMED" }, "test")), /ثابت/);
  const audit = await prisma.auditLog.findFirst({ where: { entityType: "COST_CENTER", entityId: child.id } });
  assert.ok(audit);
});

test("منع ترحيل المركز الرئيسي والموقوف والمركز من شركة أخرى", async () => {
  await assert.rejects(() => run(tx => validateCostCenterForPosting(tx, { costCenterId: parent.id })), /رئيسي/);
  await assert.rejects(() => run(tx => saveCostCenter(tx, { id: parent.id, isActive: false }, "test")), /الفرعية/);
  await run(tx => saveCostCenter(tx, { id: second.id, isActive: false }, "test"));
  await assert.rejects(() => run(tx => validateCostCenterForPosting(tx, { costCenterId: second.id })), /غير نشط/);
  await run(tx => saveCostCenter(tx, { id: second.id, isActive: true }, "test"));
  assert.equal((await run(tx => validateCostCenterForPosting(tx, { costCenter: child.code }))).id, child.id);
  const company = await prisma.company.create({ data: { tenantId: 1, code: `CC-X-${suffix}`, legalNameAr: "شركة اختبار مستقلة" } });
  await assert.rejects(() => runWithDataScope({ tenantId: 1, companyId: company.id }, () => prisma.$transaction(tx => validateCostCenterForPosting(tx, { costCenterId: child.id }))), /الشركة الحالية/);
  await assert.rejects(() => run(tx => saveCostCenter(tx, { id: child.id, linkedEntityId: 987654321, centerType: "VEHICLE" }, "test")), /غير صالح/);
});

async function journal(label, date, center, account, debit, credit, status = "POSTED", legacy = false) {
  return prisma.journalEntry.create({ data: { entryNumber: `CC-${label}-${suffix}`, entryDate: new Date(date), status, totalDebit: debit || credit, totalCredit: debit || credit,
    lines: { create: [{ accountId: account.id, accountCode: account.code, accountName: account.nameAr, debit, credit, costCenterId: legacy ? null : center.id, costCenter: center.code }, { accountId: offset.id, accountCode: offset.code, accountName: offset.nameAr, debit: credit, credit: debit }] } } });
}
test("حركات الأستاذ الفعلية: افتتاحي وفترة وعكس ومقارنة دون مضاعفة الربط القديم والجديد", async () => {
  await journal("OPEN", "2026-08-01", child, expense, 25, 0);
  await journal("COST", "2026-09-01", child, expense, 100, 0);
  await journal("REVENUE", "2026-09-15", child, revenue, 0, 250, "POSTED", true);
  await journal("REVERSAL", "2026-09-16", child, expense, 0, 20);
  await journal("SECOND", "2026-09-30T23:59:59.000Z", second, expense, 40, 0);
  await journal("DRAFT", "2026-09-10", child, expense, 999, 0, "DRAFT");
  const report = await run(tx => costCenterReport(tx, new URLSearchParams({ centerId: String(parent.id), from: "2026-09-01", to: "2026-09-30" })));
  assert.equal(report.rows.length, 4);
  assert.deepEqual(report.totals, { opening: 25, debit: 140, credit: 270, closing: -105, revenue: 250, costs: 120, netProfit: 130 });
  assert.equal(report.comparison.find(row => row.id === child.id).netProfit, 170);
  assert.equal(report.comparison.find(row => row.id === second.id).netProfit, -40);
  const direct = await run(tx => costCenterReport(tx, new URLSearchParams({ centerId: String(parent.id), includeChildren: "false" })));
  assert.equal(direct.rows.length, 0);
  await assert.rejects(() => run(tx => costCenterReport(tx, new URLSearchParams({ from: "2026-02-31" }))), /التاريخ/);
  await assert.rejects(() => run(tx => costCenterReport(tx, new URLSearchParams({ from: "2026-10-01", to: "2026-09-01" }))), /بداية الفترة/);
});

test("إهلاك الأصل لا يتكرر في الشهر ولو اختلف اليوم ولا يسبق الاقتناء", async () => {
  const category = await run(tx => saveAsset(tx, { action: "CATEGORY", tenantId: 1, companyId: 1, code: `CC-DEP-${suffix}`, name: "فئة اختبار إهلاك", usefulLifeMonths: 10, assetAccountId: offset.id, depreciationExpenseAccountId: expense.id, accumulatedDepreciationAccountId: offset.id }, "test"));
  const asset = await run(tx => saveAsset(tx, { action: "ASSET", categoryId: category.id, name: "أصل اختبار شهري", acquisitionDate: "2026-09-01", acquisitionCost: 1000, residualValue: 100, costCenterId: child.id }, "test"));
  await assert.rejects(() => run(tx => saveAsset(tx, { action: "DEPRECIATE", id: asset.id, periodDate: "2026-08-31" }, "test")), /قبل تاريخ/);
  const entry = await run(tx => saveAsset(tx, { action: "DEPRECIATE", id: asset.id, periodDate: "2026-09-02" }, "test"));
  assert.equal(Number(entry.amount), 90);
  await assert.rejects(() => run(tx => saveAsset(tx, { action: "DEPRECIATE", id: asset.id, periodDate: "2026-09-29" }, "test")), /للشهر المحدد بالفعل/);
  const saved = await prisma.asset.findUniqueOrThrow({ where: { id: asset.id } });
  assert.equal(Number(saved.accumulatedDepreciation), 90);
  const posting = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "ASSET_DEPRECIATION", referenceId: entry.id }, include: { lines: true } });
  assert.equal(Number(posting.totalDebit), Number(posting.totalCredit));
  assert.ok(posting.lines.every(line => line.costCenterId === child.id));
});

test("القيد المعكوس يبقى مع عكسه وصافي الكسور النقدية دقيق", async () => {
  const center = await run(tx => saveCostCenter(tx, { code: `CC-ROUND-${suffix}`, nameAr: "مركز الكسور والعكس" }, "test"));
  await journal("FRAC1", "2026-09-03", center, expense, 0.1, 0);
  await journal("FRAC2", "2026-09-04", center, expense, 0.2, 0);
  await journal("ORIGINAL", "2026-09-05", center, expense, 70, 0, "REVERSED");
  await journal("OFFSET", "2026-09-06", center, expense, 0, 70);
  const report = await run(tx => costCenterReport(tx, new URLSearchParams({ centerId: String(center.id) })));
  assert.equal(report.rows.length, 4);
  assert.equal(report.totals.costs, 0.3);
  assert.equal(report.totals.closing, 0.3);
  assert.equal(report.totals.netProfit, -0.3);
});

test("تصنيف الحساب بالرمز للحركات القديمة بلا accountId يحفظ إيرادات ومصروفات المركز", async () => {
  const center = await run(tx => saveCostCenter(tx, { code: `CC-LEG-${suffix}`, nameAr: "مركز حركات تراثية" }, "test"));
  const first = await journal("LEGACY-REVENUE", "2026-09-01", center, revenue, 0, 300);
  const second = await journal("LEGACY-EXPENSE", "2026-09-02", center, expense, 80, 0);
  await prisma.journalEntryLine.updateMany({ where: { journalEntryId: { in: [first.id, second.id] }, costCenterId: center.id }, data: { accountId: null } });
  const report = await run(tx => costCenterReport(tx, new URLSearchParams({ centerId: String(center.id) })));
  assert.equal(report.totals.revenue, 300);
  assert.equal(report.totals.costs, 80);
  assert.equal(report.totals.netProfit, 220);
  assert.equal(report.comparison[0].netProfit, 220);
  const filtered = await run(tx => costCenterReport(tx, new URLSearchParams({ centerId: String(center.id), accountId: String(revenue.id) })));
  assert.equal(filtered.rows.length, 1);
  assert.equal(filtered.rows[0].accountType, "REVENUE");
  assert.equal(filtered.totals.revenue, 300);
  await assert.rejects(() => run(tx => costCenterReport(tx, new URLSearchParams({ accountId: "987654321" }))), /الشركة الحالية/);
});
