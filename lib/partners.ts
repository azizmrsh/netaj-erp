import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { assertOpenAccountingPeriod, createBalancedJournal } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
type PartnerDetails = { currentAccountId: number; capitalAccountId: number; ownershipPercent: number; liabilityCurrentApproved: boolean; createdBy: string; notes: string };
type DistributionLine = { partnerId: number; partnerName: string; accountId: number; percent: number; amount: string };
type Distribution = { status: "DRAFT" | "POSTED"; distributionDate: string; decisionNumber: string; sourceAccountId: number; amount: string; lines: DistributionLine[]; createdBy: string; postedBy?: string; postedAt?: string; journalEntryId?: number; journalNumber?: string };
export class PartnerError extends Error { constructor(message: string, public status = 400) { super(message); } }
const text = (value: unknown) => String(value ?? "").trim();
const parse = <T>(value: string): T => { try { return JSON.parse(value) as T; } catch { throw new PartnerError("بيانات الشريك المحفوظة غير صالحة؛ يلزم مراجعتها"); } };
const idValue = (value: unknown, label: string) => { const id = Number(value); if (!Number.isInteger(id) || id < 1) throw new PartnerError(`${label} غير صحيح`); return id; };
const money = (value: unknown) => { try { const amount = new Prisma.Decimal(String(value)); if (!amount.isFinite() || amount.lte(0) || amount.decimalPlaces() > 2) throw new Error(); return amount; } catch { throw new PartnerError("المبلغ يجب أن يكون موجبًا وبحد أقصى منزلتين عشريتين"); } };
const percent = (value: unknown) => { try { const result = new Prisma.Decimal(String(value ?? 0)); if (!result.isFinite() || result.lt(0) || result.gt(100) || result.decimalPlaces() > 4) throw new Error(); return result; } catch { throw new PartnerError("نسبة الشريك يجب أن تكون بين صفر و100 وبحد أقصى أربع منازل عشرية"); } };
const dateValue = (value: unknown) => { const valueString = text(value); const date = new Date(valueString.length === 10 ? `${valueString}T12:00:00.000Z` : valueString); if (Number.isNaN(date.getTime()) || (valueString.length === 10 && date.toISOString().slice(0, 10) !== valueString)) throw new PartnerError("تاريخ التوزيع غير صحيح"); return date; };
const endOfDate = (date: Date) => { const result = new Date(date); result.setUTCHours(23, 59, 59, 999); return result; };
const postedStatus = { in: ["POSTED", "REVERSED"] };

async function postingAccount(tx: Tx, id: number, types: string[]) {
  const account = await tx.account.findUnique({ where: { id } });
  if (!account || !account.isActive || !account.allowPosting || !types.includes(account.accountType)) throw new PartnerError("الحساب يجب أن يكون نشطًا وقابلًا للترحيل وبالتصنيف المحاسبي الصحيح");
  return account;
}
async function sourceProfitAccount(tx: Tx, id: number) {
  const account = await postingAccount(tx, id, ["EQUITY"]);
  const mapping = await tx.accountingMapping.findFirst({ where: { key: "RETAINED_EARNINGS", accountId: id } });
  if (!mapping) throw new PartnerError("مصدر التوزيع يجب أن يكون حساب الأرباح المحتجزة المربوط محاسبيًا، وليس رأس المال");
  return account;
}
async function ledgerCredit(tx: Tx, accountId: number, to: Date, from?: Date) {
  const account = await tx.account.findUniqueOrThrow({ where: { id: accountId } });
  const lines = await tx.journalEntryLine.findMany({ where: { OR: [{ accountId }, { accountId: null, accountCode: account.code }], journalEntry: { status: postedStatus, entryDate: { lte: to, ...(from ? { gte: from } : {}) } } } });
  return lines.reduce((sum, line) => sum.plus(line.credit).minus(line.debit), new Prisma.Decimal(0));
}

