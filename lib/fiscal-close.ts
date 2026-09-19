import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { createBalancedJournal, ensureFiscalCalendar, reverseJournalEntry } from "@/lib/accounting";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
const actor = (value: string | number | null | undefined) => value == null ? "system" : String(value);

export class FiscalCloseError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS" | "BLOCKED", message: string, public readonly blockers: string[] = []) {
    super(message);
    this.name = "FiscalCloseError";
  }
}

async function getScopedPeriod(tx: Tx, periodId: number) {
  const { companyId } = await getVerifiedDataScope();
  return tx.fiscalPeriod.findFirst({ where: { id: periodId, fiscalYear: { companyId } }, include: { fiscalYear: true } });
}

export async function fiscalPeriodBlockers(tx: Tx, periodId: number) {
  const period = await getScopedPeriod(tx, periodId);
  if (!period) throw new FiscalCloseError("NOT_FOUND", "الفترة المالية غير موجودة");
  const range = { gte: period.startDate, lte: period.endDate };
  const [draftJournals, draftVouchers, draftVatReturns, draftFxRevaluations, postedJournals] = await Promise.all([
    tx.journalEntry.count({ where: { status: "DRAFT", entryDate: range } }),
    tx.financialVoucher.count({ where: { status: "DRAFT", voucherDate: range } }),
    tx.vatReturn.count({ where: { status: "DRAFT", periodStart: { lte: period.endDate }, periodEnd: { gte: period.startDate } } }),
    tx.fxRevaluation.count({ where: { status: "DRAFT", fiscalPeriodId: period.id } }),
    tx.journalEntry.findMany({ where: { status: "POSTED", entryDate: range }, select: { entryNumber: true, totalDebit: true, totalCredit: true } }),
  ]);
  const unbalanced = postedJournals.filter((row) => !row.totalDebit.equals(row.totalCredit));
  const blockers = [
    ...(draftJournals ? [`${draftJournals} قيد غير مرحل`] : []),
    ...(draftVouchers ? [`${draftVouchers} سند قبض/صرف غير مرحل`] : []),
    ...(draftVatReturns ? [`${draftVatReturns} إقرار ضريبي غير معتمد`] : []),
    ...(draftFxRevaluations ? [`${draftFxRevaluations} إعادة تقييم عملة غير مرحلة`] : []),
    ...(unbalanced.length ? [`${unbalanced.length} قيد غير متوازن`] : []),
  ];
  return { period, blockers, counts: { draftJournals, draftVouchers, draftVatReturns, draftFxRevaluations, unbalancedJournals: unbalanced.length } };
}

export async function closeFiscalPeriod(tx: Tx, periodId: number, userId?: string | number | null) {
  const result = await fiscalPeriodBlockers(tx, periodId);
  if (result.period.status === "CLOSED") return result.period;
  if (result.period.fiscalYear.status !== "OPEN") throw new FiscalCloseError("INVALID_STATUS", "السنة المالية ليست مفتوحة");
  if (result.blockers.length) throw new FiscalCloseError("BLOCKED", "لا يمكن إغلاق الفترة قبل معالجة العناصر المعلقة", result.blockers);
  const row = await tx.fiscalPeriod.update({ where: { id: periodId }, data: { status: "CLOSED", closedAt: new Date(), closedBy: actor(userId) } });
  await audit(tx, { action: "FISCAL_PERIOD_CLOSE", entityType: "FISCAL_PERIOD", entityId: periodId, userId: actor(userId), metadata: result.counts });
  return row;
}

export async function reopenFiscalPeriod(tx: Tx, periodId: number, reason: unknown, userId?: string | number | null) {
  const explanation = String(reason ?? "").trim();
  if (explanation.length < 5) throw new FiscalCloseError("INVALID_INPUT", "سبب إعادة فتح الفترة مطلوب");
  const period = await getScopedPeriod(tx, periodId);
  if (!period) throw new FiscalCloseError("NOT_FOUND", "الفترة المالية غير موجودة");
  if (period.fiscalYear.status !== "OPEN") throw new FiscalCloseError("INVALID_STATUS", "يجب إعادة فتح السنة المالية أولًا");
  if (period.status === "OPEN") return period;
  const row = await tx.fiscalPeriod.update({ where: { id: periodId }, data: { status: "OPEN", closedAt: null, closedBy: null, reopenedAt: new Date() } });
  await audit(tx, { action: "FISCAL_PERIOD_REOPEN", entityType: "FISCAL_PERIOD", entityId: periodId, userId: actor(userId), metadata: { reason: explanation } });
  return row;
}

