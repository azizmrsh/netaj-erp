import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { ensureAccountingFoundation } from "../lib/accounting.ts";
import { applyStockMovement } from "../lib/inventory.ts";
import { assetWorkspace, saveAsset } from "../lib/assets.ts";
import { crmWorkspace, saveCrm } from "../lib/crm.ts";
import {
  BusinessModuleError,
  approvalsWorkspace,
  dmsWorkspace,
  integrationWorkspace,
  portalPartyWorkspace,
  saveApproval,
  saveDms,
  saveIntegration,
  savePortal,
  saveTreasuryAdjustment,
  treasuryWorkspace,
} from "../lib/business-modules.ts";
import { scopePrismaArgs, scopedModels } from "../lib/data-scope.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-business-modules-"));
const database = join(directory, "phase-k.db");
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
let partyA, partyB, item, assetAccounts;

before(async () => {
  await prisma.$transaction((tx) => ensureAccountingFoundation(tx));
  [partyA, partyB] = await Promise.all([
    prisma.party.create({ data: { nameAr: `عميل أ ${suffix}`, isCustomer: true } }),
    prisma.party.create({ data: { nameAr: `عميل ب ${suffix}`, isCustomer: true } }),
  ]);
  const unit = await prisma.unit.create({ data: { code: `K-${suffix}`, nameAr: "قطعة", nameEn: "Piece" } });
  item = await prisma.item.create({ data: { code: `K-ITEM-${suffix}`, nameAr: "قطعة صيانة", unitId: unit.id } });
  assetAccounts = {
    asset: await prisma.account.create({ data: { code: `K-A-${suffix}`, nameAr: "أصول اختبار", accountType: "ASSET" } }),
    accumulated: await prisma.account.create({ data: { code: `K-C-${suffix}`, nameAr: "مجمع إهلاك", accountType: "ASSET" } }),
    expense: await prisma.account.create({ data: { code: `K-E-${suffix}`, nameAr: "مصروف إهلاك", accountType: "EXPENSE" } }),
    credit: await prisma.account.create({ data: { code: `K-P-${suffix}`, nameAr: "دائن اقتناء", accountType: "LIABILITY" } }),
  };
});

after(async () => {
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  await prisma.$disconnect();
  rmSync(directory, { recursive: true, force: true });
});

test("CRM يغطي العميل المحتمل والفرصة والنشاط وخط الأنابيب", async () => {
  const lead = await prisma.$transaction((tx) => saveCrm(tx, { action: "LEAD", name: "عميل محتمل", companyName: "شركة محتملة" }, "test"));
  const opportunity = await prisma.$transaction((tx) => saveCrm(tx, { action: "OPPORTUNITY", leadId: lead.id, name: "فرصة توريد", expectedValue: 25000, probability: 40 }, "test"));
  const activity = await prisma.$transaction((tx) => saveCrm(tx, { action: "ACTIVITY", leadId: lead.id, opportunityId: opportunity.id, activityType: "CALL", subject: "اتصال متابعة" }, "test"));
  await prisma.$transaction((tx) => saveCrm(tx, { action: "COMPLETE_ACTIVITY", id: activity.id, outcome: "موعد عرض" }, "test"));
  await prisma.$transaction((tx) => saveCrm(tx, { action: "STAGE", id: opportunity.id, stage: "WON" }, "test"));
  const workspace = await prisma.$transaction((tx) => crmWorkspace(tx));
  assert.equal(workspace.opportunities.find((row) => row.id === opportunity.id)?.status, "WON");
  assert.equal(workspace.activities.find((row) => row.id === activity.id)?.status, "COMPLETED");
  assert.ok(workspace.pipeline.WON.value >= 25000);
});