export async function savePartner(tx: Tx, input: Record<string, unknown>, userId: string) {
  const id = input.id ? idValue(input.id, "الشريك") : null;
  const currentAccountId = idValue(input.currentAccountId, "حساب جاري الشريك"), capitalAccountId = idValue(input.capitalAccountId, "حساب رأس المال");
  if (currentAccountId === capitalAccountId) throw new PartnerError("يجب فصل حساب جاري الشريك عن حساب رأس ماله");
  const current = await postingAccount(tx, currentAccountId, ["EQUITY", "LIABILITY"]);
  await postingAccount(tx, capitalAccountId, ["EQUITY"]);
  const liabilityCurrentApproved = input.liabilityCurrentApproved === true || input.liabilityCurrentApproved === "true";
  if (current.accountType === "LIABILITY" && !liabilityCurrentApproved) throw new PartnerError("اعتمد صراحة تصنيف جاري الشريك كالتزام قبل الحفظ");
  const ownershipPercent = percent(input.ownershipPercent), name = text(input.name);
  const code = text(input.code).toUpperCase();
  if (!name || !/^[A-Z0-9_-]{1,40}$/.test(code)) throw new PartnerError("اسم الشريك ورمز إنجليزي/رقمي صحيح مطلوبان");
  const records = await tx.companyConfiguration.findMany({ where: { category: "PARTNERS" } });
  const existing = id ? records.find(row => row.id === id) : null;
  if (id && !existing) throw new PartnerError("الشريك غير موجود", 404);
  if (records.some(row => row.id !== id && row.configKey === code)) throw new PartnerError("رمز الشريك مستخدم");
  let total = new Prisma.Decimal(input.isActive === false ? 0 : ownershipPercent);
  for (const row of records) {
    if (row.id === id) continue;
    const value = parse<PartnerDetails>(row.valueJson);
    if ([value.currentAccountId, value.capitalAccountId].some(accountId => [currentAccountId, capitalAccountId].includes(accountId))) throw new PartnerError("الحساب مرتبط بشريك آخر؛ لكل شريك حسابات مستقلة");
    if (row.isActive) total = total.plus(value.ownershipPercent);
  }
  if (total.gt(100)) throw new PartnerError("مجموع نسب الشركاء النشطين يتجاوز 100%");
  if (existing) {
    const old = parse<PartnerDetails>(existing.valueJson);
    if (old.currentAccountId !== currentAccountId || old.capitalAccountId !== capitalAccountId) {
      const linked = await tx.account.findMany({ where: { id: { in: [old.currentAccountId, old.capitalAccountId] } } });
      if (await tx.journalEntryLine.count({ where: { OR: [{ accountId: { in: linked.map(row => row.id) } }, { accountId: null, accountCode: { in: linked.map(row => row.code) } }] } })) throw new PartnerError("لا يمكن تغيير ربط حسابات شريك لها حركات؛ احتفظ بتاريخها المحاسبي");
    }
  }
  const value: PartnerDetails = { currentAccountId, capitalAccountId, ownershipPercent: ownershipPercent.toNumber(), liabilityCurrentApproved, createdBy: existing ? parse<PartnerDetails>(existing.valueJson).createdBy : userId, notes: text(input.notes) };
  const fields = { configKey: code, labelAr: name, valueJson: JSON.stringify(value), isActive: input.isActive !== false, updatedBy: userId };
  const saved = existing ? await tx.companyConfiguration.update({ where: { id: existing.id }, data: fields }) : await tx.companyConfiguration.create({ data: { category: "PARTNERS", valueType: "JSON", isSystem: true, ...fields } });
  await audit(tx, { action: existing ? "PARTNER_UPDATE" : "PARTNER_CREATE", entityType: "PARTNER", entityId: saved.id, userId, metadata: { code, ...value } });
  return { id: saved.id, code, name, isActive: saved.isActive, ...value };
}

