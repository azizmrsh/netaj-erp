import type { CompanyConfiguration, Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
export const paymentMethodTypes = ["CASH", "BANK", "TRANSFER", "CHEQUE", "CARD", "MADA", "VISA", "MASTERCARD", "OTHER"] as const;
export type PaymentUse = "SALES" | "PURCHASES" | "RECEIPT" | "PAYMENT";
type Metadata = { type: string; accountId: number | null; bankAccountId: number | null; currency: string | null; branchId: number | null; displayOrder: number; showInSales: boolean; showInPurchases: boolean; showInReceipt: boolean; showInPayment: boolean; allowedUserIds: number[] };
export class PaymentMethodError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
const text = (value: unknown) => String(value ?? "").trim();
const optionalId = (value: unknown): number | null => { if (value === "" || value == null) return null; const n = Number(value); if (!Number.isSafeInteger(n) || n < 1) throw new PaymentMethodError("رقم الربط غير صحيح"); return n; };
function parse(row: CompanyConfiguration) {
  let value: Record<string, unknown> = {};
  try { const parsed = JSON.parse(row.valueJson); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed; } catch { /* legacy methods retain their identity */ }
  const safeId = (n: unknown) => Number.isSafeInteger(Number(n)) && Number(n) > 0 ? Number(n) : null;
  const metadata: Metadata = { type: text(value.type) || "OTHER", accountId: safeId(value.accountId), bankAccountId: safeId(value.bankAccountId), currency: text(value.currency) || null, branchId: safeId(value.branchId), displayOrder: Number(value.displayOrder) || 0, showInSales: value.showInSales !== false, showInPurchases: value.showInPurchases !== false, showInReceipt: value.showInReceipt !== false, showInPayment: value.showInPayment !== false, allowedUserIds: Array.isArray(value.allowedUserIds) ? value.allowedUserIds.flatMap(id => safeId(id) ? [Number(id)] : []) : [] };
  return { ...metadata, id: row.id, code: row.configKey, nameAr: row.labelAr || row.configKey, nameEn: row.labelEn || "", isActive: row.isActive, updatedBy: row.updatedBy, updatedAt: row.updatedAt };
}
export async function listPaymentMethods(tx: Tx, includeInactive = false) {
  const scope = await getVerifiedDataScope();
  const rows = await tx.companyConfiguration.findMany({ where: { ...scope, category: "PAYMENT_METHODS", ...(includeInactive ? {} : { isActive: true }) } });
  return rows.map(parse).sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));
}
export async function availablePaymentMethods(tx: Tx, input: { use: PaymentUse; userId: number | string; branchId?: number | null; bankAccountId?: number | null; currency?: string | null }) {
  const scope = await getVerifiedDataScope(), configured = await listPaymentMethods(tx, true);
  const bank = input.bankAccountId ? await tx.bankAccount.findFirst({ where: { ...scope, id: input.bankAccountId, isActive: true } }) : null;
  if (input.bankAccountId && !bank) throw new PaymentMethodError("البنك المختار غير متاح في الشركة الحالية");
  const currency = (input.currency || bank?.currency || "").toUpperCase();
  const labels: Record<string, string> = { CASH: "نقد", BANK: "بنك", TRANSFER: "تحويل", CHEQUE: "شيك", CARD: "بطاقة", MADA: "مدى", VISA: "Visa", MASTERCARD: "Mastercard", OTHER: "أخرى" };
  // Existing configured rows, even when disabled or hidden, suppress their
  // legacy fallback. This must happen before filtering the choices.
  const codes = new Set(configured.map(row => row.code));
  const defaults = paymentMethodTypes.filter(code => !codes.has(code)).map(code => ({ code, nameAr: labels[code], type: code, isActive: true, branchId: null, currency: null, accountId: null, bankAccountId: null, showInSales: true, showInPurchases: true, showInReceipt: true, showInPayment: true, displayOrder: 10000 + paymentMethodTypes.indexOf(code), allowedUserIds: [] as number[] }));
  return [...configured, ...defaults].filter(row => row.isActive
    && ({ SALES: row.showInSales, PURCHASES: row.showInPurchases, RECEIPT: row.showInReceipt, PAYMENT: row.showInPayment }[input.use])
    && (!row.branchId || row.branchId === input.branchId)
    && (!row.currency || !currency || row.currency === currency)
    && (!row.accountId || !bank || row.accountId === bank.ledgerAccountId)
    && (!row.allowedUserIds.length || row.allowedUserIds.includes(Number(input.userId))))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code))
    .map(row => ({ code: row.code, nameAr: row.nameAr, type: row.type, accountId: row.accountId, bankAccountId: row.bankAccountId, currency: row.currency, branchId: row.branchId, configured: codes.has(row.code) }));
}
export async function paymentMethodsWorkspace(tx: Tx) {
  const scope = await getVerifiedDataScope();
  const [methods, accounts, banks, currencies, branches, users] = await Promise.all([
    listPaymentMethods(tx, true),
    tx.account.findMany({ where: { ...scope, isActive: true, allowPosting: true }, select: { id: true, code: true, nameAr: true, accountType: true } }),
    tx.bankAccount.findMany({ where: { ...scope, isActive: true }, select: { id: true, name: true, currency: true, ledgerAccountId: true } }),
    tx.currency.findMany({ where: { isActive: true }, select: { code: true, nameAr: true } }),
    tx.branch.findMany({ where: { companyId: scope.companyId, isActive: true }, select: { id: true, nameAr: true } }),
    tx.platformUser.findMany({ where: { status: "ACTIVE", memberships: { some: { tenantId: scope.tenantId, status: "ACTIVE", companies: { some: { companyId: scope.companyId } } } } }, select: { id: true, name: true } }),
  ]);
  return { methods, accounts, banks, currencies, branches, users, types: paymentMethodTypes };
}
export async function savePaymentMethod(tx: Tx, input: Record<string, unknown>, userId: string) {
  const scope = await getVerifiedDataScope(), code = text(input.code).toUpperCase(), nameAr = text(input.nameAr);
  if (!/^[A-Z0-9][A-Z0-9_.-]{0,49}$/.test(code) || !nameAr || nameAr.length > 200) throw new PaymentMethodError("رمز الطريقة مطلوب بحروف إنجليزية وأرقام، والاسم العربي مطلوب");
  const previous = await tx.companyConfiguration.findFirst({ where: { ...scope, category: "PAYMENT_METHODS", configKey: code } });
  if (input.id && (!previous || previous.id !== Number(input.id))) throw new PaymentMethodError("رمز الطريقة ثابت؛ لا يمكن تغيير هوية طريقة موجودة");
  if (!input.id && previous) throw new PaymentMethodError("رمز طريقة الدفع مستخدم؛ افتح الطريقة للتحرير", 409);
  for (const key of ["isActive", "showInSales", "showInPurchases", "showInReceipt", "showInPayment"]) if (input[key] !== undefined && typeof input[key] !== "boolean") throw new PaymentMethodError("قيمة التفعيل أو الظهور غير صحيحة");
  if (input.allowedUserIds !== undefined && !Array.isArray(input.allowedUserIds)) throw new PaymentMethodError("صلاحيات المستخدمين يجب أن تكون قائمة");
  const old = previous ? parse(previous) : null;
  const metadata: Metadata = {
    type: text(input.type ?? old?.type).toUpperCase() || "OTHER",
    accountId: input.accountId === undefined ? old?.accountId ?? null : optionalId(input.accountId),
    bankAccountId: input.bankAccountId === undefined ? old?.bankAccountId ?? null : optionalId(input.bankAccountId),
    currency: text(input.currency === undefined ? old?.currency : input.currency).toUpperCase() || null,
    branchId: input.branchId === undefined ? old?.branchId ?? null : optionalId(input.branchId),
    displayOrder: Number(input.displayOrder ?? old?.displayOrder ?? 0),
    showInSales: input.showInSales === undefined ? old?.showInSales ?? true : input.showInSales === true,
    showInPurchases: input.showInPurchases === undefined ? old?.showInPurchases ?? true : input.showInPurchases === true,
    showInReceipt: input.showInReceipt === undefined ? old?.showInReceipt ?? true : input.showInReceipt === true,
    showInPayment: input.showInPayment === undefined ? old?.showInPayment ?? true : input.showInPayment === true,
    allowedUserIds: input.allowedUserIds === undefined ? old?.allowedUserIds ?? [] : Array.isArray(input.allowedUserIds) ? [...new Set(input.allowedUserIds.map(value => optionalId(value)).filter((value): value is number => value !== null))] : [],
  };
  if (!paymentMethodTypes.includes(metadata.type as typeof paymentMethodTypes[number])) throw new PaymentMethodError("نوع طريقة الدفع غير صحيح");
  if (!Number.isSafeInteger(metadata.displayOrder) || metadata.displayOrder < 0 || metadata.displayOrder > 9999) throw new PaymentMethodError("ترتيب العرض يجب أن يكون عددًا من 0 إلى 9999");
  if (metadata.accountId && !(await tx.account.findFirst({ where: { ...scope, id: metadata.accountId, isActive: true, allowPosting: true, accountType: "ASSET" } }))) throw new PaymentMethodError("الحساب المحاسبي يجب أن يكون حساب أصل نشط قابلًا للترحيل في الشركة");
  if (metadata.currency && !(await tx.currency.findUnique({ where: { code: metadata.currency } }))?.isActive) throw new PaymentMethodError("العملة غير نشطة أو غير معرفة");
  if (metadata.branchId && !(await tx.branch.findFirst({ where: { id: metadata.branchId, companyId: scope.companyId, isActive: true } }))) throw new PaymentMethodError("الفرع غير صالح للشركة الحالية");
  if (metadata.bankAccountId) {
    const bank = await tx.bankAccount.findFirst({ where: { ...scope, id: metadata.bankAccountId, isActive: true } });
    if (!bank) throw new PaymentMethodError("البنك أو الصندوق الافتراضي غير صالح");
    if (!(await tx.account.findFirst({ where: { ...scope, id: bank.ledgerAccountId, isActive: true, allowPosting: true, accountType: "ASSET" } }))) throw new PaymentMethodError("الحساب المحاسبي للبنك غير صالح للترحيل");
    if (metadata.currency && metadata.currency !== bank.currency) throw new PaymentMethodError("عملة الطريقة لا تطابق البنك الافتراضي");
    if (metadata.accountId && metadata.accountId !== bank.ledgerAccountId) throw new PaymentMethodError("الحساب المحاسبي يجب أن يطابق حساب البنك الافتراضي");
  }
  if (metadata.allowedUserIds.length && await tx.platformUser.count({ where: { id: { in: metadata.allowedUserIds }, status: "ACTIVE", memberships: { some: { tenantId: scope.tenantId, status: "ACTIVE", companies: { some: { companyId: scope.companyId } } } } } }) !== metadata.allowedUserIds.length) throw new PaymentMethodError("أحد المستخدمين غير مخول للشركة الحالية");
  const data = { labelAr: nameAr, labelEn: text(input.nameEn ?? old?.nameEn) || null, valueType: "JSON", valueJson: JSON.stringify(metadata), isActive: input.isActive === undefined ? old?.isActive ?? true : input.isActive === true, updatedBy: userId };
  const row = previous ? await tx.companyConfiguration.update({ where: { id: previous.id }, data }) : await tx.companyConfiguration.create({ data: { ...scope, category: "PAYMENT_METHODS", configKey: code, ...data } });
  await audit(tx, { action: previous ? "PAYMENT_METHOD_UPDATE" : "PAYMENT_METHOD_CREATE", entityType: "PAYMENT_METHOD", entityId: row.id, userId, metadata: { before: old, after: parse(row) } });
  return parse(row);
}
export async function setPaymentMethodActive(tx: Tx, code: string, isActive: boolean, userId: string) {
  const scope = await getVerifiedDataScope(), row = await tx.companyConfiguration.findFirst({ where: { ...scope, category: "PAYMENT_METHODS", configKey: code } });
  if (!row) throw new PaymentMethodError("طريقة الدفع غير موجودة", 404);
  const saved = await tx.companyConfiguration.update({ where: { id: row.id }, data: { isActive, updatedBy: userId } });
  await audit(tx, { action: isActive ? "PAYMENT_METHOD_ACTIVATE" : "PAYMENT_METHOD_DISABLE", entityType: "PAYMENT_METHOD", entityId: row.id, userId, metadata: { code, previousActive: row.isActive } });
  return parse(saved);
}

