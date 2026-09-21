import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { currencySetupWorkspace, fxMappingDefinitions, saveCompanyCurrencySetup, saveCurrencyCatalog } from "../lib/currency-setup.ts";
import { exchangeRateAt, saveExchangeRate } from "../lib/currency.ts";
import { createBalancedJournal, ensureAccountingFoundation } from "../lib/accounting.ts";
import { runWithDataScope } from "../lib/data-scope.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-currency-setup-"));
const path = join(directory, "test.db");
copyFileSync("prisma/netaj.db", path);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${path}` }) });
const suffix = Date.now().toString(36).toUpperCase();
const scope = { tenantId: 1, companyId: 1 };
const run = operation => runWithDataScope(scope, () => prisma.$transaction(operation));
let admin, normal, gain, loss, otherCompany, foreignGain, currency;
before(async () => {
  await run(ensureAccountingFoundation);
  admin = await prisma.platformUser.create({ data: { email: `currency-admin-${suffix}@example.invalid`, name: "مسؤول عملات الاختبار" } });
  normal = await prisma.platformUser.create({ data: { email: `currency-normal-${suffix}@example.invalid`, name: "مستخدم الاختبار" } });
  await prisma.platformAdministrator.create({ data: { userId: admin.id, role: "PLATFORM_ADMIN" } });
  gain = await prisma.account.create({ data: { code: `FX-G-${suffix}`, nameAr: "أرباح عملة اختبار", accountType: "REVENUE" } });
  loss = await prisma.account.create({ data: { code: `FX-L-${suffix}`, nameAr: "خسائر عملة اختبار", accountType: "EXPENSE" } });
  otherCompany = await prisma.company.create({ data: { tenantId: 1, code: `FX-C-${suffix}`, legalNameAr: "شركة عملة اختبار" } });
  foreignGain = await prisma.account.create({ data: { companyId: otherCompany.id, code: `FX-X-${suffix}`, nameAr: "حساب شركة أخرى", accountType: "REVENUE" } });
  const existing = new Set((await prisma.currency.findMany()).map(row => row.code));
  const code = Intl.supportedValuesOf("currency").find(value => !existing.has(value));
  assert.ok(code, "ISO currency available for isolated test");
  currency = { code, nameAr: "عملة اختبار معتمدة", nameEn: "Test ISO currency", symbol: "¤", decimalPlaces: new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits, isActive: true };
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });
const mappings = () => Object.fromEntries(fxMappingDefinitions.map(row => [row.key, row.accountType === "REVENUE" ? gain.id : loss.id]));

test("تعريف العملات عالمي بصلاحية مسؤول منصة والتحقق من ISO وخاناته", async () => {
  await assert.rejects(() => run(tx => saveCurrencyCatalog(tx, currency, normal.id, true)), /مسؤول منصة/);
  await assert.rejects(() => run(tx => saveCurrencyCatalog(tx, { ...currency, code: "ZZZ" }, admin.id, true)), /ISO/);
  await assert.rejects(() => run(tx => saveCurrencyCatalog(tx, { ...currency, decimalPlaces: 4 }, admin.id, true)), /عدد الخانات/);
  const created = await run(tx => saveCurrencyCatalog(tx, currency, admin.id, true));
  assert.equal(created.code, currency.code);
  await assert.rejects(() => run(tx => saveCurrencyCatalog(tx, currency, admin.id, true)), /مسجل بالفعل/);
  const updated = await run(tx => saveCurrencyCatalog(tx, { ...currency, nameAr: "عملة اختبار معدلة", isActive: false }, admin.id));
  assert.equal(updated.isActive, false);
  await run(tx => saveCurrencyCatalog(tx, currency, admin.id));
  assert.ok(await prisma.auditLog.findFirst({ where: { entityType: "CURRENCY_CATALOG", metadata: { contains: currency.code } } }));
});

test("لا يمكن إيقاف عملة وظيفية أو تغييرها بعد المعاملات", async () => {
  const workspace = await run(currencySetupWorkspace);
  assert.equal(workspace.baseLocked, true);
  const base = workspace.currencies.find(row => row.code === workspace.company.baseCurrencyCode);
  await assert.rejects(() => run(tx => saveCurrencyCatalog(tx, { ...base, isActive: false }, admin.id)), /عملة وظيفية/);
  await assert.rejects(() => run(tx => saveCompanyCurrencySetup(tx, { baseCurrencyCode: currency.code, mappings: mappings() }, admin.id)), /بعد وجود قيود/);
});

test("حسابات فروق الصرف تمنع النوع أو الشركة الخطأ وتستخدم في الترحيل فعليًا", async () => {
  await assert.rejects(() => run(tx => saveCompanyCurrencySetup(tx, { mappings: { ...mappings(), REALIZED_FX_GAIN: loss.id } }, admin.id)), /حساب حركة نشطًا من نوع/);
  await assert.rejects(() => run(tx => saveCompanyCurrencySetup(tx, { mappings: { ...mappings(), REALIZED_FX_GAIN: foreignGain.id } }, admin.id)), /تابعًا للشركة/);
  const result = await run(tx => saveCompanyCurrencySetup(tx, { mappings: mappings() }, admin.id));
  assert.equal(result.mappings.find(row => row.key === "REALIZED_FX_GAIN").accountId, gain.id);
  await run(ensureAccountingFoundation);
  const journal = await run(tx => createBalancedJournal(tx, { entryDate: new Date("2026-09-21"), referenceType: "FX_MAPPING_TEST", referenceId: gain.id, referenceNumber: suffix, description: "قيد اختبار الربط الحقيقي", lines: [{ mappingKey: "REALIZED_FX_LOSS", debit: 2.5 }, { mappingKey: "REALIZED_FX_GAIN", credit: 2.5 }] }));
  assert.equal(journal.lines.find(row => Number(row.credit) === 2.5).accountId, gain.id);
  assert.equal(journal.lines.find(row => Number(row.debit) === 2.5).accountId, loss.id);
});

test("الأسعار مرتبطة بالشركة والتاريخ وغير المحدود والتاريخ المستحيل ممنوعان", async () => {
  const input = { baseCurrencyCode: currency.code, quoteCurrencyCode: "SAR", rateDate: "2026-09-21", rate: "3.75" };
  await run(tx => saveExchangeRate(tx, input, admin.id));
  await run(tx => saveExchangeRate(tx, { ...input, rateDate: "2026-09-22T00:00:00.000Z", rate: "3.8" }, admin.id));
  assert.equal((await run(tx => exchangeRateAt(tx, currency.code, new Date("2026-09-21")))).rate.toString(), "3.75");
  await assert.rejects(() => run(tx => saveExchangeRate(tx, { ...input, rate: "Infinity" }, admin.id)), /غير صحيحة/);
  await assert.rejects(() => run(tx => saveExchangeRate(tx, { ...input, rate: "NaN" }, admin.id)), /غير صحيحة/);
  await assert.rejects(() => run(tx => saveExchangeRate(tx, { ...input, rate: "abc" }, admin.id)), /رقمًا موجبًا/);
  await assert.rejects(() => run(tx => saveExchangeRate(tx, { ...input, rateDate: "2026-02-31" }, admin.id)), /غير صحيحة/);
  await assert.rejects(() => runWithDataScope({ tenantId: 1, companyId: otherCompany.id }, () => prisma.$transaction(tx => exchangeRateAt(tx, currency.code, new Date("2026-09-21")))), /لا يوجد سعر صرف/);
  await run(tx => saveCurrencyCatalog(tx, { ...currency, isActive: false }, admin.id));
  await assert.rejects(() => run(tx => saveExchangeRate(tx, input, admin.id)), /غير نشطة/);
  assert.equal((await run(tx => exchangeRateAt(tx, currency.code, new Date("2026-09-21")))).rate.toString(), "3.75", "Historical postings keep their original reference even after catalog deactivation");
});
