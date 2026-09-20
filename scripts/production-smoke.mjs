import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

const port = 3147;
const temporaryDirectory = mkdtempSync(join(tmpdir(), "netaj-production-smoke-"));
const databasePath = join(temporaryDirectory, "production-smoke.db");
copyFileSync("prisma/netaj.db", databasePath);
const fixtureDatabase = new Database(databasePath);
fixtureDatabase.exec('PRAGMA foreign_keys = ON; DELETE FROM "AuthSession"; DELETE FROM "PlatformAdministrator"; DELETE FROM "VatReturnLine"; DELETE FROM "VatReturn"; UPDATE "PlatformUser" SET "email" = \'pending.smoke@netaj.test\', "passwordHash" = NULL, "mfaEnabled" = 0;');
fixtureDatabase.close();
const bootstrapToken = "production-smoke-bootstrap-token";
const smokeEmail = "production-smoke@netaj.test";
const smokePassword = "ProductionSmoke123";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: `file:${databasePath}`,
    ATTACHMENT_STORAGE_DIR: join(temporaryDirectory, "attachments"),
    AUTH_BOOTSTRAP_TOKEN: bootstrapToken,
    INTEGRATION_ENCRYPTION_KEY: "production-smoke-only-encryption-key",
    ALLOW_DATABASE_BACKUP_DOWNLOAD: "1",
  },
});

const nativeFetch = globalThis.fetch;
let sessionCookie = "";
globalThis.fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  if (sessionCookie) headers.set("cookie", sessionCookie);
  return nativeFetch(input, { ...init, headers });
};

let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk.toString()));
server.stderr.on("data", (chunk) => (logs += chunk.toString()));

async function waitUntilReady() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/login`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Production server did not become ready.\n${logs}`);
}

const routes = [
  "/",
  "/items",
  "/parties",
  "/parties/1",
  "/inventory",
  "/notes",
  "/transport",
  "/sales",
  "/purchases",
  "/accounting",
  "/factory",
  "/hr",
  "/external",
  "/reports",
  "/projects",
  "/imports",
  "/imports/sources",
  "/settings/organization",
  "/settings/configuration",
  "/reports/builder",
  "/settings/design",
  "/dashboards",
  "/onboarding",
  "/super-admin",
  "/crm",
  "/assets",
  "/documents",
  "/approvals",
  "/portal-admin",
  "/portal",
  "/treasury",
  "/integrations",
  "/assistant",
  "/controls",
  "/notifications",
  "/operations",
  "/search",
  "/settings/security",
  "/settings/jobs",
  "/manifest.webmanifest",
  "/sw.js",
  "/api/units",
  "/api/item-categories",
  "/api/items",
  "/api/parties",
  "/api/parties/1",
  "/api/inventory",
  "/api/inventory/controls?view=counts",
  "/api/notes",
  "/api/transport",
  "/api/transport/trucks",
  "/api/transport/drivers",
  "/api/sales",
  "/api/purchases",
  "/api/workflows?direction=SALES",
  "/api/accounting",
  "/api/finance",
  "/api/finance/banks",
  "/api/finance/vouchers",
  "/api/finance/expenses",
  "/api/finance/revenues",
  "/api/finance/transfers",
  "/api/finance/reconciliations",
  "/api/finance/vat-returns",
  "/api/finance/fiscal-calendar",
  "/api/finance/credit-debit-notes",
  "/api/finance/adjustments",
  "/api/finance/exchange-rates",
  "/api/finance/fx-revaluations",
  "/api/finance/budgets",
  "/api/finance/reports?report=trial-balance",
  "/api/factory",
  "/api/factory/products",
  "/api/factory/transactions",
  "/api/factory/fees",
  "/api/factory/fuel",
  "/api/factory/maintenance",
  "/api/hr",
  "/api/hr/employees",
  "/api/hr/workers",
  "/api/hr/attendance",
  "/api/hr/payroll",
  "/api/hr/advances",
  "/api/hr/worker-costs",
  "/api/external",
  "/api/external/trades",
  "/api/external/costs",
  "/api/external/expenses",
  "/api/platform",
  "/api/analytics",
  "/api/projects",
  "/api/imports",
  "/api/imports/source-systems",
  "/api/imports/template?target=PARTIES",
  "/api/configuration",
  "/api/custom-fields?entityType=PARTY",
  "/api/custom-reports",
  "/api/design",
  "/api/design/runtime",
  "/api/design/branding",
  "/api/onboarding",
  "/api/super-admin",
  "/api/crm",
  "/api/assets",
  "/api/documents",
  "/api/approvals",
  "/api/portal-admin",
  "/api/treasury",
  "/api/integrations",
  "/api/v1/integrations",
  "/api/assistant",
  "/api/controls",
  "/api/notifications",
  "/api/operations-twin",
  "/api/imports/certification",
  "/api/search?q=NETAj",
  "/api/auth/mfa",
  "/api/background-jobs",
  "/api/reports/legacy?report=monthly-comparison&from=2026-01-01&to=2026-09-30",
];

async function jsonRequest(route, init) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, init);
  const body = await response.json();
  return { response, body };
}

