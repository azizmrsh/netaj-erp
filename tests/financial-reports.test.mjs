import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runWithDataScope } from "../lib/data-scope.ts";
import { toReportTable } from "../lib/financial-export.ts";
import { buildPrintableReportHtml } from "../lib/printable-report.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-report-regression-"));
const databasePath = join(directory, "reports.db");
copyFileSync("prisma/netaj.db", databasePath);
process.env.DATABASE_URL = `file:${databasePath}`;
const { prisma } = await import("../lib/prisma.ts");
const { trialBalance, statementReport, generalLedger, cashFlow, accountStatement, reportDates, sourceDocumentUrl, changesInEquity } = await import("../lib/financial-reports.ts");
const { loadFinancialReport } = await import("../lib/financial-report-loader.ts");
const scope = { tenantId: 970901, companyId: 1 };
const run = operation => runWithDataScope(scope, operation);
const accounts = {};
let center, branch;
const at = date => new Date(`${date}T12:00:00.000Z`);
const start = date => new Date(`${date}T00:00:00.000Z`);
const end = date => new Date(`${date}T23:59:59.999Z`);
let sequence = 0;
async function journal(date, lines, referenceType = null, status = "POSTED") {
  sequence += 1;
  return prisma.journalEntry.create({ data: { entryNumber: `REPORT-REG-${sequence}`, entryDate: at(date), referenceType, status,
    totalDebit: lines.reduce((sum, line) => sum + (line.debit ?? 0), 0), totalCredit: lines.reduce((sum, line) => sum + (line.credit ?? 0), 0),
    lines: { create: lines.map(line => ({ accountId: accounts[line.account]?.id ?? null, accountCode: accounts[line.account]?.code ?? line.account, accountName: accounts[line.account]?.nameAr ?? line.account,
      debit: line.debit ?? 0, credit: line.credit ?? 0, costCenterId: line.center ? center.id : null, costCenter: line.legacyCenter ? center.code : null,
      transactionDebit: line.transactionDebit ?? line.debit ?? 0, transactionCredit: line.transactionCredit ?? line.credit ?? 0, transactionCurrencyCode: line.currency ?? "SAR" })) } } });
}
before(async () => run(async () => {
  for (const [key, accountType] of [["cash", "ASSET"], ["cash2", "ASSET"], ["sales", "REVENUE"], ["expense", "EXPENSE"], ["capital", "EQUITY"], ["retained", "EQUITY"], ["asset", "ASSET"], ["loan", "LIABILITY"], ["zero", "ASSET"]]) {
    accounts[key] = await prisma.account.create({ data: { code: `REG-${key}`, nameAr: `حساب ${key}`, accountType } });
  }
  center = await prisma.costCenter.create({ data: { code: "REPORT-CC-REG", nameAr: "مركز اختبار التقارير" } });
  branch = await prisma.branch.create({ data: { companyId: scope.companyId, code: "REPORT-BR-REG", nameAr: "فرع اختبار التقارير" } });
  for (const name of ["cash", "cash2"]) await prisma.bankAccount.create({ data: { name, ledgerAccountId: accounts[name].id, currency: name === "cash2" ? "USD" : "SAR" } });
  await prisma.accountingMapping.create({ data: { key: "LOANS_PAYABLE", accountId: accounts.loan.id } });
  await prisma.assetCategory.create({ data: { code: "REPORT-ASSET-REG", name: "أصل اختبار", usefulLifeMonths: 60, assetAccountId: accounts.asset.id } });
  await journal("2025-01-01", [{ account: "cash", debit: 1000 }, { account: "capital", credit: 1000 }], "BANK_OPENING_BALANCE");
  await journal("2025-12-10", [{ account: "cash", debit: 200 }, { account: "sales", credit: 200 }]);
  await journal("2025-12-31", [{ account: "sales", debit: 200 }, { account: "retained", credit: 200 }], "FISCAL_YEAR_CLOSE_INCOME");
  await journal("2026-01-10", [{ account: "cash", debit: 100, center: true }, { account: "sales", credit: 100, center: true }]);
  await journal("2026-01-15", [{ account: "cash", debit: 900 }, { account: "sales", credit: 900 }], null, "DRAFT");
  await journal("2026-02-01", [{ account: "expense", debit: 25, legacyCenter: true }, { account: "cash", credit: 25, legacyCenter: true }]);
  await journal("2026-02-02", [{ account: "cash2", debit: 300 }, { account: "expense", debit: 5 }, { account: "cash", credit: 305 }], "BANK_TRANSFER");
  await journal("2026-02-03", [{ account: "asset", debit: 400 }, { account: "cash", credit: 400 }], "ASSET_ACQUISITION");
  await journal("2026-02-04", [{ account: "cash", debit: 500 }, { account: "loan", credit: 500 }]);
  await journal("2026-02-05", [{ account: "cash2", debit: 375, transactionDebit: 100, currency: "USD" }, { account: "sales", credit: 375, transactionCredit: 100, currency: "USD" }]);
  await journal("2026-02-06", [{ account: "cash2", debit: 10 }, { account: "sales", credit: 10 }], "FX_REVALUATION");
}));
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("ميزان المراجعة يحتفظ بالافتتاحي وحركة الفترة والإقفال ويستبعد المسودات", () => run(async () => {
  const result = await trialBalance(start("2026-01-01"), end("2026-01-31"));
  const cash = result.rows.find(row => row.accountId === accounts.cash.id);
  assert.equal(cash.openingDebit, 1200);
  assert.equal(cash.debit, 100);
  assert.equal(cash.closingDebit, 1300);
  assert.equal(result.totals.debit, 100);
  assert.equal(result.totals.credit, 100);
  assert.equal(result.balanced, true);
  const exported = toReportTable("trial-balance", result);
  assert.equal(exported.columns.length, 8);
  assert.equal(exported.rows.at(-1)[6], result.totals.closingDebit);
}));