test("CRM يحول الفرصة المرتبطة بعميل إلى عرض سعر فعلي مرة واحدة", async () => {
  const opportunity = await prisma.$transaction((tx) => saveCrm(tx, { action: "OPPORTUNITY", partyId: partyA.id, name: "فرصة عرض مباشر", expectedValue: 500 }, "test"));
  const quotation = await prisma.$transaction((tx) => saveCrm(tx, { action: "QUOTATION", opportunityId: opportunity.id, itemId: item.id, quantity: 2, unitPrice: 100, vatRate: 15 }, "test"));
  assert.equal(quotation.documentType, "QUOTATION");
  assert.equal(quotation.partyId, partyA.id);
  assert.equal(Number(quotation.totalAmount), 230);
  const duplicate = await prisma.$transaction((tx) => saveCrm(tx, { action: "QUOTATION", opportunityId: opportunity.id, itemId: item.id, quantity: 9, unitPrice: 999 }, "test"));
  assert.equal(duplicate.id, quotation.id);
  assert.equal(await prisma.businessDocument.count({ where: { id: quotation.id } }), 1);
  const refreshed = await prisma.crmOpportunity.findUniqueOrThrow({ where: { id: opportunity.id } });
  assert.equal(refreshed.businessDocumentId, quotation.id);
  assert.equal(refreshed.stage, "PROPOSAL");
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "CRM_OPPORTUNITY_TO_QUOTATION", entityId: opportunity.id } }));
  const workspace = await prisma.$transaction((tx) => crmWorkspace(tx));
  assert.equal(workspace.opportunities.find((row) => row.id === opportunity.id)?.quotation?.documentNumber, quotation.documentNumber);
});

test("الأصل ينشئ قيد اقتناء وإهلاك متوازن ويحافظ على القيمة الدفترية", async () => {
  const category = await prisma.$transaction((tx) => saveAsset(tx, {
    action: "CATEGORY", tenantId: 1, companyId: 1, code: `VEH-${suffix}`, name: "مركبات",
    usefulLifeMonths: 10, assetAccountId: assetAccounts.asset.id,
    accumulatedDepreciationAccountId: assetAccounts.accumulated.id,
    depreciationExpenseAccountId: assetAccounts.expense.id,
  }, "test"));
  const asset = await prisma.$transaction((tx) => saveAsset(tx, {
    action: "ASSET", categoryId: category.id, name: "معدة اختبار", acquisitionDate: new Date().toISOString(),
    acquisitionCost: 1000, residualValue: 100, creditAccountId: assetAccounts.credit.id,
  }, "test"));
  const depreciation = await prisma.$transaction((tx) => saveAsset(tx, { action: "DEPRECIATE", id: asset.id, periodDate: new Date().toISOString() }, "test"));
  assert.equal(Number(depreciation.amount), 90);
  assert.equal(Number(depreciation.bookValueAfter), 910);
  const journals = await prisma.journalEntry.findMany({ where: { referenceType: { in: ["ASSET_ACQUISITION", "ASSET_DEPRECIATION"] } }, include: { lines: true } });
  assert.equal(journals.length, 2);
  assert.ok(journals.every((journal) => Number(journal.totalDebit) === Number(journal.totalCredit)));
});

test("الصيانة الوقائية تستهلك قطع الغيار من مخزون الشركة وتحسب تكلفة دورة الحياة", async () => {
  await prisma.$transaction((tx) => applyStockMovement(tx, { itemId: item.id, ownershipType: "COMPANY", movementType: "OPENING", quantityIn: 10, unitCost: 5 }));
  const asset = await prisma.asset.findFirstOrThrow({ orderBy: { id: "desc" } });
  const plan = await prisma.$transaction((tx) => saveAsset(tx, { action: "PLAN", assetId: asset.id, name: "شهري", intervalDays: 30, nextDueAt: new Date().toISOString() }, "test"));
  const workOrder = await prisma.$transaction((tx) => saveAsset(tx, { action: "WORK_ORDER", assetId: asset.id, planId: plan.id, workType: "PREVENTIVE", description: "صيانة شهرية", spareParts: [{ itemId: item.id, quantity: 2, unitCost: 5 }] }, "test"));
  await prisma.$transaction((tx) => saveAsset(tx, { action: "COMPLETE_WORK_ORDER", id: workOrder.id, resolution: "تم", laborCost: 20, externalCost: 10 }, "test"));
  const stock = await prisma.companyStock.findUniqueOrThrow({ where: { itemId: item.id } });
  const workspace = await prisma.$transaction((tx) => assetWorkspace(tx));
  const row = workspace.assets.find((entry) => entry.id === asset.id);
  assert.equal(Number(stock.quantity), 8);
  assert.equal(Number(row.lifecycleCost), 1040);
  assert.ok(await prisma.stockMovement.findFirst({ where: { referenceType: "MAINTENANCE_WORK_ORDER", referenceId: workOrder.id } }));
});