try {
  await waitUntilReady();
  const setup = await nativeFetch(`http://127.0.0.1:${port}/api/auth/setup`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: smokeEmail, password: smokePassword, setupToken: bootstrapToken }),
  });
  assert.equal(setup.status, 201, `Auth setup returned ${setup.status}: ${await setup.text()}`);
  const login = await nativeFetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: smokeEmail, password: smokePassword }),
  });
  assert.equal(login.status, 200, `Auth login returned ${login.status}: ${await login.text()}`);
  sessionCookie = (login.headers.get("set-cookie") ?? "").split(";")[0];
  assert.match(sessionCookie, /^netaj_session=/);

  for (const route of routes) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 200, `${route} returned ${response.status}`);
    console.log(`PASS ${route} (${response.status})`);
  }
  for (const format of ["xlsx", "pdf"]) {
    const response = await fetch(`http://127.0.0.1:${port}/api/finance/reports/export?report=trial-balance&format=${format}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status, 200, `financial ${format} export returned ${response.status}`);
    assert.equal(format === "xlsx" ? String.fromCharCode(...bytes.slice(0, 2)) : String.fromCharCode(...bytes.slice(0, 4)), format === "xlsx" ? "PK" : "%PDF");
    console.log(`PASS production financial ${format.toUpperCase()} export (${bytes.length} bytes)`);
  }
  for (const format of ["xlsx", "pdf"]) {
    const response = await fetch(`http://127.0.0.1:${port}/api/reports/legacy/export?report=monthly-comparison&from=2026-01-01&to=2026-09-30&format=${format}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status, 200, `legacy report ${format} export returned ${response.status}`);
    assert.equal(format === "xlsx" ? String.fromCharCode(...bytes.slice(0, 2)) : String.fromCharCode(...bytes.slice(0, 4)), format === "xlsx" ? "PK" : "%PDF");
    if (process.env.SMOKE_ARTIFACT_DIR) {
      mkdirSync(process.env.SMOKE_ARTIFACT_DIR, { recursive: true });
      writeFileSync(join(process.env.SMOKE_ARTIFACT_DIR, `phase-e-monthly-comparison.${format}`), bytes);
    }
    console.log(`PASS production Phase E ${format.toUpperCase()} export (${bytes.length} bytes)`);
  }

  const units = await (await fetch(`http://127.0.0.1:${port}/api/units`)).json();
  const suffix = Date.now().toString(36).toUpperCase();
  const importCsv = new File([`الاسم العربي,الرقم الموحد,عميل\nعميل استيراد الإنتاج,SMOKE-IMP-${suffix},نعم\n`], "production-import.csv", { type: "text/csv" });
  const inspectForm = new FormData(); inspectForm.set("file", importCsv); inspectForm.set("targetType", "PARTIES");
  const inspectImport = await fetch(`http://127.0.0.1:${port}/api/imports/inspect`, { method: "POST", body: inspectForm });
  const inspectBody = await inspectImport.json();
  assert.equal(inspectImport.status, 200, `import inspect returned ${inspectImport.status}: ${JSON.stringify(inspectBody)}`);
  assert.equal(inspectBody.intelligence.requiresConfirmation, true); assert.ok(inspectBody.intelligence.confidence > 0);
  const previewForm = new FormData(); previewForm.set("file", importCsv); previewForm.set("targetType", "PARTIES"); previewForm.set("importMode", "FULL"); previewForm.set("duplicateStrategy", "SKIP");
  const previewImport = await fetch(`http://127.0.0.1:${port}/api/imports`, { method: "POST", body: previewForm });
  const previewImportBody = await previewImport.json();
  assert.equal(previewImport.status, 201, `import preview returned ${previewImport.status}: ${JSON.stringify(previewImportBody)}`);
  assert.equal(previewImportBody.validRows, 1, `unexpected import preview: ${JSON.stringify(previewImportBody)}`);
  const dryRunImport = await jsonRequest(`/api/imports/${previewImportBody.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "DRY_RUN" }) });
  assert.equal(dryRunImport.response.status, 200); assert.equal(dryRunImport.body.status, "DRY_RUN");
  const approveImport = await jsonRequest(`/api/imports/${previewImportBody.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "APPROVE" }) });
  assert.equal(approveImport.response.status, 200); assert.equal(approveImport.body.status, "APPROVED");
  const executeImport = await jsonRequest(`/api/imports/${previewImportBody.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "EXECUTE" }) });
  assert.equal(executeImport.response.status, 200); assert.equal(executeImport.body.createdRows, 1);
  const certificate = await jsonRequest("/api/imports/certification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importBatchId: previewImportBody.id }) });
  assert.equal(certificate.response.status, 201, JSON.stringify(certificate.body)); assert.equal(certificate.body.status, "MATCHED");
  for (const format of ["xlsx", "pdf"]) { const response = await fetch(`http://127.0.0.1:${port}/api/imports/certification/${certificate.body.id}/export?format=${format}`), bytes = new Uint8Array(await response.arrayBuffer()); assert.equal(response.status, 200); assert.equal(format === "xlsx" ? String.fromCharCode(...bytes.slice(0, 2)) : String.fromCharCode(...bytes.slice(0, 4)), format === "xlsx" ? "PK" : "%PDF"); }
  const importedParty = (await jsonRequest(`/api/parties?q=${encodeURIComponent(`SMOKE-IMP-${suffix}`)}`)).body.parties.find((row) => row.unifiedNumber === `SMOKE-IMP-${suffix}`);
  assert.ok(importedParty);
  const rollbackImport = await jsonRequest(`/api/imports/${previewImportBody.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ROLLBACK" }) });
  assert.equal(rollbackImport.response.status, 200); assert.equal(rollbackImport.body.status, "ROLLED_BACK");
  console.log("PASS production import intelligence, preview/dry-run/approval/execute/certification/exports/reconciliation/rollback");
  const companyResult = await jsonRequest("/api/platform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: `SMOKE-${suffix}`,
      legalNameAr: "شركة اختبار SaaS",
      countryCode: "SA",
      baseCurrencyCode: "SAR",
      defaultLanguageCode: "ar",
      timeZoneName: "Asia/Riyadh",
    }),
  });
  assert.equal(companyResult.response.status, 201);
  assert.equal(companyResult.body.branches.length, 1);
  assert.equal(companyResult.body.warehouses.length, 1);

  const partyResult = await jsonRequest("/api/parties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nameAr: "عميل اختبار الإنتاج",
      isCustomer: true,
      isSupplier: true,
    }),
  });
  assert.equal(partyResult.response.status, 201);

  const customField = await jsonRequest("/api/configuration", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "CUSTOM_FIELD", entityType: "PARTY", fieldKey: `smoke_code_${suffix.toLowerCase()}`, labelAr: "رمز اختبار التهيئة", fieldType: "TEXT", sortOrder: 10 }),
  });
  assert.equal(customField.response.status, 201, JSON.stringify(customField.body));
  const customFieldValue = await jsonRequest("/api/custom-fields", {
    method: "PUT", headers: { "content-type": "application/json" },
    body: JSON.stringify({ entityType: "PARTY", entityId: partyResult.body.id, values: { [customField.body.fieldKey]: "CONFIG-OK" } }),
  });
  assert.equal(customFieldValue.response.status, 200, JSON.stringify(customFieldValue.body));
  assert.equal(customFieldValue.body.find((field) => field.fieldKey === customField.body.fieldKey)?.value, "CONFIG-OK");
  const customReport = await jsonRequest("/api/custom-reports", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ code: `SMOKE_PARTIES_${suffix}`, name: "تقرير اختبار الإنتاج", sourceType: "PARTIES", fields: ["id", "nameAr", "isCustomer"], filters: [{ field: "nameAr", operator: "CONTAINS", value: "اختبار" }], sort: [{ field: "id", direction: "desc" }], calculations: [{ field: "id", operation: "COUNT", label: "count" }], visibility: "COMPANY" }),
  });
  assert.equal(customReport.response.status, 201, JSON.stringify(customReport.body));
  assert.equal(customReport.body.result.rows.some((row) => row.id === partyResult.body.id), true);
  for (const format of ["xlsx", "pdf"]) {
    const response = await fetch(`http://127.0.0.1:${port}/api/custom-reports/${customReport.body.definition.id}/export?format=${format}`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    assert.equal(response.status, 200);
    assert.equal(format === "xlsx" ? String.fromCharCode(...bytes.slice(0, 2)) : String.fromCharCode(...bytes.slice(0, 4)), format === "xlsx" ? "PK" : "%PDF");
  }
  console.log("PASS production Phase H custom fields, filtered reports, Excel/PDF exports");
  const themeProfile = await jsonRequest("/api/design", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "THEME", themePreset: "MODERN", mode: "LIGHT", primaryColor: "#1d4ed8", secondaryColor: "#0f172a", accentColor: "#059669", fontArabic: "Arial", fontEnglish: "Arial", sidebarStyle: "SOFT", cardStyle: "ELEVATED", tableStyle: "BORDERED", menuOrder: ["/dashboards", "/parties"], loginBranding: { title: "دخول اختبار الإنتاج" } }) });
  assert.equal(themeProfile.response.status, 201, JSON.stringify(themeProfile.body));
  const customDashboard = await jsonRequest("/api/design", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "DASHBOARD", code: `SMOKE_DASH_${suffix}`, name: "لوحة اختبار الإنتاج", roleCodes: ["ADMIN"], widgets: [{ widgetType: "KPI", title: "المبيعات", dataSource: "kpis.sales", width: 1 }, { widgetType: "TABLE", title: "نشاط العملاء", dataSource: "customerActivity", width: 2 }] }) });
  assert.equal(customDashboard.response.status, 201, JSON.stringify(customDashboard.body));
  const documentTemplate = await jsonRequest("/api/design", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "TEMPLATE_VERSION", code: `SMOKE_NOTE_${suffix}`, name: "قالب اختبار الإنتاج", documentType: "DELIVERY_NOTE", isDefault: true, design: { page: { size: "A4" }, colors: { primary: "#112233", accent: "#445566" }, body: { fieldOrder: ["documentNumber", "transport", "items", "totals", "notes"] }, features: { qr: true, barcode: true, signatures: true, stamp: true } } }) });
  assert.equal(documentTemplate.response.status, 201, JSON.stringify(documentTemplate.body));
  const publishedTemplate = await jsonRequest("/api/design", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PUBLISH_VERSION", versionId: documentTemplate.body.version.id }) });
  assert.equal(publishedTemplate.response.status, 201, JSON.stringify(publishedTemplate.body));
  const designRuntime = await jsonRequest("/api/design/runtime");
  assert.equal(designRuntime.response.status, 200);
  assert.equal(designRuntime.body.dashboards.some((row) => row.id === customDashboard.body.id), true);
  console.log("PASS production Phase I theme, versioned template publish, role dashboard runtime");
  const platformAdmin = await jsonRequest("/api/super-admin");
  assert.equal(platformAdmin.response.status, 200, JSON.stringify(platformAdmin.body));
  assert.equal("parties" in platformAdmin.body, false);
  const commercialPlan = await jsonRequest("/api/super-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "PLAN", code: `SMOKE_PLAN_${suffix}`, name: "Smoke Commercial Plan", userLimit: 3, companyLimit: 2, storageMb: 128, monthlyPrice: 99, annualPrice: 990, trialDays: 7, moduleKeys: ["CORE", "DESIGN"], featureLimits: { CUSTOM_DASHBOARDS_MAX: 2 } }) });
  assert.equal(commercialPlan.response.status, 201, JSON.stringify(commercialPlan.body));
  const supportGrant = await jsonRequest("/api/super-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUPPORT_GRANT", tenantId: 1, companyId: 1, reason: "Production smoke diagnostics", approvedBy: "NETAj owner", expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: ["DIAGNOSTICS"] }) });
  assert.equal(supportGrant.response.status, 201, JSON.stringify(supportGrant.body));
  const revokeGrant = await jsonRequest("/api/super-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUPPORT_REVOKE", id: supportGrant.body.id }) });
  assert.equal(revokeGrant.response.status, 201);
  console.log("PASS production Phase J plan limits, separate super admin, audited support grants");

  const crmLead = await jsonRequest("/api/crm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "LEAD", name: "عميل محتمل Production", companyName: "شركة اختبار CRM" }) });
  assert.equal(crmLead.response.status, 201, JSON.stringify(crmLead.body));
  assert.match(crmLead.body.leadNumber, /^LEAD-/);
  const dmsCategory = await jsonRequest("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "CATEGORY", code: `SMOKE_DMS_${suffix}`, name: "عقود اختبار" }) });
  assert.equal(dmsCategory.response.status, 201, JSON.stringify(dmsCategory.body));
  const dmsDocument = await jsonRequest("/api/documents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "DOCUMENT", categoryId: dmsCategory.body.id, title: "مستند Production", expiryDate: new Date(Date.now() + 5 * 86400000).toISOString() }) });
  assert.equal(dmsDocument.response.status, 201, JSON.stringify(dmsDocument.body));
  const portalIdentity = await jsonRequest("/api/portal-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "IDENTITY", partyId: partyResult.body.id, email: `portal-${suffix.toLowerCase()}@netaj.test`, permissions: ["INVOICES", "ORDERS"] }) });
  assert.equal(portalIdentity.response.status, 201, JSON.stringify(portalIdentity.body));
  assert.ok(portalIdentity.body.activationToken);
  const portalPassword = "PortalSmoke123";
  const portalEmail = `portal-${suffix.toLowerCase()}@netaj.test`;
  const portalActivation = await nativeFetch(`http://127.0.0.1:${port}/api/portal/auth/activate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyCode: "NETAJ", email: portalEmail, activationToken: portalIdentity.body.activationToken, password: portalPassword }) });
  assert.equal(portalActivation.status, 200, await portalActivation.text());
  const portalLogin = await nativeFetch(`http://127.0.0.1:${port}/api/portal/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyCode: "NETAJ", email: portalEmail, password: portalPassword }) });
  assert.equal(portalLogin.status, 200, await portalLogin.text());
  const portalCookie = (portalLogin.headers.get("set-cookie") ?? "").split(";")[0];
  assert.match(portalCookie, /^netaj_portal_session=/);
  const portalWorkspace = await nativeFetch(`http://127.0.0.1:${port}/api/portal/workspace`, { headers: { cookie: portalCookie } });
  assert.equal(portalWorkspace.status, 200, portalWorkspace.statusText);
  const portalData = await portalWorkspace.json();
  assert.equal(portalData.party.id, partyResult.body.id);
  assert.ok(portalData.sales.every((row) => row.partyId === partyResult.body.id));
  const portalRequest = await nativeFetch(`http://127.0.0.1:${port}/api/portal/workspace`, { method: "POST", headers: { cookie: portalCookie, "content-type": "application/json" }, body: JSON.stringify({ requestType: "STATEMENT", subject: "كشف حساب Smoke" }) });
  assert.equal(portalRequest.status, 201, await portalRequest.text());
  const portalLogout = await nativeFetch(`http://127.0.0.1:${port}/api/portal/auth/logout`, { method: "POST", headers: { cookie: portalCookie } });
  assert.equal(portalLogout.status, 200);
  const treasuryAdjustment = await jsonRequest("/api/treasury", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ forecastDate: new Date(Date.now() + 86400000).toISOString(), direction: "IN", description: "تحصيل متوقع Production", amount: 100, probability: 75 }) });
  assert.equal(treasuryAdjustment.response.status, 201, JSON.stringify(treasuryAdjustment.body));
  const webhook = await jsonRequest("/api/v1/integrations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "WEBHOOK", code: `SMOKE_HOOK_${suffix}`, url: "https://example.test/netaj", eventTypes: ["sale.posted"] }) });
  assert.equal(webhook.response.status, 201, JSON.stringify(webhook.body));
  assert.ok(webhook.body.secret);
  const safeIntegrations = await jsonRequest("/api/v1/integrations");
  assert.equal(safeIntegrations.response.status, 200);
  assert.equal(safeIntegrations.body.endpoints.find((row) => row.id === webhook.body.id)?.secretHash, "[REDACTED]");
  console.log("PASS production Phase K CRM, DMS, portal foundation, treasury, versioned integrations, and PWA shell");
  const securityHeaders = await fetch(`http://127.0.0.1:${port}/`);
  assert.equal(securityHeaders.headers.get("x-content-type-options"), "nosniff");
  assert.equal(securityHeaders.headers.get("x-frame-options"), "DENY");
  assert.match(securityHeaders.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/);
  const assistantAnswer = await jsonRequest("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ASK", question: "كم السيولة؟" }) });
  assert.equal(assistantAnswer.response.status, 200, JSON.stringify(assistantAnswer.body));
  assert.equal(assistantAnswer.body.intent, "LIQUIDITY");
  const controlScan = await jsonRequest("/api/controls", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SCAN" }) });
  assert.equal(controlScan.response.status, 200, JSON.stringify(controlScan.body));
  assert.equal(controlScan.body.auditIntegrity.valid, true);
  const globalSearch = await jsonRequest(`/api/search?q=${encodeURIComponent("اختبار الإنتاج")}`);
  assert.equal(globalSearch.response.status, 200);
  assert.ok(globalSearch.body.results.some((row) => row.type === "PARTY"));
  const backupGrant = await jsonRequest("/api/super-admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "SUPPORT_GRANT", tenantId: 1, reason: "Production backup smoke verification", approvedBy: "NETAj owner", expiresAt: new Date(Date.now() + 3600000).toISOString(), scopes: ["DATABASE_BACKUP"] }) });
  assert.equal(backupGrant.response.status, 201, JSON.stringify(backupGrant.body));
  const backupDownload = await fetch(`http://127.0.0.1:${port}/api/admin/backup`);
  const backupBytes = new Uint8Array(await backupDownload.arrayBuffer());
  assert.equal(backupDownload.status, 200);
  assert.equal(new TextDecoder().decode(backupBytes.slice(0, 15)), "SQLite format 3");
  assert.match(backupDownload.headers.get("x-content-checksum-sha256") ?? "", /^[a-f0-9]{64}$/);
  const csrf = await nativeFetch(`http://127.0.0.1:${port}/api/crm`, { method: "POST", headers: { cookie: sessionCookie, origin: "https://attacker.invalid", "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: JSON.stringify({ action: "LEAD", name: "blocked" }) });
  assert.equal(csrf.status, 403);
  assert.equal((await csrf.json()).code, "CSRF_REJECTED");
  console.log("PASS production Phase L assistant, controls, global search, security headers, CSRF, MFA status, and verified backup download");

  const switchToSecond = await jsonRequest("/api/auth/switch-company", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ companyId: companyResult.body.id }),
  });
  assert.equal(switchToSecond.response.status, 200);
  const secondOnboarding = await jsonRequest("/api/onboarding");
  assert.equal(secondOnboarding.response.status, 200);
  assert.equal(secondOnboarding.body.session.status, "IN_PROGRESS");
  assert.equal(secondOnboarding.body.templates.some((row) => row.code === "RETAIL"), true);
  const secondParty = await jsonRequest("/api/parties", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ nameAr: "عميل الشركة الثانية", isCustomer: true }),
  });
  assert.equal(secondParty.response.status, 201);
  const secondPartyList = await jsonRequest("/api/parties");
  assert.equal(secondPartyList.body.parties.some((row) => row.id === partyResult.body.id), false);
  const forbiddenDirectRead = await jsonRequest(`/api/parties/${partyResult.body.id}`);
  assert.equal(forbiddenDirectRead.response.status, 404);
  const forbiddenDirectUpdate = await jsonRequest(`/api/parties/${partyResult.body.id}`, {
    method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ isActive: false }),
  });
  assert.notEqual(forbiddenDirectUpdate.response.status, 200);
  const spoofedRead = await jsonRequest(`/api/parties/${partyResult.body.id}`, {
    headers: { "x-netaj-tenant-id": "1", "x-netaj-company-id": "1", "x-netaj-scope-verified": "1" },
  });
  assert.equal(spoofedRead.response.status, 404);
  const disabledInventory = await jsonRequest("/api/inventory");
  assert.equal(disabledInventory.response.status, 403);
  assert.equal(disabledInventory.body.code, "MODULE_DISABLED");
  const disabledAccounting = await jsonRequest("/api/finance/vat-returns");
  assert.equal(disabledAccounting.response.status, 403);
  assert.equal(disabledAccounting.body.code, "MODULE_DISABLED");
  const disabledDesign = await jsonRequest("/api/design");
  assert.equal(disabledDesign.response.status, 403);
  assert.equal(disabledDesign.body.code, "MODULE_DISABLED");
  const secondCompanyHome = await (await fetch(`http://127.0.0.1:${port}/`)).text();
  assert.equal(secondCompanyHome.includes('href="/inventory"'), false);
  const switchBack = await jsonRequest("/api/auth/switch-company", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: 1 }),
  });
  assert.equal(switchBack.response.status, 200);
  const firstPartyList = await jsonRequest("/api/parties");
  assert.equal(firstPartyList.body.parties.some((row) => row.id === secondParty.body.id), false);
  assert.equal(firstPartyList.body.parties.find((row) => row.id === partyResult.body.id)?.isActive, true);
  const forbiddenReverseRead = await jsonRequest(`/api/parties/${secondParty.body.id}`);
  assert.equal(forbiddenReverseRead.response.status, 404);
  const financeWorkspace = await jsonRequest("/api/finance");
  assert.equal(financeWorkspace.response.status, 200);
  const budget = await jsonRequest("/api/finance/budgets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
    name: `Smoke Budget ${suffix}`, fiscalYearId: financeWorkspace.body.fiscalYears[0].id,
    lines: [{ accountId: financeWorkspace.body.accounts[0].id, periodType: "ANNUAL", amount: 1000 }],
  }) });
  assert.equal(budget.response.status, 201);
  const enableSecondAccounting = await jsonRequest(`/api/platform/companies/${companyResult.body.id}/modules`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleKey: "ACCOUNTING", enabled: true }) });
  assert.equal(enableSecondAccounting.response.status, 200);
  const switchForFinanceIsolation = await jsonRequest("/api/auth/switch-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: companyResult.body.id }) });
  assert.equal(switchForFinanceIsolation.response.status, 200);
  const secondBudgets = await jsonRequest("/api/finance/budgets");
  assert.equal(secondBudgets.response.status, 200);
  assert.equal(secondBudgets.body.some((row) => row.id === budget.body.id), false);
  const forbiddenBudgetApproval = await jsonRequest(`/api/finance/budgets/${budget.body.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "APPROVE" }) });
  assert.notEqual(forbiddenBudgetApproval.response.status, 200);
  const switchBackAfterFinance = await jsonRequest("/api/auth/switch-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: 1 }) });
  assert.equal(switchBackAfterFinance.response.status, 200);
  console.log("PASS production tenant isolation, IDOR defense, header spoofing defense, and module entitlements");

  const limitedEmail = `reader-${suffix.toLowerCase()}@netaj.test`;
  const limitedPassword = "LimitedReader123";
  const limitedUser = await jsonRequest("/api/platform/users", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "قارئ محدود", email: limitedEmail, password: limitedPassword, companyId: 1, permissionKeys: ["CORE.READ"] }),
  });
  assert.equal(limitedUser.response.status, 201);
  const limitedLogin = await nativeFetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: limitedEmail, password: limitedPassword }),
  });
  assert.equal(limitedLogin.status, 200);
  const adminCookie = sessionCookie;
  sessionCookie = (limitedLogin.headers.get("set-cookie") ?? "").split(";")[0];
  assert.equal((await jsonRequest("/api/parties")).response.status, 200);
  const forbiddenCreate = await jsonRequest("/api/parties", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nameAr: "ممنوع" }),
  });
  assert.equal(forbiddenCreate.response.status, 403);
  assert.equal(forbiddenCreate.body.code, "PERMISSION_DENIED");
  const forbiddenModule = await jsonRequest("/api/inventory");
  assert.equal(forbiddenModule.response.status, 403);
  assert.equal(forbiddenModule.body.code, "PERMISSION_DENIED");
  const forbiddenUserAdmin = await jsonRequest("/api/platform/users");
  assert.equal(forbiddenUserAdmin.response.status, 403);
  const forbiddenSuperAdmin = await jsonRequest("/api/super-admin");
  assert.equal(forbiddenSuperAdmin.response.status, 403);
  assert.equal(forbiddenSuperAdmin.body.code, "PLATFORM_ADMIN_REQUIRED");
  const forbiddenBackup = await jsonRequest("/api/admin/backup");
  assert.equal(forbiddenBackup.response.status, 403);
  assert.equal(forbiddenBackup.body.code, "PLATFORM_ADMIN_REQUIRED");
  const forbiddenFinancialExport = await fetch(`http://127.0.0.1:${port}/api/finance/reports/export?report=trial-balance&format=xlsx`);
  assert.equal(forbiddenFinancialExport.status, 403);
  const limitedDashboard = await jsonRequest("/api/analytics?from=2026-01-01&to=2026-09-30");
  assert.equal(limitedDashboard.response.status, 200);
  assert.equal(Number(limitedDashboard.body.kpis.sales), 0);
  assert.equal(limitedDashboard.body.materials.length, 0);
  const forbiddenLegacyReport = await jsonRequest("/api/reports/legacy?report=payroll&from=2026-01-01&to=2026-09-30");
  assert.equal(forbiddenLegacyReport.response.status, 403);
  assert.equal((await jsonRequest("/api/projects")).response.status, 403);
  sessionCookie = adminCookie;
  console.log("PASS production granular RBAC for read-only user");

  const itemResult = await jsonRequest("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: `SMOKE-${suffix}`,
      nameAr: "مادة اختبار الإنتاج",
      unitId: units[0].id,
    }),
  });
  assert.equal(itemResult.response.status, 201);
  const projectWorkspace = await jsonRequest("/api/projects");
  assert.equal(projectWorkspace.response.status, 200);
  const smokeProject = await jsonRequest("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "مشروع اختبار الإنتاج", partyId: partyResult.body.id, costCenterId: projectWorkspace.body.costCenters[0].id, billingItemId: itemResult.body.id, startDate: "2026-09-01", contractValue: 1000, retentionPercent: 10 }) });
  assert.equal(smokeProject.response.status, 201, JSON.stringify(smokeProject.body));
  const projectBudget = await jsonRequest(`/api/projects/${smokeProject.body.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "budget", costCodeId: projectWorkspace.body.costCodes[0].id, budgetAmount: 500, forecastAmount: 550 }) });
  assert.equal(projectBudget.response.status, 201);
  const projectDetail = await jsonRequest(`/api/projects/${smokeProject.body.id}`);
  assert.equal(projectDetail.response.status, 200);
  assert.equal(Number(projectDetail.body.kpis.budget), 500);
  const enableSecondProjects = await jsonRequest(`/api/platform/companies/${companyResult.body.id}/modules`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ moduleKey: "PROJECTS", enabled: true }) });
  assert.equal(enableSecondProjects.response.status, 200);
  assert.equal((await jsonRequest("/api/auth/switch-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: companyResult.body.id }) })).response.status, 200);
  assert.equal((await jsonRequest(`/api/projects/${smokeProject.body.id}`)).response.status, 404);
  const isolatedProjects = await jsonRequest("/api/projects");
  assert.equal(isolatedProjects.response.status, 200);
  assert.equal(isolatedProjects.body.projects.some((row) => row.id === smokeProject.body.id), false);
  assert.equal((await jsonRequest("/api/auth/switch-company", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ companyId: 1 }) })).response.status, 200);
  console.log("PASS production Phase F project KPIs, RBAC, module entitlement, and cross-company IDOR isolation");
  const physicalReading = await jsonRequest("/api/reports/readings", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "READING", readingDate: "2026-09-20", assetType: "TANK", assetName: "Smoke Tank", readingType: "DAILY", unit: "L", openingValue: 100, usedValue: 20, closingValue: 80 }),
  });
  assert.equal(physicalReading.response.status, 201);
  const productionTarget = await jsonRequest("/api/reports/readings", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "TARGET", year: 2026, month: 9, itemId: itemResult.body.id, targetTons: 25 }),
  });
  assert.equal(productionTarget.response.status, 200);

  const movementHeaders = { "Content-Type": "application/json" };
  const companyIn = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "COMPANY",
      itemId: itemResult.body.id,
      quantityIn: 10,
      unitCost: 5,
      movementType: "OPENING",
    }),
  });
  assert.equal(companyIn.response.status, 201);
  assert.equal(companyIn.body.newQuantity, 10);

  const companyOut = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "COMPANY",
      itemId: itemResult.body.id,
      quantityOut: 4,
      movementType: "DELIVERY",
    }),
  });
  assert.equal(companyOut.response.status, 201);
  assert.equal(companyOut.body.newQuantity, 6);

  const rejectedCompanyOut = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "COMPANY",
      itemId: itemResult.body.id,
      quantityOut: 7,
      movementType: "DELIVERY",
    }),
  });
  assert.equal(rejectedCompanyOut.response.status, 400);

  const negativeParty = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "PARTY",
      partyId: partyResult.body.id,
      itemId: itemResult.body.id,
      quantityOut: 3,
      unitCost: 5,
      movementType: "DELIVERY",
    }),
  });
  assert.equal(negativeParty.response.status, 201);
  assert.equal(negativeParty.body.newQuantity, -3);

  const sale = await jsonRequest("/api/sales", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      invoiceNumber: `SALE-${suffix}`,
      partyId: partyResult.body.id,
      totalAmount: 999999,
      items: [
        {
          itemId: itemResult.body.id,
          quantity: 2,
          unitPrice: 10,
          discount: 1,
          vatRate: 15,
        },
      ],
    }),
  });
  assert.equal(sale.response.status, 201);
  assert.equal(Number(sale.body.totalAmount), 21.85);

  const purchase = await jsonRequest("/api/purchases", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      purchaseNumber: `PUR-${suffix}`,
      partyId: partyResult.body.id,
      items: [
        {
          itemId: itemResult.body.id,
          quantity: 3,
          unitPrice: 4,
          discount: 0,
          vatRate: 15,
        },
      ],
    }),
  });
  assert.equal(purchase.response.status, 201);
  assert.equal(Number(purchase.body.totalAmount), 13.8);

  const partyFile = await jsonRequest(`/api/parties/${partyResult.body.id}`);
  assert.equal(partyFile.response.status, 200);
  assert.equal(partyFile.body.stockMovements.length, 1);
  assert.equal(Number(partyFile.body.stockMovements[0].balanceAfter), -3);
  assert.equal(partyFile.body.sales.length, 1);
  assert.equal(partyFile.body.purchases.length, 1);
  const truck = await jsonRequest("/api/transport/trucks", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({ plateNumber: `SMOKE-${suffix}`, truckType: "اختبار" }),
  });
  assert.equal(truck.response.status, 201);
  const driver = await jsonRequest("/api/transport/drivers", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({ name: "سائق اختبار الإنتاج", idNumber: `SMOKE-${suffix}` }),
  });
  assert.equal(driver.response.status, 201);
  const note = await jsonRequest("/api/notes", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({
      noteType: "RECEIPT", noteDate: "2026-09-20", partyId: partyResult.body.id,
      stockOwnership: "PARTY", transportMethod: "COMPANY", truckId: truck.body.id,
      driverId: driver.body.id, items: [{ itemId: itemResult.body.id, quantity: 5, weight: 4.5 }],
    }),
  });
  assert.equal(note.response.status, 201);
  const submittedNote = await jsonRequest(`/api/notes/${note.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "SUBMIT" }),
  });
  assert.equal(submittedNote.response.status, 200);
  const approvedNote = await jsonRequest(`/api/notes/${note.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "APPROVE" }),
  });
  assert.equal(approvedNote.response.status, 200);
  const postedNote = await jsonRequest(`/api/notes/${note.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }),
  });
  assert.equal(postedNote.response.status, 200);
  assert.equal(postedNote.body.trip.noteId, note.body.id);
  const printedNote = await fetch(`http://127.0.0.1:${port}/notes/${note.body.id}/print`);
  const printedNoteHtml = await printedNote.text();
  assert.equal(printedNote.status, 200);
  assert.match(printedNoteHtml, /قالب v1 محفوظ تاريخيًا/);
  assert.match(printedNoteHtml, /data:image\/png;base64/);
  console.log("PASS production issued document snapshot, immutable template link, QR and Barcode render");
  const updatedTrip = await jsonRequest(`/api/transport/trips/${postedNote.body.trip.id}`, {
    method: "PATCH", headers: movementHeaders,
    body: JSON.stringify({
      truckId: truck.body.id, driverId: driver.body.id, status: "COMPLETED",
      transportRevenue: 1000, fuelLiters: 100, fuelPricePerLiter: 2,
      driverTripFee: 150, maintenanceCost: 50, administrativeCost: 25,
      roadPermitCost: 15, otherCost: 10, actualKm: 250,
    }),
  });
  assert.equal(updatedTrip.response.status, 200);
  assert.equal(Number(updatedTrip.body.totalCost), 450);
  assert.equal(Number(updatedTrip.body.netProfit), 550);
  const document = await jsonRequest("/api/transport/documents", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({ ownerType: "TRUCK", ownerId: truck.body.id, documentType: "الاستمارة", expiryDate: "2026-09-20" }),
  });
  assert.equal(document.response.status, 201);
  const transport = await jsonRequest("/api/transport");
  assert.equal(transport.response.status, 200);
  assert.equal(transport.body.trips.some((trip) => trip.noteId === note.body.id), true);
  assert.equal(transport.body.alerts.truckDocuments.some((row) => row.id === document.body.id), true);
  const workflowBody = (documentType, quantity = 2) => ({
    documentType, documentDate: "2026-09-20", partyId: partyResult.body.id,
    currency: "SAR", referenceNumber: `FLOW-${suffix}`,
    items: [{ itemId: itemResult.body.id, quantity, unitPrice: 100, discount: 10, vatRate: 15 }],
  });
  const approve = async (id) => {
    const result = await jsonRequest(`/api/workflows/${id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "APPROVE" }) });
    assert.equal(result.response.status, 200);
    return result.body;
  };
  const approveNote = async (id) => {
    for (const action of ["SUBMIT", "APPROVE"]) {
      const result = await jsonRequest(`/api/notes/${id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action }) });
      assert.equal(result.response.status, 200, `Note ${action} failed: ${JSON.stringify(result.body)}`);
    }
  };
  const convert = async (id, targetType, extra = {}) => {
    const result = await jsonRequest(`/api/workflows/${id}/convert`, { method: "POST", headers: movementHeaders, body: JSON.stringify({ targetType, ...extra }) });
    assert.ok([200, 201].includes(result.response.status));
    return result.body;
  };
  const quote = await jsonRequest("/api/workflows", { method: "POST", headers: movementHeaders, body: JSON.stringify(workflowBody("QUOTATION")) });
  assert.equal(quote.response.status, 201, `Workflow quote failed: ${JSON.stringify(quote.body)}`);
  const editedQuote = await jsonRequest(`/api/workflows/${quote.body.id}`, {
    method: "PATCH", headers: movementHeaders,
    body: JSON.stringify({ ...workflowBody("QUOTATION", 3), action: "UPDATE", referenceNumber: `FLOW-EDIT-${suffix}` }),
  });
  assert.equal(editedQuote.response.status, 200, `Workflow draft edit failed: ${JSON.stringify(editedQuote.body)}`);
  assert.equal(editedQuote.body.referenceNumber, `FLOW-EDIT-${suffix}`);
  assert.equal(Number(editedQuote.body.lines[0].quantity), 3);
  await approve(quote.body.id);
  const pi = await convert(quote.body.id, "PROFORMA_INVOICE"); await approve(pi.document.id);
  const order = await convert(pi.document.id, "SALES_ORDER"); await approve(order.document.id);
  const delivery = await convert(order.document.id, "DELIVERY_NOTE", { transportMethod: "COMPANY", truckId: truck.body.id, driverId: driver.body.id });
  await approveNote(delivery.note.id);
  const deliveryPost = await jsonRequest(`/api/notes/${delivery.note.id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }) });
  assert.equal(deliveryPost.response.status, 200);
  const salesInvoice = await jsonRequest(`/api/notes/${delivery.note.id}/invoice`, { method: "POST", headers: movementHeaders, body: "{}" });
  assert.equal(salesInvoice.response.status, 201);
  assert.equal(Number(salesInvoice.body.journal.totalDebit), Number(salesInvoice.body.journal.totalCredit));
  const duplicateInvoice = await jsonRequest(`/api/notes/${delivery.note.id}/invoice`, { method: "POST", headers: movementHeaders, body: "{}" });
  assert.equal(duplicateInvoice.response.status, 200);
  assert.equal(duplicateInvoice.body.invoice.id, salesInvoice.body.invoice.id);
  const purchaseRequest = await jsonRequest("/api/workflows", { method: "POST", headers: movementHeaders, body: JSON.stringify(workflowBody("PURCHASE_REQUEST", 3)) });
  assert.equal(purchaseRequest.response.status, 201); await approve(purchaseRequest.body.id);
  const purchaseOrder = await convert(purchaseRequest.body.id, "PURCHASE_ORDER"); await approve(purchaseOrder.document.id);
  const receipt = await convert(purchaseOrder.document.id, "RECEIPT_NOTE", { transportMethod: "EXTERNAL" });
  await approveNote(receipt.note.id);
  await jsonRequest(`/api/notes/${receipt.note.id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }) });
  const supplierInvoice = await jsonRequest(`/api/notes/${receipt.note.id}/invoice`, { method: "POST", headers: movementHeaders, body: JSON.stringify({ supplierInvoiceNumber: `SUP-${suffix}` }) });
  assert.equal(supplierInvoice.response.status, 201);
  assert.equal(Number(supplierInvoice.body.journal.totalDebit), Number(supplierInvoice.body.journal.totalCredit));
  const form = new FormData(); form.set("entityType", "BUSINESS_DOCUMENT"); form.set("entityId", String(quote.body.id)); form.set("file", new File(["%PDF-1.4 smoke"], "smoke.pdf", { type: "application/pdf" }));
  const attachmentResponse = await fetch(`http://127.0.0.1:${port}/api/attachments`, { method: "POST", body: form });
  assert.equal(attachmentResponse.status, 201); const attachment = await attachmentResponse.json();
  const attachmentDownload = await fetch(`http://127.0.0.1:${port}/api/attachments/${attachment.id}`); assert.equal(attachmentDownload.status, 200);
  const reconciliationBank = await jsonRequest("/api/finance/banks", {
    method: "POST", headers: movementHeaders, body: JSON.stringify({ name: `بنك المطابقة ${suffix}`, openingBalance: 500 }),
  });
  assert.equal(reconciliationBank.response.status, 201);
  const creditNote = await jsonRequest("/api/finance/credit-debit-notes", {
    method: "POST", headers: movementHeaders, body: JSON.stringify({ direction: "SALES", noteType: "CREDIT_NOTE", saleId: salesInvoice.body.invoice.id, noteDate: "2026-09-20", amountBeforeVat: 10, vatAmount: 1.5, reason: "Production smoke credit note" }),
  });
  assert.equal(creditNote.response.status, 201, `Credit note failed: ${JSON.stringify(creditNote.body)}`);
  const postedCreditNote = await jsonRequest(`/api/finance/credit-debit-notes/${creditNote.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }),
  });
  assert.equal(postedCreditNote.response.status, 200);
  assert.equal(Number(postedCreditNote.body.journalEntry.totalDebit), Number(postedCreditNote.body.journalEntry.totalCredit));
  const financeOverview = await jsonRequest("/api/finance");
  const adjustedReceivable = financeOverview.body.receivables.items.find((row) => row.id === salesInvoice.body.invoice.id);
  // The posted credit note is part of the receivable as-of calculation and must reduce it once only.
  assert.equal(Number(adjustedReceivable.outstanding), Number(salesInvoice.body.invoice.totalAmount) - Number(postedCreditNote.body.totalAmount));
  const adjustment = await jsonRequest("/api/finance/adjustments", {
    method: "POST", headers: movementHeaders, body: JSON.stringify({ adjustmentType: "ACCRUAL", adjustmentDate: "2026-09-20", description: "Production smoke accrual", lines: [{ accountId: financeOverview.body.accounts[0].id, debit: 25 }, { accountId: financeOverview.body.accounts[1].id, credit: 25 }] }),
  });
  assert.equal(adjustment.response.status, 201, `Adjustment failed: ${JSON.stringify(adjustment.body)}`);
  const postedAdjustment = await jsonRequest(`/api/finance/adjustments/${adjustment.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }),
  });
  assert.equal(postedAdjustment.response.status, 200);
  assert.equal(Number(postedAdjustment.body.journalEntry.totalDebit), Number(postedAdjustment.body.journalEntry.totalCredit));
  const vatReturn = await jsonRequest("/api/finance/vat-returns", {
    method: "POST", headers: movementHeaders, body: JSON.stringify({ periodStart: "2026-09-20", periodEnd: "2026-09-20", notes: "Production smoke" }),
  });
  assert.equal(vatReturn.response.status, 201, `VAT return failed: ${JSON.stringify(vatReturn.body)}`);
  assert.equal(Number(vatReturn.body.variance), 0);
  const filedVat = await jsonRequest(`/api/finance/vat-returns/${vatReturn.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "FILE" }),
  });
  assert.equal(filedVat.response.status, 200, `VAT filing failed: ${JSON.stringify(filedVat.body)}`);
  assert.equal(filedVat.body.status, "FILED");
  const settledVat = await jsonRequest(`/api/finance/vat-returns/${vatReturn.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "SETTLE", bankAccountId: reconciliationBank.body.id, settlementDate: "2026-09-20" }),
  });
  assert.equal(settledVat.response.status, 200, `VAT settlement failed: ${JSON.stringify(settledVat.body)}`);
  assert.equal(settledVat.body.status, "SETTLED");
  const reconciliationData = await jsonRequest(`/api/finance/reconciliations?bankAccountId=${reconciliationBank.body.id}`);
  assert.equal(reconciliationData.response.status, 200);
  const matchedNet = reconciliationData.body.candidates.reduce((sum, row) => sum + Number(row.amountIn) - Number(row.amountOut), 0);
  const reconciliation = await jsonRequest("/api/finance/reconciliations", {
    method: "POST", headers: movementHeaders, body: JSON.stringify({ bankAccountId: reconciliationBank.body.id, periodStart: "2026-01-01", periodEnd: "2026-09-30", statementOpeningBalance: 0, statementClosingBalance: matchedNet, transactionIds: reconciliationData.body.candidates.map((row) => row.id) }),
  });
  assert.equal(reconciliation.response.status, 201, `Bank reconciliation failed: ${JSON.stringify(reconciliation.body)}`);
  assert.equal(Number(reconciliation.body.difference), 0);
  const completedReconciliation = await jsonRequest(`/api/finance/reconciliations/${reconciliation.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "COMPLETE" }),
  });
  assert.equal(completedReconciliation.response.status, 200);
  assert.equal(completedReconciliation.body.status, "COMPLETED");
  const fiscalCalendar = await jsonRequest("/api/finance/fiscal-calendar");
  assert.equal(fiscalCalendar.response.status, 200);
  assert.equal(fiscalCalendar.body.periods.length, 12);
  const closablePeriod = fiscalCalendar.body.periods.find((period) => period.status === "OPEN" && !(period.blockers ?? []).length && new Date(period.endDate) < new Date("2026-09-01"));
  assert.ok(closablePeriod);
  const closedPeriod = await jsonRequest(`/api/finance/fiscal-periods/${closablePeriod.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "CLOSE" }),
  });
  assert.equal(closedPeriod.response.status, 200);
  assert.equal(closedPeriod.body.status, "CLOSED");
  const reopenedPeriod = await jsonRequest(`/api/finance/fiscal-periods/${closablePeriod.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "REOPEN", reason: "Production smoke verification" }),
  });
  assert.equal(reopenedPeriod.response.status, 200);
  assert.equal(reopenedPeriod.body.status, "OPEN");
  const executiveDashboard = await jsonRequest("/api/analytics?from=2026-09-01&to=2026-09-30");
  assert.equal(executiveDashboard.response.status, 200);
  assert.ok(Number(executiveDashboard.body.kpis.sales) > 0);
  assert.ok(executiveDashboard.body.materials.some((row) => row.itemId === itemResult.body.id));
  const readingReport = await jsonRequest("/api/reports/legacy?report=equipment-readings&from=2026-09-20&to=2026-09-30");
  assert.equal(readingReport.response.status, 200);
  assert.ok(readingReport.body.rows.some((row) => row.id === physicalReading.body.id));
  const monthlyReport = await jsonRequest("/api/reports/legacy?report=monthly-comparison&from=2026-09-01&to=2026-09-30");
  assert.equal(monthlyReport.response.status, 200);
  assert.equal(monthlyReport.body.rows[0].month, "2026-09");
  console.log("PASS production executive dashboard, legacy reports, readings, filters, and drill-down data");
  console.log("PASS production fiscal calendar, guarded period close, and audited reopen");
  console.log("PASS production credit note, accrual adjustment, journals, and VAT integration");
  console.log("PASS production VAT reconciliation, filing, settlement, and bank reconciliation");
  console.log("PASS production sales and purchase workflows, accounting idempotency, and attachment upload");
  console.log("PASS production note to stock to transport flow on isolated database");
  console.log("PASS production inventory write/read flow on isolated database");
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    server.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
