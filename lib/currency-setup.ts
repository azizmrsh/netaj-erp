import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
export class CurrencySetupError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "CurrencySetupError"; }
}
export const fxMappingDefinitions = [
  { key: "REALIZED_FX_GAIN", name: "أرباح فروق العملة المحققة", accountType: "REVENUE" },
  { key: "REALIZED_FX_LOSS", name: "خسائر فروق العملة المحققة", accountType: "EXPENSE" },
  { key: "UNREALIZED_FX_GAIN", name: "أرباح فروق العملة غير المحققة", accountType: "REVENUE" },
  { key: "UNREALIZED_FX_LOSS", name: "خسائر فروق العملة غير المحققة", accountType: "EXPENSE" },
] as const;

export async function canManageCurrencyCatalog(tx: Tx, userId: number) {
  const admin = await tx.platformAdministrator.findUnique({ where: { userId } });
  return !!admin && admin.status === "ACTIVE" && ["PLATFORM_OWNER", "PLATFORM_ADMIN"].includes(admin.role);
}

async function baseCurrencyLock(tx: Tx) {
  const scope = await getVerifiedDataScope();
  // Changing the functional currency is not a rename. Existing financial
  // amounts/rates would require a separate conversion and migration process.
  const [journals, rates, sales, purchases, vouchers, budgets, expenses, revenues, transactions, assets] = await Promise.all([
    tx.journalEntry.count({ where: scope }), tx.exchangeRate.count({ where: scope }),
    tx.sale.count({ where: scope }), tx.purchase.count({ where: scope }), tx.financialVoucher.count({ where: scope }),
    tx.budget.count({ where: scope }), tx.expense.count({ where: scope }), tx.revenue.count({ where: scope }),
    tx.bankTransaction.count({ where: scope }), tx.asset.count({ where: scope }),
  ]);
  return journals + rates + sales + purchases + vouchers + budgets + expenses + revenues + transactions + assets > 0;
}

export async function currencySetupWorkspace(tx: Tx) {
  const scope = await getVerifiedDataScope();
  const [company, currencies, mappings, accounts, baseLocked] = await Promise.all([
    tx.company.findFirst({ where: { id: scope.companyId, tenantId: scope.tenantId }, select: { id: true, legalNameAr: true, baseCurrencyCode: true } }),
    tx.currency.findMany({ orderBy: { code: "asc" } }),
    tx.accountingMapping.findMany({ where: { ...scope, key: { in: fxMappingDefinitions.map(row => row.key) } } }),
    tx.account.findMany({ where: { ...scope, accountType: { in: ["REVENUE", "EXPENSE"] }, isActive: true, allowPosting: true }, orderBy: { code: "asc" }, select: { id: true, code: true, nameAr: true, accountType: true } }),
    baseCurrencyLock(tx),
  ]);
  if (!company) throw new CurrencySetupError("الشركة الحالية غير موجودة", 404);
  return { company, currencies, baseLocked, accounts, mappings: fxMappingDefinitions.map(row => ({ ...row, accountId: mappings.find(value => value.key === row.key)?.accountId ?? null })) };
}