test("قائمة الدخل تشمل القيود اليدوية بلا مرجع والمركز المالي يشمل السابق والمقفل", () => run(async () => {
  const report = await statementReport(start("2026-01-01"), end("2026-01-31"));
  assert.equal(report.profitAndLoss.netProfit, 100);
  assert.equal(report.balanceSheet.assets, 1300);
  assert.equal(report.balanceSheet.equity, 1200);
  assert.equal(report.balanceSheet.currentProfit, 100);
  assert.equal(report.balanceSheet.liabilitiesAndEquity, 1300);
  assert.equal(report.balanceSheet.balanced, true);
  const prior = await statementReport(start("2025-01-01"), end("2025-12-31"));
  assert.equal(prior.profitAndLoss.netProfit, 200);
  assert.equal(prior.balanceSheet.currentProfit, 0);
  assert.equal(prior.balanceSheet.equity, 1200);
}));

test("دفتر الأستاذ وكشف الحساب يحتفظان برصيد قبل بداية الفلتر لكل حساب", () => run(async () => {
  const params = new URLSearchParams({ from: "2026-01-01", to: "2026-01-31", accountId: String(accounts.cash.id) });
  const ledger = await generalLedger(params), statement = await accountStatement(params);
  assert.equal(ledger[0].openingBalance, 1200);
  assert.equal(ledger[0].balance, 1300);
  assert.equal(ledger[0].sourceUrl, `/accounting?tab=journals&journalId=${ledger[0].journalId}`);
  assert.equal(statement.openingBalance, 1200);
  assert.equal(statement.closingBalance, 1300);
  const allAccounts = await generalLedger(new URLSearchParams({ from: "2026-01-01", to: "2026-01-31" }));
  assert.equal(allAccounts.find(row => row.accountCode === accounts.sales.code).balance, -100);
}));

test("روابط المصادر تفتح المسار الفعلي ولا تخلط معرف الإشعار مع معرف الفاتورة", () => {
  assert.equal(sourceDocumentUrl("SALES_INVOICE", 31, 78), "/sales/31/print");
  assert.equal(sourceDocumentUrl("SUPPLIER_INVOICE", 32, 79), "/purchases/32/print");
  assert.equal(sourceDocumentUrl("CREDIT_DEBIT_NOTE", 31, 80), "/accounting?tab=journals&journalId=80");
  assert.equal(sourceDocumentUrl("FINANCIAL_VOUCHER_RECEIPT", 33, 81), "/accounting?tab=allVouchers&voucherId=33");
  assert.equal(sourceDocumentUrl("FX_REVALUATION", 34, 82), "/accounting?tab=journals&journalId=82");
  assert.equal(sourceDocumentUrl(null, null, 83), "/accounting?tab=journals&journalId=83");
  assert.equal(sourceDocumentUrl("UNKNOWN", 34), null);
});

test("فلتر مركز التكلفة يطابق الربط بالمعرّف والربط السابق بالكود", () => run(async () => {
  const report = await loadFinancialReport("trial-balance", new URLSearchParams({ from: "2026-01-01", to: "2026-02-28", costCenterId: String(center.id), includeZero: "1" }));
  assert.equal(report.totals.debit, 125);
  assert.equal(report.totals.credit, 125);
  assert.equal(report.rows.find(row => row.accountId === accounts.zero.id).balance, 0);
  const filtered = await statementReport(start("2026-01-01"), end("2026-02-28"), { costCenterId: center.id });
  assert.equal(filtered.profitAndLoss.netProfit, 75);
}));