test("إدارة المستندات تحفظ النسخ والصلاحيات وتنبه للانتهاء", async () => {
  const category = await prisma.$transaction((tx) => saveDms(tx, { action: "CATEGORY", tenantId: 1, companyId: 1, code: `CON-${suffix}`, name: "عقود" }, 1));
  const document = await prisma.$transaction((tx) => saveDms(tx, { action: "DOCUMENT", categoryId: category.id, title: "عقد عميل", ownerType: "PARTY", ownerId: partyA.id, expiryDate: new Date(Date.now() + 5 * 86_400_000).toISOString() }, 1));
  const attachment = await prisma.attachment.create({ data: { entityType: "MANAGED_DOCUMENT", entityId: document.id, originalName: "contract.pdf", storedName: `${suffix}.pdf`, storagePath: "test", mimeType: "application/pdf", size: 10 } });
  const version = await prisma.$transaction((tx) => saveDms(tx, { action: "VERSION", documentId: document.id, attachmentId: attachment.id, changeNotes: "نسخة أولى" }, 1));
  await prisma.$transaction((tx) => saveDms(tx, { action: "PERMISSION", documentId: document.id, subjectType: "ROLE", subjectId: "ADMIN", canRead: true, canUpdate: true }, 1));
  const workspace = await prisma.$transaction((tx) => dmsWorkspace(tx));
  assert.equal(version.version, 1);
  assert.ok(workspace.expiryAlerts.some((row) => row.id === document.id));
  assert.equal(workspace.documents.find((row) => row.id === document.id)?.permissions[0].canUpdate, true);
});

test("صندوق الموافقات الموحد يحدّث المستند المصدر ويسجل القرار والتدقيق", async () => {
  const sale = await prisma.sale.create({ data: { invoiceNumber: `K-S-${suffix}`, partyId: partyA.id, totalAmount: 100, functionalTotalAmount: 100, status: "PENDING" } });
  const request = await prisma.$transaction((tx) => saveApproval(tx, { action: "REQUEST", tenantId: 1, companyId: 1, moduleKey: "SALES", entityType: "SALE", entityId: sale.id, entityNumber: sale.invoiceNumber, title: "اعتماد بيع", amount: 100 }, 1));
  await assert.rejects(prisma.$transaction((tx) => saveApproval(tx, { action: "APPROVE", id: request.id }, 1)), /فصل المهام/);
  await prisma.$transaction((tx) => saveApproval(tx, { action: "APPROVE", id: request.id, comment: "معتمد" }, 2));
  const workspace = await prisma.$transaction((tx) => approvalsWorkspace(tx));
  assert.equal((await prisma.sale.findUniqueOrThrow({ where: { id: sale.id } })).status, "APPROVED");
  assert.equal(workspace.requests.find((row) => row.id === request.id)?.actions[0].comment, "معتمد");
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "APPROVAL_APPROVE", entityId: sale.id } }));
});

test("بوابة الطرف لا تقبل partyId من الطلب ولا تعرض بيانات طرف آخر", async () => {
  await prisma.sale.createMany({ data: [
    { invoiceNumber: `PORT-A-${suffix}`, partyId: partyA.id, totalAmount: 30, functionalTotalAmount: 30 },
    { invoiceNumber: `PORT-B-${suffix}`, partyId: partyB.id, totalAmount: 40, functionalTotalAmount: 40 },
  ] });
  const identity = await prisma.$transaction((tx) => savePortal(tx, { action: "IDENTITY", partyId: partyA.id, email: `a-${suffix}@example.test`, permissions: ["INVOICES", "ORDERS", "DOCUMENTS"] }));
  const workspace = await prisma.$transaction((tx) => portalPartyWorkspace(tx, identity.id));
  assert.equal(workspace.party.id, partyA.id);
  assert.ok(workspace.sales.some((row) => row.invoiceNumber === `PORT-A-${suffix}`));
  assert.ok(workspace.sales.every((row) => row.partyId === partyA.id));
  assert.ok(!workspace.sales.some((row) => row.invoiceNumber === `PORT-B-${suffix}`));
});