export async function validatePaymentMethodForUse(tx: Tx, input: { code: string; use: PaymentUse; bankAccountId: number; currency: string; branchId?: number | null; userId?: number | string | null }) {
  const scope = await getVerifiedDataScope(), code = text(input.code).toUpperCase();
  const configured = await tx.companyConfiguration.findFirst({ where: { ...scope, category: "PAYMENT_METHODS", configKey: code } });
  // Preserve old document codes until explicitly configured. A saved disabled
  // configuration takes precedence even for a legacy code.
  if (!configured) {
    if (!paymentMethodTypes.includes(code as typeof paymentMethodTypes[number])) throw new PaymentMethodError("طريقة الدفع غير معرفة؛ أضفها في الإعدادات أولًا");
    return null;
  }
  const method = parse(configured);
  if (!method.isActive) throw new PaymentMethodError("طريقة الدفع موقوفة");
  const visible = { SALES: method.showInSales, PURCHASES: method.showInPurchases, RECEIPT: method.showInReceipt, PAYMENT: method.showInPayment }[input.use];
  if (!visible) throw new PaymentMethodError("طريقة الدفع غير مسموحة في هذا المستند");
  if (method.currency && method.currency !== input.currency.toUpperCase()) throw new PaymentMethodError("عملة المستند لا تطابق طريقة الدفع");
  if (method.branchId && method.branchId !== input.branchId) throw new PaymentMethodError("طريقة الدفع مخصصة لفرع آخر");
  if (method.allowedUserIds.length && !method.allowedUserIds.includes(Number(input.userId))) throw new PaymentMethodError("ليس لديك صلاحية استخدام طريقة الدفع", 403);
  if (method.accountId) {
    const bank = await tx.bankAccount.findFirst({ where: { ...scope, id: input.bankAccountId, isActive: true } });
    if (bank?.ledgerAccountId !== method.accountId) throw new PaymentMethodError("الحساب البنكي المختار لا يطابق ربط طريقة الدفع");
    if (!(await tx.account.findFirst({ where: { ...scope, id: method.accountId, isActive: true, allowPosting: true, accountType: "ASSET" } }))) throw new PaymentMethodError("حساب طريقة الدفع لم يعد صالحًا للترحيل");
  }
  return method;
}