test("التدفقات تعتمد العملة الأساسية وتلغي التحويل الداخلي وتفصل الرسوم والأصول والتمويل والصرف", () => run(async () => {
  const result = await cashFlow(start("2026-02-01"), end("2026-02-28"));
  assert.equal(result.totals.openingCash, 1300);
  assert.equal(result.totals.operating, 345);
  assert.equal(result.totals.investing, -400);
  assert.equal(result.totals.financing, 500);
  assert.equal(result.totals.inflow, 875);
  assert.equal(result.totals.outflow, 430);
  assert.equal(result.totals.net, 445);
  assert.equal(result.totals.exchangeDifferences, 10);
  assert.equal(result.totals.closingCash, 1755);
  assert.equal(result.totals.reconciliationDifference, 0);
  assert.equal(result.classificationComplete, true);
}));

test("الحساب غير المصنف لا يختفي من الميزان ولا يُصنّف نقده بالافتراض", () => run(async () => {
  await journal("2026-03-01", [{ account: "cash", debit: 70 }, { account: "UNMAPPED-REG", credit: 70 }]);
  const balance = await trialBalance(start("2026-03-01"), end("2026-03-31"));
  assert.equal(balance.unmappedAccountCount, 1);
  assert.equal(balance.balanced, true);
  const cash = await cashFlow(start("2026-03-01"), end("2026-03-31"));
  assert.equal(cash.classificationComplete, false);
  assert.equal(cash.totals.unclassified, 70);
  assert.equal(cash.totals.reconciliationDifference, 0);
}));

test("الفترة الخاطئة والفرع غير الموجود يرفضان بوضوح", () => run(async () => {
  assert.throws(() => reportDates(new URLSearchParams({ from: "2026-02-30" })), /تاريخ التقرير/);
  assert.throws(() => reportDates(new URLSearchParams({ from: "2026-03-01", to: "2026-01-01" })), /بداية الفترة/);
  await assert.rejects(loadFinancialReport("trial-balance", new URLSearchParams({ branchId: "99999999" })), /الفرع غير موجود/);
  await assert.rejects(loadFinancialReport("ar-aging", new URLSearchParams({ branchId: String(branch.id) })), /لا يدعم تصفية الفرع/);
}));

test("تقارير الفرع لا تنسب إليه القيود التاريخية غير المرتبطة وتحفظ التصفية في كشف الحساب", () => run(async () => {
  const entry = await journal("2026-08-01", [{ account: "cash", debit: 17.25 }, { account: "sales", credit: 17.25 }]);
  await prisma.journalEntry.update({ where: { id: entry.id }, data: { branchId: branch.id } });
  await journal("2026-08-02", [{ account: "cash", debit: 2.75 }, { account: "sales", credit: 2.75 }]);
  const params = new URLSearchParams({ from: "2026-08-01", to: "2026-08-31", branchId: String(branch.id) });
  const balance = await loadFinancialReport("trial-balance", params);
  assert.equal(balance.totals.debit, 17.25);
  assert.equal(balance.rows.find(row => row.accountId === accounts.cash.id).openingDebit, 0);
  assert.equal(balance.unassignedEntryCount, 0);
  assert.ok(balance.rows[0].drilldownUrl.includes(`branchId=${branch.id}`));
  const all = await trialBalance(start("2026-08-01"), end("2026-08-31"));
  assert.equal(all.totals.debit, 20);
  assert.ok(all.unassignedEntryCount > 0);
  const statement = await loadFinancialReport("profit-and-loss", params), cash = await loadFinancialReport("cash-flow", params);
  assert.equal(statement.profitAndLoss.netProfit, 17.25);
  assert.equal(cash.totals.openingCash, 0);
  assert.equal(cash.totals.net, 17.25);
  params.set("accountId", String(accounts.cash.id));
  assert.equal((await accountStatement(params)).closingBalance, 17.25);
  assert.equal((await generalLedger(params)).length, 1);
}));