test("الخزينة تجمع النقد الفعلي وAR/AP والتعديلات الاحتمالية لتوقع 7/30/90 يومًا", async () => {
  const bank = await prisma.bankAccount.findFirst() ?? await prisma.bankAccount.create({ data: { name: "بنك اختبار", accountNumber: suffix, ledgerAccountId: assetAccounts.asset.id, currentBalance: 500 } });
  await prisma.bankAccount.update({ where: { id: bank.id }, data: { currentBalance: 500 } });
  await prisma.sale.create({ data: { invoiceNumber: `K-AR-${suffix}`, partyId: partyA.id, dueDate: new Date(Date.now() + 2 * 86_400_000), totalAmount: 120, functionalTotalAmount: 120 } });
  await prisma.purchase.create({ data: { purchaseNumber: `K-PUR-${suffix}`, partyId: partyB.id, dueDate: new Date(Date.now() + 2 * 86_400_000), totalAmount: 80, functionalTotalAmount: 80 } });
  await prisma.$transaction((tx) => saveTreasuryAdjustment(tx, { forecastDate: new Date(Date.now() + 2 * 86_400_000).toISOString(), direction: "OUT", description: "التزام متوقع", amount: 100, probability: 50 }));
  const workspace = await prisma.$transaction((tx) => treasuryWorkspace(tx));
  assert.ok(workspace.cashPosition >= 500);
  assert.ok(workspace.upcomingCollections.some((row) => row.sourceType === "SALE"));
  assert.ok(workspace.upcomingObligations.some((row) => row.sourceType === "PURCHASE"));
  assert.ok(workspace.forecasts.days90 === workspace.cashPosition + workspace.events.reduce((total, event) => total + (event.direction === "IN" ? event.amount : -event.amount), 0));
});

test("التكاملات لا تحفظ أسرارًا بلا مفتاح وتفرض HTTPS وتعرض الأسرار مرة واحدة فقط", async () => {
  delete process.env.INTEGRATION_ENCRYPTION_KEY;
  await assert.rejects(prisma.$transaction((tx) => saveIntegration(tx, { action: "CONNECTION", tenantId: 1, companyId: 1, code: `PAY-${suffix}`, providerType: "PAYMENT", name: "بوابة", credentials: { token: "secret" } }, "test")), (error) => error instanceof BusinessModuleError && error.status === 409);
  process.env.INTEGRATION_ENCRYPTION_KEY = `test-key-${suffix}`;
  await prisma.$transaction((tx) => saveIntegration(tx, { action: "CONNECTION", tenantId: 1, companyId: 1, code: `PAY-${suffix}`, providerType: "PAYMENT", name: "بوابة", credentials: { token: "secret" } }, "test"));
  await assert.rejects(prisma.$transaction((tx) => saveIntegration(tx, { action: "WEBHOOK", tenantId: 1, companyId: 1, code: `BAD-${suffix}`, url: "http://example.test", eventTypes: ["sale.posted"] }, "test")), /HTTPS/);
  const endpoint = await prisma.$transaction((tx) => saveIntegration(tx, { action: "WEBHOOK", tenantId: 1, companyId: 1, code: `HOOK-${suffix}`, url: "https://example.test/hook", eventTypes: ["sale.posted"] }, "test"));
  assert.ok(endpoint.secret);
  await prisma.$transaction((tx) => saveIntegration(tx, { action: "QUEUE_EVENT", endpointId: endpoint.id, eventType: "sale.posted", payload: { id: 1 } }, "test"));
  const workspace = await prisma.$transaction((tx) => integrationWorkspace(tx));
  const safeConnection = workspace.connections.find((row) => row.code === `PAY-${suffix}`);
  assert.equal(safeConnection.credentialsConfigured, true);
  assert.equal("encryptedCredentials" in safeConnection, false);
  assert.equal(workspace.endpoints.find((row) => row.id === endpoint.id)?.secretHash, "[REDACTED]");
  assert.ok(workspace.deliveries.some((row) => row.endpointId === endpoint.id && row.status === "PENDING"));
});

test("كل نماذج Phase K تخضع لعزل tenant/company حتى مع ID مباشر", () => {
  for (const model of ["CrmLead", "CrmOpportunity", "CrmActivity", "Asset", "AssetDepreciation", "MaintenanceWorkOrder", "ManagedDocument", "UnifiedApprovalRequest", "PortalIdentity", "TreasuryForecastAdjustment", "IntegrationConnection", "WebhookEndpoint", "WebhookDelivery"]) assert.ok(scopedModels.has(model), model);
  const args = scopePrismaArgs("findUnique", { where: { id: 1 } }, { tenantId: 99, companyId: 88 });
  assert.deepEqual(args.where, { id: 1, tenantId: 99, companyId: 88 });
});