export async function partnerOverview(tx: Tx, params: URLSearchParams) {
  const from = params.get("from") ? dateValue(params.get("from")) : undefined, to = params.get("to") ? endOfDate(dateValue(params.get("to"))) : new Date();
  if (from) from.setUTCHours(0, 0, 0, 0);
  if (from && from > to) throw new PartnerError("بداية الفترة يجب أن تسبق نهايتها");
  const [records, distributionRecords, accounts, retainedMappings] = await Promise.all([
    tx.companyConfiguration.findMany({ where: { category: "PARTNERS" }, orderBy: { configKey: "asc" } }),
    tx.companyConfiguration.findMany({ where: { category: "PARTNER_DISTRIBUTIONS" }, orderBy: { createdAt: "desc" } }),
    tx.account.findMany({ where: { isActive: true, allowPosting: true, accountType: { in: ["EQUITY", "LIABILITY"] } }, orderBy: { code: "asc" } }),
    tx.accountingMapping.findMany({ where: { key: "RETAINED_EARNINGS" }, include: { account: true } }),
  ]);
  const partners = [];
  for (const record of records) {
    const details = parse<PartnerDetails>(record.valueJson);
    const currentAccount = await tx.account.findUniqueOrThrow({ where: { id: details.currentAccountId } });
    const lines = await tx.journalEntryLine.findMany({ where: { OR: [{ accountId: details.currentAccountId }, { accountId: null, accountCode: currentAccount.code }], journalEntry: { status: postedStatus, entryDate: { lte: to } } }, include: { journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
    let opening = new Prisma.Decimal(0), balance = new Prisma.Decimal(0);
    const movements = [];
    for (const line of lines) {
      balance = balance.plus(line.credit).minus(line.debit);
      if (from && line.journalEntry.entryDate < from) { opening = balance; continue; }
      movements.push({ id: line.id, date: line.journalEntry.entryDate, entryNumber: line.journalEntry.entryNumber, journalEntryId: line.journalEntryId, referenceType: line.journalEntry.referenceType,
        description: line.description ?? line.journalEntry.description, debit: line.debit.toNumber(), credit: line.credit.toNumber(), balance: balance.toNumber() });
    }
    const capitalBalance = await ledgerCredit(tx, details.capitalAccountId, to);
    const distributions = movements.filter(row => row.referenceType === "PARTNER_PROFIT_DISTRIBUTION").reduce((sum, row) => sum.plus(row.credit).minus(row.debit), new Prisma.Decimal(0));
    partners.push({ id: record.id, code: record.configKey, name: record.labelAr, isActive: record.isActive, ...details, openingBalance: opening.toNumber(), closingBalance: balance.toNumber(), capitalBalance: capitalBalance.toNumber(), distributedProfits: distributions.toNumber(), movements });
  }
  const sources = [];
  for (const row of retainedMappings) if (row.account.isActive && row.account.allowPosting && row.account.accountType === "EQUITY") sources.push({ accountId: row.accountId, code: row.account.code, name: row.account.nameAr, available: (await ledgerCredit(tx, row.accountId, to)).toNumber() });
  const { companyId } = await getVerifiedDataScope();
  const company = await tx.company.findUnique({ where: { id: companyId } });
  return { partners, accounts, sources, currency: company?.baseCurrencyCode ?? "SAR", distributions: distributionRecords.map(row => ({ id: row.id, number: row.configKey, ...parse<Distribution>(row.valueJson) })).filter(row => { const date = new Date(row.distributionDate); return date <= to && (!from || date >= from); }) };
}

function allocateAmount(amount: Prisma.Decimal, lines: Array<{ partnerId: number; partnerName: string; accountId: number; percent: number }>): DistributionLine[] {
  const totalCents = amount.times(100);
  const allocated = lines.map(line => { const exact = totalCents.times(line.percent).div(100); return { ...line, cents: exact.floor(), remainder: exact.minus(exact.floor()) }; });
  let remaining = totalCents.minus(allocated.reduce((sum, line) => sum.plus(line.cents), new Prisma.Decimal(0))).toNumber();
  for (const line of [...allocated].sort((a, b) => b.remainder.comparedTo(a.remainder) || a.partnerId - b.partnerId)) { if (remaining <= 0) break; line.cents = line.cents.plus(1); remaining -= 1; }
  return allocated.map(({ cents, remainder: _remainder, ...line }) => ({ ...line, amount: cents.div(100).toFixed(2) }));
}

export async function createProfitDistribution(tx: Tx, input: Record<string, unknown>, userId: string) {
  const sourceAccountId = idValue(input.sourceAccountId, "حساب الأرباح المحتجزة"), distributionDate = dateValue(input.distributionDate), amount = money(input.amount), decisionNumber = text(input.decisionNumber);
  if (!decisionNumber) throw new PartnerError("رقم قرار توزيع الأرباح مطلوب");
  await sourceProfitAccount(tx, sourceAccountId);
  const available = await ledgerCredit(tx, sourceAccountId, endOfDate(distributionDate));
  if (amount.gt(available)) throw new PartnerError(`المبلغ يتجاوز رصيد الأرباح المحتجزة القابل للتوزيع (${available.toFixed(2)})`);
  const partners = await tx.companyConfiguration.findMany({ where: { category: "PARTNERS", isActive: true }, orderBy: { id: "asc" } });
  if (!partners.length) throw new PartnerError("أضف الشركاء واربط حساباتهم أولًا");
  let totalPercent = new Prisma.Decimal(0);
  const lines = [];
  for (const partner of partners) {
    const details = parse<PartnerDetails>(partner.valueJson), ownership = percent(details.ownershipPercent);
    if (ownership.isZero()) continue;
    await postingAccount(tx, details.currentAccountId, details.liabilityCurrentApproved ? ["EQUITY", "LIABILITY"] : ["EQUITY"]);
    if (details.currentAccountId === sourceAccountId || details.capitalAccountId === sourceAccountId) throw new PartnerError("مصدر توزيع الأرباح يجب أن يكون مستقلًا عن حسابات الشركاء");
    totalPercent = totalPercent.plus(ownership);
    lines.push({ partnerId: partner.id, partnerName: partner.labelAr ?? partner.configKey, accountId: details.currentAccountId, percent: ownership.toNumber() });
  }
  if (!totalPercent.equals(100)) throw new PartnerError("مجموع نسب الشركاء النشطين يجب أن يساوي 100% قبل توزيع الأرباح");
  const number = `PD-${randomUUID().slice(0, 8).toUpperCase()}`;
  const details: Distribution = { status: "DRAFT", distributionDate: distributionDate.toISOString(), decisionNumber, sourceAccountId, amount: amount.toFixed(2), lines: allocateAmount(amount, lines), createdBy: userId };
  const row = await tx.companyConfiguration.create({ data: { category: "PARTNER_DISTRIBUTIONS", configKey: number, labelAr: `توزيع أرباح ${decisionNumber}`, valueJson: JSON.stringify(details), isSystem: true, updatedBy: userId } });
  await audit(tx, { action: "PARTNER_DISTRIBUTION_DRAFT", entityType: "PARTNER_DISTRIBUTION", entityId: row.id, userId, metadata: details });
  return { id: row.id, number, ...details };
}

export async function postProfitDistribution(tx: Tx, id: number, userId: string) {
  const record = await tx.companyConfiguration.findFirst({ where: { id, category: "PARTNER_DISTRIBUTIONS" } });
  if (!record) throw new PartnerError("قرار توزيع الأرباح غير موجود", 404);
  const details = parse<Distribution>(record.valueJson);
  if (details.status === "POSTED") return { id: record.id, number: record.configKey, ...details };
  if (details.status !== "DRAFT") throw new PartnerError("لا يمكن ترحيل التوزيع في حالته الحالية");
  const date = dateValue(details.distributionDate), amount = money(details.amount);
  await assertOpenAccountingPeriod(tx, date);
  await sourceProfitAccount(tx, details.sourceAccountId);
  const available = await ledgerCredit(tx, details.sourceAccountId, endOfDate(date));
  if (amount.gt(available)) throw new PartnerError("رصيد الأرباح المحتجزة تغيّر وأصبح أقل من التوزيع؛ راجع المسودة");
  const partners = await tx.companyConfiguration.findMany({ where: { category: "PARTNERS", id: { in: details.lines.map(line => line.partnerId) }, isActive: true } });
  for (const line of details.lines) {
    const partner = partners.find(row => row.id === line.partnerId);
    if (!partner) throw new PartnerError("أحد الشركاء أُلغي تفعيله؛ راجع قرار التوزيع");
    const current = parse<PartnerDetails>(partner.valueJson);
    if (current.currentAccountId !== line.accountId) throw new PartnerError("تغيّر حساب الشريك بعد إعداد المسودة");
    await postingAccount(tx, line.accountId, current.liabilityCurrentApproved ? ["EQUITY", "LIABILITY"] : ["EQUITY"]);
  }
  const total = details.lines.reduce((sum, line) => sum.plus(line.amount), new Prisma.Decimal(0));
  if (!total.equals(amount)) throw new PartnerError("بنود التوزيع لا تساوي الإجمالي");
  const { companyId } = await getVerifiedDataScope();
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const journal = await createBalancedJournal(tx, { entryDate: date, description: `توزيع الأرباح بقرار ${details.decisionNumber}`, referenceType: "PARTNER_PROFIT_DISTRIBUTION", referenceId: record.id, referenceNumber: record.configKey,
    functionalCurrencyCode: company.baseCurrencyCode, transactionCurrencyCode: company.baseCurrencyCode,
    lines: [{ accountId: details.sourceAccountId, debit: amount }, ...details.lines.filter(line => new Prisma.Decimal(line.amount).gt(0)).map(line => ({ accountId: line.accountId, credit: line.amount, description: `نصيب ${line.partnerName} — ${line.percent}%` }))] });
  const posted: Distribution = { ...details, status: "POSTED", journalEntryId: journal.id, journalNumber: journal.entryNumber, postedBy: userId, postedAt: new Date().toISOString() };
  await tx.companyConfiguration.update({ where: { id: record.id }, data: { valueJson: JSON.stringify(posted), updatedBy: userId } });
  await audit(tx, { action: "PARTNER_DISTRIBUTION_POST", entityType: "PARTNER_DISTRIBUTION", entityId: record.id, userId, metadata: { journalEntryId: journal.id, amount: details.amount, decisionNumber: details.decisionNumber } });
  return { id: record.id, number: record.configKey, ...posted };
}