test("تجميع مستوى الحساب لا يكرر أرصدة الأب والأبناء والتفاصيل تشمل الحسابات التابعة", () => run(async () => {
  const parent = await prisma.account.create({ data: { code: "REG-CASH-PARENT", nameAr: "إجمالي نقد الاختبار", accountType: "ASSET", allowPosting: false } });
  await prisma.account.update({ where: { id: accounts.cash.id }, data: { parentId: parent.id } });
  await prisma.account.update({ where: { id: accounts.cash2.id }, data: { parentId: parent.id } });
  const detailed = await trialBalance(start("2026-02-01"), end("2026-02-28"));
  const grouped = await trialBalance(start("2026-02-01"), end("2026-02-28"), false, { level: 1, includeZero: true });
  assert.equal(grouped.totals.debit, detailed.totals.debit);
  assert.equal(grouped.totals.credit, detailed.totals.credit);
  const row = grouped.rows.find(row => row.accountId === parent.id);
  assert.equal(row.balance, 1755);
  assert.ok(row.drilldownUrl.includes("includeChildren=1"));
  assert.equal(grouped.rows.filter(row => [accounts.cash.id, accounts.cash2.id].includes(row.accountId)).length, 0);
  const statement = await accountStatement(new URL(row.drilldownUrl, "http://localhost").searchParams);
  assert.equal(statement.closingBalance, row.balance);
  assert.equal(statement.account.id, parent.id);
  assert.equal(grouped.balanced, true);
}));

test("تغيرات حقوق الملكية تشمل الحركات القديمة المربوطة بالكود وتطابق المركز المالي", () => run(async () => {
  const entry = await journal("2026-09-01", [{ account: "cash", debit: 93.67 }, { account: "capital", credit: 93.67 }]);
  await prisma.journalEntryLine.updateMany({ where: { journalEntryId: entry.id }, data: { accountId: null } });
  const changes = await changesInEquity(start("2026-09-01"), end("2026-09-30"));
  const position = await statementReport(start("2026-09-01"), end("2026-09-30"));
  assert.equal(changes.rows.find(row => row.accountId === accounts.capital.id).directChanges, 93.67);
  assert.equal(changes.totals.closingEquity, position.balanceSheet.equity + position.balanceSheet.currentProfit);
}));

test("التجميع يحفظ الهللات وتطابق الفترات يتم دون تقريب SQLite", () => run(async () => {
  await journal("2026-04-01", [{ account: "cash", debit: 123.45 }, { account: "sales", credit: 123.45 }]);
  await journal("2026-04-02", [{ account: "cash", debit: 0.1 }, { account: "sales", credit: 0.1 }]);
  await journal("2026-04-03", [{ account: "cash", debit: 0.2 }, { account: "sales", credit: 0.2 }]);
  const balance = await trialBalance(start("2026-04-01"), end("2026-04-30"));
  assert.equal(balance.totals.debit, 123.75);
  assert.equal(balance.totals.credit, 123.75);
  assert.equal(balance.difference, 0);
  const flow = await cashFlow(start("2026-04-01"), end("2026-04-30"));
  assert.equal(flow.totals.net, 123.75);
  assert.equal(flow.totals.reconciliationDifference, 0);
}));

test("القيد المعكوس يبقى في تاريخه ويقابله العكس في تاريخه بلا مضاعفة الأثر", () => run(async () => {
  await journal("2026-05-01", [{ account: "cash", debit: 123 }, { account: "sales", credit: 123 }], "ORIGINAL_REVERSED", "REVERSED");
  await journal("2026-06-01", [{ account: "sales", debit: 123 }, { account: "cash", credit: 123 }], "REVERSAL");
  const before = await statementReport(start("2026-05-01"), end("2026-05-31"));
  const after = await statementReport(start("2026-05-01"), end("2026-06-30"));
  assert.equal(before.profitAndLoss.netProfit, 123);
  assert.equal(after.profitAndLoss.netProfit, 0);
  const flow = await cashFlow(start("2026-05-01"), end("2026-06-30"));
  assert.equal(flow.totals.net, 0);
  assert.equal(flow.totals.inflow, 123);
  assert.equal(flow.totals.outflow, 123);
  const statement = await accountStatement(new URLSearchParams({ accountId: String(accounts.cash.id), from: "2026-05-01", to: "2026-06-30" }));
  assert.equal(statement.closingBalance, statement.openingBalance);
  assert.equal(statement.rows.length, 2);
}));

test("التقرير المطبوع يحفظ العربية ويمنع تفسير أسماء الحسابات كـHTML", () => {
  const html = buildPrintableReportHtml({ title: "ميزان المراجعة", columns: ["اسم الحساب", "الرصيد"], rows: [["المصروفات <script>alert(1)</script>", 123.45]] });
  assert.ok(html.includes("المصروفات"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("123.45"));
  assert.ok(!html.includes("<img"));
});