export async function saveCurrencyCatalog(tx: Tx, input: Record<string, unknown>, userId: number, create = false) {
  if (!await canManageCurrencyCatalog(tx, userId)) throw new CurrencySetupError("كتالوج العملات مشترك؛ تعديله يتطلب مسؤول منصة نشطًا", 403);
  const code = String(input.code ?? "").trim().toUpperCase();
  const nameAr = String(input.nameAr ?? "").trim(), nameEn = String(input.nameEn ?? "").trim(), symbol = String(input.symbol ?? "").trim();
  const decimalPlaces = Number(input.decimalPlaces);
  if (!Intl.supportedValuesOf("currency").includes(code)) throw new CurrencySetupError("اختر رمز عملة ISO معتمدًا من ثلاثة أحرف");
  if (!nameAr || !nameEn || nameAr.length > 100 || nameEn.length > 100 || symbol.length > 12) throw new CurrencySetupError("الاسمان العربي والإنجليزي مطلوبان، والرمز يجب ألا يتجاوز 12 حرفًا");
  const isoDecimals = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits;
  if (!Number.isInteger(decimalPlaces) || decimalPlaces !== isoDecimals) throw new CurrencySetupError(`عدد الخانات المعتمد للعملة ${code} هو ${isoDecimals}`);
  if (typeof input.isActive !== "boolean") throw new CurrencySetupError("حالة العملة غير صحيحة");
  const current = await tx.currency.findUnique({ where: { code }, include: { _count: { select: { companies: true, baseExchangeRates: true, quoteExchangeRates: true } } } });
  if (create && current) throw new CurrencySetupError("رمز العملة مسجل بالفعل", 409);
  if (!create && !current) throw new CurrencySetupError("العملة غير موجودة", 404);
  if (current && !input.isActive && current._count.companies > 0) throw new CurrencySetupError("لا يمكن إيقاف عملة وظيفية مستخدمة لدى شركة");
  if (current && decimalPlaces !== current.decimalPlaces && (current._count.companies + current._count.baseExchangeRates + current._count.quoteExchangeRates > 0)) throw new CurrencySetupError("لا يمكن تغيير الخانات لعملة مستخدمة؛ يلزم تصحيح محاسبي مستقل");
  const values = { nameAr, nameEn, symbol: symbol || null, decimalPlaces, isActive: input.isActive };
  const row = create ? await tx.currency.create({ data: { code, ...values } }) : await tx.currency.update({ where: { code }, data: values });
  await audit(tx, { action: create ? "CREATE" : "UPDATE", entityType: "CURRENCY_CATALOG", userId: String(userId), metadata: { code, before: current ? { nameAr: current.nameAr, nameEn: current.nameEn, symbol: current.symbol, decimalPlaces: current.decimalPlaces, isActive: current.isActive } : null, after: values, scope: "GLOBAL" } });
  return row;
}

export async function saveCompanyCurrencySetup(tx: Tx, input: Record<string, unknown>, userId: number) {
  const scope = await getVerifiedDataScope();
  const company = await tx.company.findFirst({ where: { id: scope.companyId, tenantId: scope.tenantId } });
  if (!company) throw new CurrencySetupError("الشركة الحالية غير موجودة", 404);
  const code = String(input.baseCurrencyCode ?? company.baseCurrencyCode).trim().toUpperCase();
  const currency = await tx.currency.findUnique({ where: { code } });
  if (!currency?.isActive) throw new CurrencySetupError("اختر عملة وظيفية نشطة");
  if (code !== company.baseCurrencyCode) {
    if (await baseCurrencyLock(tx)) throw new CurrencySetupError("لا يمكن تغيير العملة الوظيفية بعد وجود قيود أو مستندات أو أسعار صرف");
    if (currency.decimalPlaces !== 2) throw new CurrencySetupError("محرك الدفتر الحالي يدعم العملة الوظيفية ذات خانتين عشريتين فقط");
  }
  const rawMappings = input.mappings;
  if (!rawMappings || typeof rawMappings !== "object" || Array.isArray(rawMappings)) throw new CurrencySetupError("حدد حسابات أرباح وخسائر فروق العملة");
  const selected = rawMappings as Record<string, unknown>;
  for (const definition of fxMappingDefinitions) {
    const accountId = Number(selected[definition.key]);
    if (!Number.isSafeInteger(accountId) || accountId < 1) throw new CurrencySetupError(`حدد حساب ${definition.name}`);
    const account = await tx.account.findFirst({ where: { ...scope, id: accountId, accountType: definition.accountType, isActive: true, allowPosting: true } });
    if (!account) throw new CurrencySetupError(`حساب ${definition.name} يجب أن يكون حساب حركة نشطًا من نوع ${definition.accountType === "REVENUE" ? "إيراد" : "مصروف"} تابعًا للشركة`);
  }
  const before = await tx.accountingMapping.findMany({ where: { ...scope, key: { in: fxMappingDefinitions.map(row => row.key) } } });
  for (const definition of fxMappingDefinitions) {
    const previous = before.find(row => row.key === definition.key);
    if (previous) await tx.accountingMapping.update({ where: { id: previous.id, ...scope }, data: { accountId: Number(selected[definition.key]) } });
    else await tx.accountingMapping.create({ data: { ...scope, key: definition.key, accountId: Number(selected[definition.key]), description: definition.name } });
  }
  if (code !== company.baseCurrencyCode) await tx.company.update({ where: { id: company.id, tenantId: scope.tenantId }, data: { baseCurrencyCode: code } });
  await audit(tx, { action: "UPDATE", entityType: "COMPANY_CURRENCY_SETUP", entityId: company.id, userId: String(userId), metadata: { before: { baseCurrencyCode: company.baseCurrencyCode, mappings: before.map(row => ({ key: row.key, accountId: row.accountId })) }, after: { baseCurrencyCode: code, mappings: selected } } });
  return currencySetupWorkspace(tx);
}