export async function closeFiscalYear(tx: Tx, fiscalYearId: number, userId?: string | number | null) {
  const { companyId } = await getVerifiedDataScope();
  const year = await tx.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId }, include: { periods: { orderBy: { periodNumber: "asc" } } } });
  if (!year) throw new FiscalCloseError("NOT_FOUND", "السنة المالية غير موجودة");
  if (year.status === "CLOSED") return year;
  const finalPeriod = year.periods.at(-1);
  if (!finalPeriod || year.periods.slice(0, -1).some((period) => period.status !== "CLOSED")) {
    throw new FiscalCloseError("BLOCKED", "يجب إغلاق جميع الفترات السابقة قبل إغلاق السنة");
  }
  const finalCheck = await fiscalPeriodBlockers(tx, finalPeriod.id);
  if (finalCheck.blockers.length) throw new FiscalCloseError("BLOCKED", "الفترة الأخيرة تحتوي عناصر معلقة", finalCheck.blockers);

  const profitAndLossLines = await tx.journalEntryLine.findMany({
    where: { account: { accountType: { in: ["REVENUE", "EXPENSE"] } }, journalEntry: { status: "POSTED", entryDate: { gte: year.startDate, lte: year.endDate } } },
    include: { account: true },
  });
  const balances = new Map<number, { accountId: number; debit: Prisma.Decimal; credit: Prisma.Decimal }>();
  for (const line of profitAndLossLines) {
    if (!line.accountId) continue;
    const row = balances.get(line.accountId) ?? { accountId: line.accountId, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    row.debit = row.debit.plus(line.debit); row.credit = row.credit.plus(line.credit); balances.set(line.accountId, row);
  }
  const closingLines: { accountId?: number; mappingKey?: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal }[] = [];
  let closingDebit = new Prisma.Decimal(0), closingCredit = new Prisma.Decimal(0);
  for (const balance of balances.values()) {
    const net = balance.debit.minus(balance.credit).toDecimalPlaces(2);
    if (net.gt(0)) { closingLines.push({ accountId: balance.accountId, credit: net }); closingCredit = closingCredit.plus(net); }
    else if (net.lt(0)) { closingLines.push({ accountId: balance.accountId, debit: net.abs() }); closingDebit = closingDebit.plus(net.abs()); }
  }
  const retained = closingDebit.minus(closingCredit).toDecimalPlaces(2);
  if (retained.gt(0)) closingLines.push({ mappingKey: "RETAINED_EARNINGS", credit: retained });
  else if (retained.lt(0)) closingLines.push({ mappingKey: "RETAINED_EARNINGS", debit: retained.abs() });
  const journal = closingLines.length ? await createBalancedJournal(tx, { entryDate: year.endDate, description: `قيد إقفال ${year.name}`,
    referenceType: `FISCAL_YEAR_CLOSE_${Date.now()}`, referenceId: year.id, referenceNumber: `FY-${year.id}`, lines: closingLines }) : null;
  await tx.fiscalPeriod.updateMany({ where: { fiscalYearId: year.id }, data: { status: "CLOSED", closedAt: new Date(), closedBy: actor(userId) } });
  const closed = await tx.fiscalYear.update({ where: { id: year.id }, data: { status: "CLOSED", closingJournalEntryId: journal?.id ?? null, closedAt: new Date(), closedBy: actor(userId) }, include: { periods: { orderBy: { periodNumber: "asc" } }, closingJournal: { include: { lines: true } } } });
  await audit(tx, { action: "FISCAL_YEAR_CLOSE", entityType: "FISCAL_YEAR", entityId: year.id, userId: actor(userId), metadata: { journalId: journal?.id ?? null, retainedEarnings: retained.toString() } });
  return closed;
}

export async function reopenFiscalYear(tx: Tx, fiscalYearId: number, reason: unknown, userId?: string | number | null) {
  const explanation = String(reason ?? "").trim();
  if (explanation.length < 5) throw new FiscalCloseError("INVALID_INPUT", "سبب إعادة فتح السنة مطلوب");
  const { companyId } = await getVerifiedDataScope();
  const year = await tx.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId }, include: { periods: { orderBy: { periodNumber: "desc" } } } });
  if (!year) throw new FiscalCloseError("NOT_FOUND", "السنة المالية غير موجودة");
  if (year.status === "OPEN") return year;
  if (year.closingJournalEntryId) await reverseJournalEntry(tx, { originalId: year.closingJournalEntryId,
    referenceType: `FISCAL_YEAR_REOPEN_${Date.now()}`, referenceId: year.id, referenceNumber: `FY-${year.id}`, description: `عكس إقفال ${year.name}: ${explanation}` });
  const finalPeriod = year.periods[0];
  if (finalPeriod) await tx.fiscalPeriod.update({ where: { id: finalPeriod.id }, data: { status: "OPEN", closedAt: null, closedBy: null, reopenedAt: new Date() } });
  const reopened = await tx.fiscalYear.update({ where: { id: year.id }, data: { status: "OPEN", closingJournalEntryId: null, closedAt: null, closedBy: null, reopenedAt: new Date() }, include: { periods: { orderBy: { periodNumber: "asc" } } } });
  await audit(tx, { action: "FISCAL_YEAR_REOPEN", entityType: "FISCAL_YEAR", entityId: year.id, userId: actor(userId), metadata: { reason: explanation } });
  return reopened;
}

export async function currentFiscalCalendar(tx: Tx) {
  const year = await ensureFiscalCalendar(tx);
  const checks = await Promise.all(year.periods.map(async (period) => ({ id: period.id, ...(await fiscalPeriodBlockers(tx, period.id)) })));
  return { ...year, periods: year.periods.map((period) => ({ ...period, blockers: checks.find((row) => row.id === period.id)?.blockers ?? [] })) };
}

export function fiscalCloseErrorResponse(error: unknown) {
  if (error instanceof FiscalCloseError) return { status: error.code === "NOT_FOUND" ? 404 : error.code === "BLOCKED" || error.code === "INVALID_STATUS" ? 409 : 400, message: error.message, blockers: error.blockers };
  return { status: 500, message: "تعذر تنفيذ إجراء الفترة المالية", blockers: [] as string[] };
}
