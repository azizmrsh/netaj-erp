import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;

export class CurrencyError extends Error {
  constructor(message: string, public readonly code = "CURRENCY_ERROR") {
    super(message);
    this.name = "CurrencyError";
  }
}

const normalizedCurrency = (value: unknown) => String(value ?? "").trim().toUpperCase();

export async function companyCurrency(tx: Tx) {
  const { tenantId, companyId } = await getVerifiedDataScope();
  const company = await tx.company.findFirst({ where: { id: companyId, tenantId }, select: { id: true, tenantId: true, baseCurrencyCode: true } });
  if (!company) throw new CurrencyError("الشركة الحالية غير موجودة");
  return company;
}

export async function exchangeRateAt(tx: Tx, transactionCurrency: string, date: Date) {
  const company = await companyCurrency(tx);
  const currency = normalizedCurrency(transactionCurrency);
  if (!currency) throw new CurrencyError("عملة المعاملة مطلوبة");
  if (currency === company.baseCurrencyCode) return { rate: new Prisma.Decimal(1), rateDate: date, source: "FUNCTIONAL", company };

  const direct = await tx.exchangeRate.findFirst({
    where: { tenantId: company.tenantId, companyId: company.id, baseCurrencyCode: currency, quoteCurrencyCode: company.baseCurrencyCode, rateDate: { lte: date } },
    orderBy: [{ rateDate: "desc" }, { id: "desc" }],
  });
  if (direct) return { rate: new Prisma.Decimal(direct.rate), rateDate: direct.rateDate, source: direct.source ?? "MANUAL", company };

  const inverse = await tx.exchangeRate.findFirst({
    where: { tenantId: company.tenantId, companyId: company.id, baseCurrencyCode: company.baseCurrencyCode, quoteCurrencyCode: currency, rateDate: { lte: date } },
    orderBy: [{ rateDate: "desc" }, { id: "desc" }],
  });
  if (inverse && !new Prisma.Decimal(inverse.rate).isZero()) {
    return { rate: new Prisma.Decimal(1).div(inverse.rate).toDecimalPlaces(10), rateDate: inverse.rateDate, source: `${inverse.source ?? "MANUAL"}:INVERSE`, company };
  }
  throw new CurrencyError(`لا يوجد سعر صرف معتمد للعملة ${currency} حتى ${date.toISOString().slice(0, 10)}`, "RATE_NOT_FOUND");
}

export async function saveExchangeRate(tx: Tx, input: Record<string, unknown>, userId?: number | string | null) {
  const company = await companyCurrency(tx);
  const baseCurrencyCode = normalizedCurrency(input.baseCurrencyCode);
  const quoteCurrencyCode = normalizedCurrency(input.quoteCurrencyCode || company.baseCurrencyCode);
  const dateValue = String(input.rateDate ?? "");
  const day = dateValue.slice(0, 10);
  const parsedDate = new Date(dateValue.length === 10 ? `${dateValue}T00:00:00.000Z` : dateValue);
  const rateDate = new Date(`${day}T00:00:00.000Z`);
  let rate: Prisma.Decimal;
  try { rate = new Prisma.Decimal(String(input.rate ?? 0)); }
  catch { throw new CurrencyError("سعر الصرف يجب أن يكون رقمًا موجبًا صالحًا", "INVALID_RATE"); }
  if (!baseCurrencyCode || !quoteCurrencyCode || baseCurrencyCode === quoteCurrencyCode || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(dateValue) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== day || !rate.isFinite() || !rate.gt(0)) {
    throw new CurrencyError("بيانات سعر الصرف غير صحيحة", "INVALID_RATE");
  }
  const currencies = await tx.currency.count({ where: { code: { in: [baseCurrencyCode, quoteCurrencyCode] }, isActive: true } });
  if (currencies !== 2) throw new CurrencyError("إحدى العملات غير معرفة أو غير نشطة", "INVALID_CURRENCY");
  if (quoteCurrencyCode !== company.baseCurrencyCode) throw new CurrencyError("عملة التسعير يجب أن تكون العملة الوظيفية للشركة", "INVALID_QUOTE_CURRENCY");
  const row = await tx.exchangeRate.upsert({
    where: { companyId_baseCurrencyCode_quoteCurrencyCode_rateDate: { companyId: company.id, baseCurrencyCode, quoteCurrencyCode, rateDate } },
    create: { tenantId: company.tenantId, companyId: company.id, baseCurrencyCode, quoteCurrencyCode, rateDate, rate, source: String(input.source ?? "MANUAL").slice(0, 100), createdBy: userId ? String(userId) : null },
    update: { rate, source: String(input.source ?? "MANUAL").slice(0, 100), createdBy: userId ? String(userId) : null },
  });
  await audit(tx, { action: "UPSERT", entityType: "EXCHANGE_RATE", entityId: row.id, userId: userId ? String(userId) : undefined, metadata: { baseCurrencyCode, quoteCurrencyCode, rate: rate.toString(), rateDate: rateDate.toISOString() } });
  return row;
}

export const functionalAmount = (amount: Prisma.Decimal.Value, rate: Prisma.Decimal.Value) =>
  new Prisma.Decimal(amount).mul(rate).toDecimalPlaces(2);
