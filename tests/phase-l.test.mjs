import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { askAssistant, AssistantError, interpretAssistantCommand, saveAssistantProposal } from "../lib/assistant.ts";
import { audit, verifyAuditChain } from "../lib/audit.ts";
import { createVerifiedDatabaseBackup } from "../lib/backup.ts";
import { scanControlAlerts } from "../lib/controls.ts";
import { scopedModels } from "../lib/data-scope.ts";
import { globalSearch } from "../lib/global-search.ts";
import { beginMfaEnrollment, confirmMfaEnrollment, currentTotp, verifyUserMfa } from "../lib/mfa.ts";
import { assertRateLimit, clearRateLimit, RateLimitError } from "../lib/rate-limit.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-phase-l-")), database = join(directory, "phase-l.db");
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
const allModules = new Set(["CORE", "ACCOUNTING", "INVENTORY", "FACTORY", "TRANSPORT", "SALES", "PURCHASES", "PROJECTS", "CRM", "DMS"]);
const context = { userId: 1, enabledModules: allModules, permissions: new Set(["CRM.CREATE", "CORE.CREATE", "SALES.CREATE", "PURCHASES.CREATE", "ACCOUNTING.CREATE", "INVENTORY.CREATE", ...[...allModules].map((module) => `${module}.READ`)]) };
let supplier, voiceCustomer, voiceItem, voiceBank;

before(async () => {
  process.env.MFA_ENCRYPTION_KEY = `phase-l-key-${suffix}`;
  supplier = await prisma.party.create({ data: { nameAr: `مورد رقابي ${suffix}`, isSupplier: true, iban: `SA${suffix}` } });
  await prisma.party.create({ data: { nameAr: `مورد IBAN ثان ${suffix}`, isSupplier: true, iban: `SA${suffix}` } });
  voiceCustomer = await prisma.party.create({ data: { nameAr: `عميل صوتي ${suffix}`, isCustomer: true } });
  const unit = await prisma.unit.create({ data: { code: `VOICE-${suffix}`, nameAr: "طن صوتي", nameEn: "Voice Ton" } });
  voiceItem = await prisma.item.create({ data: { code: `VOICE-ITEM-${suffix}`, nameAr: `مادة صوتية ${suffix}`, unitId: unit.id, vatRate: 15 } });
  await prisma.companyStock.create({ data: { itemId: voiceItem.id, quantity: 20, averageCost: 12 } });
  const bankLedger = await prisma.account.create({ data: { code: `VOICE-BANK-${suffix}`, nameAr: "حساب بنك صوتي", accountType: "ASSET" } });
  voiceBank = await prisma.bankAccount.create({ data: { name: `بنك صوتي ${suffix}`, bankName: `بنك صوتي ${suffix}`, ledgerAccountId: bankLedger.id, currentBalance: 10000, openingBalance: 10000 } });
});
after(async () => { delete process.env.MFA_ENCRYPTION_KEY; await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("مساعد ERP يجيب من بيانات الشركة ويحفظ سياق متابعة قابلًا للتدقيق", async () => {
  const first = await prisma.$transaction((tx) => askAssistant(tx, { question: "كم السيولة؟" }, context));
  assert.equal(first.intent, "LIQUIDITY"); assert.equal(first.responseType, "TABLE"); assert.match(first.answer, /السيولة/);
  const followUp = await prisma.$transaction((tx) => askAssistant(tx, { conversationId: first.conversationId, question: "قارنها" }, context));
  assert.equal(followUp.intent, "LIQUIDITY");
  await assert.rejects(prisma.$transaction((tx) => askAssistant(tx, { conversationId: first.conversationId, question: "cash" }, { ...context, userId: 999 })), (error) => error instanceof AssistantError && error.status === 404);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "ASSISTANT_QUERY", entityId: first.conversationId } }));
});

test("المساعد لا يكشف وحدة بلا صلاحية", async () => {
  await assert.rejects(prisma.$transaction((tx) => askAssistant(tx, { question: "شو وضع المصنع؟" }, { userId: 1, enabledModules: new Set(["CORE"]), permissions: new Set(["CORE.READ"]) })), (error) => error instanceof AssistantError && error.code === "ASSISTANT_PERMISSION_DENIED");
});

test("إجراء المساعد الحساس يمر عبر Preview ثم Confirm ويمكن إلغاؤه", async () => {
  const conversation = await prisma.assistantConversation.create({ data: { userId: 1, title: "Actions" } });
  const proposal = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "PROPOSE", actionType: "CRM_TASK", conversationId: conversation.id, payload: { subject: "متابعة عميل", partyId: supplier.id } }, context));
  assert.equal(proposal.status, "PENDING"); assert.match(proposal.previewJson, /متابعة عميل/);
  const confirmed = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CONFIRM", id: proposal.id }, context));
  assert.equal(confirmed.activity.activityType, "TASK");
  const second = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "PROPOSE", actionType: "CRM_TASK", conversationId: conversation.id, payload: { subject: "مهمة ملغاة" } }, context));
  assert.equal((await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CANCEL", id: second.id }, context))).status, "CANCELLED");
});

