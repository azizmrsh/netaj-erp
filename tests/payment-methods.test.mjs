import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { createBankAccount, ensureFinanceFoundation } from "../lib/finance.ts";
import { listPaymentMethods, paymentMethodsWorkspace, savePaymentMethod, setPaymentMethodActive, validatePaymentMethodForUse } from "../lib/payment-methods.ts";
import { runWithDataScope } from "../lib/data-scope.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-payment-methods-tests-")), databasePath = join(directory, "methods.db"), suffix = Date.now().toString(36).toUpperCase();
let prisma, bank, otherBank, branch, user, outsider, method;
const run = callback => runWithDataScope({ tenantId: 1, companyId: 1 }, () => prisma.$transaction(callback));
const save = input => run(tx => savePaymentMethod(tx, input, "methods-test"));
const use = extra => run(tx => validatePaymentMethodForUse(tx, { code: method.code, use: "RECEIPT", bankAccountId: bank.id, currency: "SAR", branchId: branch.id, userId: user.id, ...extra }));

before(async () => {
  const source = new Database("prisma/netaj.db", { readonly: true }); await source.backup(databasePath); source.close();
  prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
  await run(ensureFinanceFoundation);
  bank = await run(tx => createBankAccount(tx, { name: `بنك الطريقة ${suffix}`, openingBalance: 0 }));
  otherBank = await run(tx => createBankAccount(tx, { name: `بنك طريقة آخر ${suffix}`, openingBalance: 0 }));
  branch = await prisma.branch.create({ data: { companyId: 1, code: `PM-${suffix}`, nameAr: "فرع طرق الدفع" } });
  user = await prisma.platformUser.create({ data: { email: `pm-${suffix}@example.test`, name: "مستخدم طرق الدفع", memberships: { create: { tenantId: 1, companies: { create: { companyId: 1 } } } } } });
  outsider = await prisma.platformUser.create({ data: { email: `pm-other-${suffix}@example.test`, name: "مستخدم خارج الشركة" } });
});
after(async () => { await prisma?.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("إعداد طريقة الدفع يحفظ كل الروابط والصلاحيات مع أثر تدقيق دون إنشاء قيد", async () => {
  const count = await prisma.journalEntry.count();
  method = await save({ code: `PM-${suffix}`, nameAr: "تحويل فرع مخصص", nameEn: "Branch transfer", type: "TRANSFER", displayOrder: 37, accountId: bank.ledgerAccountId, bankAccountId: bank.id, currency: "SAR", branchId: branch.id, showInSales: false, showInPurchases: true, showInReceipt: true, showInPayment: false, allowedUserIds: [user.id] });
  assert.equal(method.displayOrder, 37); assert.equal(method.bankAccountId, bank.id); assert.equal(method.branchId, branch.id); assert.equal(method.showInSales, false); assert.equal(method.nameEn, "Branch transfer"); assert.deepEqual(method.allowedUserIds, [user.id]);
  assert.equal(await prisma.journalEntry.count(), count);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "PAYMENT_METHOD_CREATE", entityId: method.id } }));
  const workspace = await run(paymentMethodsWorkspace);
  assert.equal(workspace.methods.find(row => row.id === method.id).currency, "SAR");
  assert.ok(workspace.users.some(row => row.id === user.id)); assert.ok(!workspace.users.some(row => row.id === outsider.id));
});
test("طريقة الدفع تفرض ربط البنك والعملة والفرع والظهور والمستخدم عند الاستعمال", async () => {
  assert.equal((await use()).id, method.id);
  await assert.rejects(use({ use: "PAYMENT" }), /غير مسموحة/);
  await assert.rejects(use({ bankAccountId: otherBank.id }), /لا يطابق/);
  await assert.rejects(use({ currency: "USD" }), /العملة|عملة/);
  await assert.rejects(use({ branchId: null }), /لفرع آخر/);
  await assert.rejects(use({ userId: outsider.id }), /صلاحية/);
});
test("الإيقاف لا يحذف الإعدادات ويستبعد الطريقة من الخيارات مع سجل تدقيق", async () => {
  await run(tx => setPaymentMethodActive(tx, method.code, false, "methods-test"));
  assert.ok(!(await run(tx => listPaymentMethods(tx))).some(row => row.id === method.id));
  assert.equal((await run(tx => listPaymentMethods(tx, true))).find(row => row.id === method.id).isActive, false);
  await assert.rejects(use(), /موقوفة/);
  assert.ok(await prisma.auditLog.findFirst({ where: { action: "PAYMENT_METHOD_DISABLE", entityId: method.id } }));
  await run(tx => setPaymentMethodActive(tx, method.code, true, "methods-test"));
  assert.equal((await use()).isActive, true);
});
test("منع الهوية المكررة والروابط غير الصالحة وعدم مسح metadata عند تعديل الاسم", async () => {
  await assert.rejects(save({ code: method.code, nameAr: "مكرر" }), /مستخدم/);
  const edited = await save({ id: method.id, code: method.code, nameAr: "تعديل آمن" });
  assert.equal(edited.branchId, branch.id); assert.equal(edited.accountId, bank.ledgerAccountId); assert.deepEqual(edited.allowedUserIds, [user.id]);
  await assert.rejects(save({ id: method.id, code: method.code, nameAr: "غير صالح", displayOrder: -1 }), /الترتيب|ترتيب/);
  await assert.rejects(save({ id: method.id, code: method.code, nameAr: "غير صالح", allowedUserIds: [outsider.id] }), /غير مخول/);
  await assert.rejects(save({ id: method.id, code: method.code, nameAr: "غير صالح", bankAccountId: otherBank.id }), /يطابق/);
  await assert.rejects(save({ id: method.id, code: `${method.code}-RENAME`, nameAr: "تغيير هوية" }), /ثابت/);
  await assert.rejects(save({ code: `BAD-${suffix}`, nameAr: "غير صالح", isActive: "false" }), /غير صحيحة/);
});
test("عزل الشركات يحمي الإعدادات والروابط مع إبقاء الأكواد القديمة دون تعطيل غير مقصود", async () => {
  const company = await prisma.company.create({ data: { tenantId: 1, code: `PM-C-${suffix}`, legalNameAr: "شركة اختبار مستقلة" } });
  const other = callback => runWithDataScope({ tenantId: 1, companyId: company.id }, () => prisma.$transaction(callback));
  assert.ok(!(await other(tx => listPaymentMethods(tx, true))).some(row => row.id === method.id));
  await assert.rejects(other(tx => setPaymentMethodActive(tx, method.code, false, "methods-test")), /غير موجودة/);
  await assert.rejects(other(tx => savePaymentMethod(tx, { code: "CASH", nameAr: "نقد", accountId: bank.ledgerAccountId }, "methods-test")), /الشركة/);
  assert.equal(await other(tx => validatePaymentMethodForUse(tx, { code: "CASH", use: "RECEIPT", bankAccountId: bank.id, currency: "SAR" })), null);
  await other(tx => savePaymentMethod(tx, { code: "CASH", nameAr: "نقد موقوف", isActive: false }, "methods-test"));
  await assert.rejects(other(tx => validatePaymentMethodForUse(tx, { code: "CASH", use: "RECEIPT", bankAccountId: bank.id, currency: "SAR" })), /موقوفة/);
  await assert.rejects(other(tx => validatePaymentMethodForUse(tx, { code: "UNDEFINED", use: "RECEIPT", bankAccountId: bank.id, currency: "SAR" })), /غير معرفة/);
});
