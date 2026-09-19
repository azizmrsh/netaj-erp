import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { dashboardDataSources, issueDocumentPresentation, listDesignWorkspace, publishTemplateVersion, saveDashboard, saveTemplateVersion, saveTheme } from "../lib/design.ts";
import { barcodeDataUrl, qrDataUrl } from "../lib/machine-codes.ts";
import { scopedModels, scopePrismaArgs } from "../lib/data-scope.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-design-test-")), database = join(directory, "design.db");
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
let publishedVersion;

before(async () => {
  const created = await prisma.$transaction((tx) => saveTemplateVersion(tx, { tenantId: 1, companyId: 1, code: `NOTE_${suffix}`, name: "قالب اختبار السند", documentType: "RECEIPT_NOTE", language: "BILINGUAL", isDefault: true, design: { page: { size: "A4" }, colors: { primary: "#112233", accent: "#445566" }, features: { qr: true, barcode: true }, terms: "شروط الإصدار الأول" } }, "test"));
  publishedVersion = await prisma.$transaction((tx) => publishTemplateVersion(tx, created.version.id, 1, "test"));
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("قالب المستند ينشئ إصدارات مستقلة ولا يعدل الإصدار المنشور", async () => {
  const second = await prisma.$transaction((tx) => saveTemplateVersion(tx, { tenantId: 1, companyId: 1, code: `NOTE_${suffix}`, name: "قالب اختبار السند", documentType: "RECEIPT_NOTE", design: { terms: "شروط الإصدار الثاني", colors: { primary: "#000000" } } }, "test"));
  assert.equal(second.version.version, 2); assert.equal(second.version.status, "DRAFT");
  const original = await prisma.documentTemplateVersion.findUniqueOrThrow({ where: { id: publishedVersion.id } });
  assert.equal(original.status, "PUBLISHED"); assert.equal(JSON.parse(original.designJson).terms, "شروط الإصدار الأول");
});

test("المستند الصادر يحتفظ بقالب وبيانات وchecksum ثابتة تاريخيًا", async () => {
  const entityId = Date.now();
  const first = await prisma.$transaction((tx) => issueDocumentPresentation(tx, { entityType: "TEST_DOCUMENT", entityId, documentType: "RECEIPT_NOTE", documentNumber: `DOC-${suffix}`, data: { amount: 125, party: "عميل" } }, "test"));
  const repeated = await prisma.$transaction((tx) => issueDocumentPresentation(tx, { entityType: "TEST_DOCUMENT", entityId, documentType: "RECEIPT_NOTE", documentNumber: `DOC-${suffix}`, data: { amount: 999 } }, "test"));
  assert.equal(repeated.id, first.id); assert.equal(repeated.checksum, first.checksum); assert.deepEqual(JSON.parse(repeated.dataSnapshotJson), { amount: 125, party: "عميل" }); assert.equal(repeated.templateVersionId, publishedVersion.id);
});

test("الثيم يحفظ الهوية الآمنة والاتجاه المرئي دون المساس بمنطق الأعمال", async () => {
  const theme = await prisma.$transaction((tx) => saveTheme(tx, { tenantId: 1, companyId: 1, themePreset: "MODERN", mode: "DARK", primaryColor: "#123456", secondaryColor: "#234567", accentColor: "#345678", backgroundColor: "#f8f5ee", sidebarColor: "#fffdf8", chartStyle: "DIMENSIONAL", logoUrl: "javascript:bad", fontArabic: "Tajawal", sidebarStyle: "SOFT", cardStyle: "ELEVATED", tableStyle: "BORDERED" }, "test"));
  assert.equal(theme.themePreset, "MODERN"); assert.equal(theme.mode, "DARK"); assert.equal(theme.logoUrl, null); assert.equal(theme.primaryColor, "#123456");
  assert.equal(theme.backgroundColor, "#f8f5ee"); assert.equal(theme.sidebarColor, "#fffdf8"); assert.equal(theme.chartStyle, "DIMENSIONAL");
});

test("منشئ اللوحات يحفظ عناصر فعلية مرتبة ومقيدة بمصادر مسموحة", async () => {
  const saved = await prisma.$transaction((tx) => saveDashboard(tx, { tenantId: 1, companyId: 1, code: `OPS_${suffix}`, name: "لوحة التشغيل", roleCodes: ["ADMIN"], widgets: [{ widgetType: "KPI", title: "المبيعات", dataSource: "kpis.sales", width: 1 }, { widgetType: "TABLE", title: "العملاء", dataSource: "customerActivity", width: 2 }] }, "test"));
  assert.equal(saved.widgets.length, 2); assert.deepEqual(saved.widgets.map((row) => row.position), [1, 2]); assert.ok(saved.widgets.every((row) => dashboardDataSources.includes(row.dataSource)));
  const workspace = await prisma.$transaction((tx) => listDesignWorkspace(tx)); assert.ok(workspace.dashboards.some((row) => row.id === saved.id));
});

test("QR وBarcode الناتجان صور PNG فعلية", async () => {
  assert.match(await qrDataUrl(`NETAJ-${suffix}`), /^data:image\/png;base64,/);
  assert.match(await barcodeDataUrl(`NETAJ-${suffix}`), /^data:image\/png;base64,/);
});

test("نماذج Phase I معزولة عن الشركات ومحاولة ID المباشر تحمل النطاق", () => {
  for (const model of ["DocumentTemplate", "IssuedDocumentPresentation", "CompanyThemeProfile", "DashboardDefinition", "DashboardWidget"]) assert.ok(scopedModels.has(model));
  assert.deepEqual(scopePrismaArgs("findUnique", { where: { id: 7 } }, { tenantId: 5, companyId: 6 }).where, { id: 7, tenantId: 5, companyId: 6 });
});