test("NETAJ ONE يحول إضافة عميل صوتية إلى Preview ثم ينفذها بعد الاعتماد فقط", async () => {
  const before = await prisma.party.count(), proposal = await prisma.$transaction((tx) => interpretAssistantCommand(tx, { command: `أضف عميل شركة إعمار ${suffix} في الرياض ورقم الهاتف 0501234567` }, context));
  assert.equal(proposal.actionType, "PARTY_CREATE"); assert.equal(await prisma.party.count(), before); assert.match(proposal.previewJson, /إعمار/);
  const confirmed = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CONFIRM", id: proposal.id }, context));
  assert.equal(confirmed.party.isCustomer, true); assert.equal(confirmed.party.telephone, "0501234567");
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "ASSISTANT_CONFIRMED_ACTION", entityType: "PARTY_CREATE", entityId: confirmed.party.id } }));
});

test("NETAJ ONE يجهز أمر بيع مترابط ولا يحرك المخزون أو GL قبل المستندات اللاحقة", async () => {
  const stockBefore = await prisma.stockMovement.count(), journalsBefore = await prisma.journalEntry.count();
  const proposal = await prisma.$transaction((tx) => interpretAssistantCommand(tx, { command: `بعنا 300 طن للعميل ${voiceCustomer.nameAr} من المادة ${voiceItem.code} بسعر 2450 للطن` }, context));
  assert.equal(proposal.actionType, "SALES_WORKFLOW_DRAFT"); assert.match(proposal.previewJson, /300/); assert.equal(await prisma.businessDocument.count({ where: { partyId: voiceCustomer.id, documentType: "SALES_ORDER" } }), 0);
  const confirmed = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CONFIRM", id: proposal.id }, context));
  assert.equal(confirmed.document.documentType, "SALES_ORDER"); assert.equal(confirmed.document.status, "DRAFT");
  assert.equal(await prisma.stockMovement.count(), stockBefore); assert.equal(await prisma.journalEntry.count(), journalsBefore);
});

test("NETAJ ONE يجهز أمر شراء كمسودة دون مخزون أو AP أو GL", async () => {
  const stockBefore = await prisma.stockMovement.count(), journalsBefore = await prisma.journalEntry.count();
  const proposal = await prisma.$transaction((tx) => interpretAssistantCommand(tx, { command: `طلب شراء 4 طن من المادة ${voiceItem.code} من المورد ${supplier.nameAr} بسعر 75` }, context));
  assert.equal(proposal.actionType, "PURCHASE_WORKFLOW_DRAFT"); assert.equal(await prisma.businessDocument.count({ where: { partyId: supplier.id, documentType: "PURCHASE_ORDER" } }), 0);
  const confirmed = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CONFIRM", id: proposal.id }, context));
  assert.equal(confirmed.document.documentType, "PURCHASE_ORDER"); assert.equal(confirmed.document.status, "DRAFT"); assert.equal(await prisma.stockMovement.count(), stockBefore); assert.equal(await prisma.journalEntry.count(), journalsBefore);
});

test("NETAJ ONE ينشئ سند صرف كمسودة ولا يحرك البنك أو GL", async () => {
  const balanceBefore = Number(voiceBank.currentBalance), journalsBefore = await prisma.journalEntry.count();
  const proposal = await prisma.$transaction((tx) => interpretAssistantCommand(tx, { command: `ادفع 125 للمورد ${supplier.nameAr} من ${voiceBank.name}` }, context));
  assert.equal(proposal.actionType, "FINANCIAL_VOUCHER_DRAFT"); assert.equal(await prisma.financialVoucher.count({ where: { partyId: supplier.id, amount: 125 } }), 0);
  const confirmed = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CONFIRM", id: proposal.id }, context));
  assert.equal(confirmed.voucher.status, "DRAFT"); assert.equal(Number((await prisma.bankAccount.findUniqueOrThrow({ where: { id: voiceBank.id } })).currentBalance), balanceBefore); assert.equal(await prisma.journalEntry.count(), journalsBefore);
});

test("NETAJ ONE يعرض تحويل الملكية أولًا ثم ينفذ حركتين مترابطتين بعد الاعتماد", async () => {
  const movementBefore = await prisma.stockMovement.count(), proposal = await prisma.$transaction((tx) => interpretAssistantCommand(tx, { command: `حوّل ملكية 3 طن من المادة ${voiceItem.code} من الشركة إلى العميل ${voiceCustomer.nameAr}` }, context));
  assert.equal(proposal.actionType, "OWNERSHIP_TRANSFER"); assert.equal(await prisma.stockMovement.count(), movementBefore);
  const confirmed = await prisma.$transaction((tx) => saveAssistantProposal(tx, { action: "CONFIRM", id: proposal.id }, context));
  assert.equal(await prisma.stockMovement.count(), movementBefore + 2); assert.equal(confirmed.transfer.source.newQuantity, 17); assert.equal(confirmed.transfer.destination.newQuantity, 3);
});

test("MFA يفعّل TOTP ويصدر رموز استرداد أحادية الاستخدام", async () => {
  const user = await prisma.platformUser.create({ data: { email: `mfa-${suffix}@test.local`, name: "MFA Test" } });
  const enrollment = await prisma.$transaction((tx) => beginMfaEnrollment(tx, user.id, user.email));
  const confirmed = await prisma.$transaction((tx) => confirmMfaEnrollment(tx, user.id, enrollment.factorId, currentTotp(enrollment.secret)));
  assert.equal(confirmed.enabled, true); assert.equal(confirmed.recoveryCodes.length, 8);
  await prisma.$transaction((tx) => verifyUserMfa(tx, user.id, confirmed.recoveryCodes[0]));
  await assert.rejects(prisma.$transaction((tx) => verifyUserMfa(tx, user.id, confirmed.recoveryCodes[0])), /غير صحيح/);
});

test("الفحص الرقابي يرصد التكرار وتجاوز أمر الشراء بصياغة غير اتهامية", async () => {
  const order = await prisma.businessDocument.create({ data: { documentNumber: `K-PO-${suffix}`, documentType: "PURCHASE_ORDER", direction: "PURCHASE", partyId: supplier.id, totalAmount: 50 } });
  await prisma.purchase.createMany({ data: [
    { purchaseNumber: `K-DUP1-${suffix}`, supplierInvoiceNumber: `SUP-${suffix}`, partyId: supplier.id, sourceOrderId: order.id, totalAmount: 100, functionalTotalAmount: 100 },
    { purchaseNumber: `K-DUP2-${suffix}`, supplierInvoiceNumber: `SUP-${suffix}`, partyId: supplier.id, totalAmount: 20, functionalTotalAmount: 20 },
  ] });
  const result = await prisma.$transaction((tx) => scanControlAlerts(tx, "test"));
  assert.ok(result.alerts.some((row) => row.alertType === "DUPLICATE_SUPPLIER_INVOICE"));
  assert.ok(result.alerts.some((row) => row.alertType === "DUPLICATE_SUPPLIER_IBAN"));
  assert.ok(result.alerts.some((row) => row.alertType === "SPEND_ABOVE_PO"));
  assert.ok(result.alerts.every((row) => !/fraud|احتيال/i.test(row.description)));
});

test("سلسلة التدقيق تكشف تعديل سجل تاريخي", async () => {
  await prisma.$transaction((tx) => audit(tx, { action: "CHAIN_ONE", entityType: "TEST", entityId: 1 }));
  await prisma.$transaction((tx) => audit(tx, { action: "CHAIN_TWO", entityType: "TEST", entityId: 2 }));
  const valid = await prisma.$transaction((tx) => verifyAuditChain(tx)); assert.equal(valid.valid, true);
  const first = await prisma.auditLog.findFirstOrThrow({ where: { entryHash: { not: null } }, orderBy: { id: "asc" } });
  await prisma.auditLog.update({ where: { id: first.id }, data: { metadata: "tampered" } });
  const invalid = await prisma.$transaction((tx) => verifyAuditChain(tx)); assert.equal(invalid.valid, false); assert.equal(invalid.brokenAtId, first.id);
});

test("البحث العالمي يطبق الوحدات والترقيم ولا يعرض مشتريات دون صلاحيتها", async () => {
  const coreOnly = await prisma.$transaction((tx) => globalSearch(tx, supplier.nameAr, new Set(["CORE"]), 1, 5));
  assert.ok(coreOnly.results.some((row) => row.type === "PARTY")); assert.ok(coreOnly.results.every((row) => ["PARTY", "ITEM"].includes(row.type))); assert.equal(coreOnly.pageSize, 5);
});

test("Rate limiter يمنع التخمين بعد الحد ويمكن مسحه بعد نجاح الدخول", () => {
  const key = `test:${suffix}`; clearRateLimit(key); assertRateLimit(key, 2, 60_000); assertRateLimit(key, 2, 60_000); assert.throws(() => assertRateLimit(key, 2, 60_000), RateLimitError); clearRateLimit(key); assert.doesNotThrow(() => assertRateLimit(key, 2, 60_000));
});

test("نسخة SQLite المتسقة تجتاز integrity وforeign keys ويمكن فتحها كاستعادة", async () => {
  const destination = join(directory, "verified-backup.db"), result = await createVerifiedDatabaseBackup(destination, database);
  assert.equal(result.integrity, "ok"); assert.equal(result.foreignKeyErrors, 0); assert.match(result.checksumSha256, /^[a-f0-9]{64}$/); assert.ok(result.sizeBytes > 0);
});

test("نماذج Phase L التشغيلية كلها ضمن tenant/company", () => {
  for (const model of ["AssistantConversation", "AssistantMessage", "AssistantActionProposal", "ControlAlert", "BackupRecord"]) assert.ok(scopedModels.has(model), model);
});
