import { Prisma } from "@prisma/client";
import { assertOpenAccountingPeriod, createBalancedJournal } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { exchangeRateAt, functionalAmount } from "@/lib/currency";
import { getVerifiedDataScope } from "@/lib/data-scope";
import { nextDocumentNumber } from "@/lib/document-numbering";

type Tx = Prisma.TransactionClient;
export const recurringFrequencies = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
type Frequency = typeof recurringFrequencies[number];
export class RecurringJournalError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); }
}
const clean = (value: unknown) => String(value ?? "").trim();
function dateOnly(value: unknown, name: string) {
  const text = value instanceof Date ? value.toISOString().slice(0, 10) : clean(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new RecurringJournalError(`${name} غير صحيح`);
  const result = new Date(`${text}T00:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== text) throw new RecurringJournalError(`${name} غير صحيح`);
  return result;
}
function monthDate(year: number, month: number, day: number) {
  const first = new Date(Date.UTC(year, month, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(day, lastDay)));
}
export function nextRecurringDate(previous: Date, frequency: string, runDay: number) {
  if (frequency === "DAILY" || frequency === "WEEKLY") return new Date(previous.getTime() + (frequency === "DAILY" ? 1 : 7) * 86_400_000);
  const months = frequency === "MONTHLY" ? 1 : frequency === "QUARTERLY" ? 3 : frequency === "YEARLY" ? 12 : 0;
  if (!months) throw new RecurringJournalError("التكرار غير صحيح");
  return monthDate(previous.getUTCFullYear(), previous.getUTCMonth() + months, runDay);
}
function firstRun(start: Date, frequency: string, runDay: number) {
  if (frequency === "DAILY" || frequency === "WEEKLY") return start;
  const first = monthDate(start.getUTCFullYear(), start.getUTCMonth(), runDay);
  return first < start ? nextRecurringDate(first, frequency, runDay) : first;
}
function amount(value: unknown) {
  try {
    const n = new Prisma.Decimal(clean(value) || "0");
    if (!n.isFinite() || n.isNegative() || n.decimalPlaces() > 2) throw new Error();
    return n;
  } catch { throw new RecurringJournalError("مبالغ القيد يجب أن تكون موجبة وبمنزلتين عشريتين كحد أقصى"); }
}
async function validateLines(tx: Tx, raw: unknown) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > 200) throw new RecurringJournalError("يلزم سطران على الأقل وبحد أقصى 200 سطر");
  const lines = raw.map((input: Record<string, unknown>) => {
    const debit = amount(input.debit), credit = amount(input.credit), accountId = Number(input.accountId);
    if (!Number.isInteger(accountId) || accountId < 1 || debit.gt(0) === credit.gt(0)) throw new RecurringJournalError("كل سطر يجب أن يحدد حسابًا ومبلغًا في طرف واحد: مدين أو دائن");
    const costCenterId = input.costCenterId ? Number(input.costCenterId) : null;
    if (costCenterId !== null && (!Number.isInteger(costCenterId) || costCenterId < 1)) throw new RecurringJournalError("مركز التكلفة غير صحيح");
    return { accountId, debit, credit, costCenterId, projectCode: clean(input.projectCode) || null, description: clean(input.description) || null };
  });
  const debit = lines.reduce((sum, row) => sum.plus(row.debit), new Prisma.Decimal(0));
  const credit = lines.reduce((sum, row) => sum.plus(row.credit), new Prisma.Decimal(0));
  if (!debit.gt(0) || !debit.eq(credit)) throw new RecurringJournalError("القيد الدوري غير متوازن: يجب تساوي إجمالي المدين والدائن");
  const { tenantId, companyId } = await getVerifiedDataScope();
  const accountIds = [...new Set(lines.map(row => row.accountId))];
  const validAccounts = await tx.account.count({ where: { id: { in: accountIds }, tenantId, companyId, isActive: true, allowPosting: true } });
  if (validAccounts !== accountIds.length) throw new RecurringJournalError("أحد الحسابات موقوف أو رئيسي أو تابع لشركة أخرى");
  const centerIds = [...new Set(lines.flatMap(row => row.costCenterId ? [row.costCenterId] : []))];
  if (await tx.costCenter.count({ where: { id: { in: centerIds }, tenantId, companyId, isActive: true } }) !== centerIds.length) throw new RecurringJournalError("أحد مراكز التكلفة موقوف أو غير تابع للشركة");
  return lines;
}

export async function createRecurringJournal(tx: Tx, input: Record<string, unknown>, userId: string) {
  const scope = await getVerifiedDataScope();
  const name = clean(input.name), description = clean(input.description), frequency = clean(input.frequency).toUpperCase() as Frequency;
  if (!name || !description || !recurringFrequencies.includes(frequency)) throw new RecurringJournalError("اسم القيد والبيان والتكرار مطلوبة");
  const startDate = dateOnly(input.startDate, "تاريخ البداية"), endDate = input.endDate ? dateOnly(input.endDate, "تاريخ النهاية") : null;
  if (endDate && endDate < startDate) throw new RecurringJournalError("تاريخ النهاية يجب ألا يسبق تاريخ البداية");
  const runDay = input.runDay ? Number(input.runDay) : startDate.getUTCDate();
  if (!Number.isInteger(runDay) || runDay < 1 || runDay > 31) throw new RecurringJournalError("يوم التنفيذ يجب أن يكون بين 1 و31");
  const nextRunAt = firstRun(startDate, frequency, runDay);
  if (endDate && nextRunAt > endDate) throw new RecurringJournalError("الفترة المختارة لا تحتوي على موعد تنفيذ");
  const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
  const currency = clean(input.currency || company.baseCurrencyCode).toUpperCase();
  if (!(await tx.currency.findUnique({ where: { code: currency } }))?.isActive) throw new RecurringJournalError("العملة غير نشطة");
  const branchId = input.branchId ? Number(input.branchId) : null;
  if (branchId && !(await tx.branch.findFirst({ where: { id: branchId, companyId: scope.companyId, isActive: true } }))) throw new RecurringJournalError("الفرع غير صالح للشركة الحالية");
  const lines = await validateLines(tx, input.lines);
  const row = await tx.recurringJournal.create({ data: { ...scope, code: await nextDocumentNumber(tx, "RJ", startDate), name, description, currency, branchId, startDate, endDate, frequency, runDay, nextRunAt, createdBy: userId,
    lines: { create: lines.map(line => ({ ...scope, ...line })) } }, include: { lines: true } });
  await audit(tx, { action: "CREATE", entityType: "RECURRING_JOURNAL", entityId: row.id, userId, metadata: { code: row.code, frequency, startDate, lines } });
  return row;
}

export async function setRecurringJournalStatus(tx: Tx, id: number, action: string, userId: string) {
  const scope = await getVerifiedDataScope();
  const row = await tx.recurringJournal.findFirst({ where: { id, ...scope }, include: { lines: true } });
  if (!row) throw new RecurringJournalError("القيد الدوري غير موجود", 404);
  if (action === "ACTIVATE") {
    if (!["DRAFT", "PAUSED"].includes(row.status) || !row.nextRunAt) throw new RecurringJournalError("حالة القيد لا تسمح بالتشغيل", 409);
    await validateLines(tx, row.lines);
  } else if (action !== "PAUSE" || row.status !== "ACTIVE") throw new RecurringJournalError("حالة القيد لا تسمح بهذا الإجراء", 409);
  const result = await tx.recurringJournal.update({ where: { id }, data: action === "ACTIVATE" ? { status: "ACTIVE", approvedBy: userId, approvedAt: new Date(), retryAt: null, lastError: null } : { status: "PAUSED" } });
  await audit(tx, { action, entityType: "RECURRING_JOURNAL", entityId: id, userId, metadata: { previousStatus: row.status, nextRunAt: row.nextRunAt } });
  return result;
}

// Caller must run this function in one transaction. scheduledFor is an explicit
// idempotency key from the screen/worker, so a repeated click cannot advance twice.
export async function executeRecurringJournal(tx: Tx, id: number, scheduledFor: Date, userId: string, now = new Date()) {
  const scope = await getVerifiedDataScope();
  const row = await tx.recurringJournal.findFirst({ where: { id, ...scope }, include: { lines: true } });
  if (!row) throw new RecurringJournalError("القيد الدوري غير موجود", 404);
  const existing = await tx.recurringJournalRun.findFirst({ where: { ...scope, recurringJournalId: id, scheduledFor } });
  if (existing?.status === "POSTED") return { ...existing, duplicate: true };
  if (row.status !== "ACTIVE" || !row.nextRunAt) throw new RecurringJournalError("يجب اعتماد وتشغيل القيد الدوري أولًا", 409);
  if (scheduledFor.getTime() !== row.nextRunAt.getTime()) throw new RecurringJournalError("تغير موعد التنفيذ؛ أعد تحميل سجل القيد", 409);
  if (scheduledFor > now) throw new RecurringJournalError("موعد القيد الدوري لم يحن بعد", 409);
  await validateLines(tx, row.lines);
  await assertOpenAccountingPeriod(tx, scheduledFor);
  const fx = await exchangeRateAt(tx, row.currency, scheduledFor);
  const converted = row.lines.map(line => ({ accountId: line.accountId, debit: functionalAmount(line.debit, fx.rate), credit: functionalAmount(line.credit, fx.rate), transactionDebit: line.debit, transactionCredit: line.credit, costCenterId: line.costCenterId, projectCode: line.projectCode, description: line.description || row.description }));
  // Balance rounding within each side to the translated total of the template.
  for (const side of ["debit", "credit"] as const) {
    const expected = functionalAmount(row.lines.reduce((sum, line) => sum.plus(line[side]), new Prisma.Decimal(0)), fx.rate);
    const actual = converted.reduce((sum, line) => sum.plus(line[side]), new Prisma.Decimal(0));
    const largest = converted.reduce((best, line) => line[side].gt(best[side]) ? line : best);
    largest[side] = largest[side].plus(expected.minus(actual));
  }
  const run = existing ? await tx.recurringJournalRun.update({ where: { id: existing.id }, data: { status: "PENDING", attempts: { increment: 1 }, error: null } }) : await tx.recurringJournalRun.create({ data: { ...scope, recurringJournalId: id, scheduledFor, attempts: 1, executedBy: userId } });
  const journal = await createBalancedJournal(tx, { entryDate: scheduledFor, description: row.description, referenceType: "RECURRING_JOURNAL", referenceId: run.id, referenceNumber: `${row.code}/${scheduledFor.toISOString().slice(0, 10)}`, transactionCurrencyCode: row.currency, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate, lines: converted });
  if (row.branchId) await tx.journalEntry.update({ where: { id: journal.id }, data: { branchId: row.branchId } });
  const nextRun = nextRecurringDate(scheduledFor, row.frequency, row.runDay ?? row.startDate.getUTCDate());
  const completed = !!row.endDate && nextRun > row.endDate;
  const result = await tx.recurringJournalRun.update({ where: { id: run.id }, data: { status: "POSTED", journalEntryId: journal.id, entryNumber: journal.entryNumber, executedAt: now, executedBy: userId, error: null } });
  await tx.recurringJournal.update({ where: { id }, data: { nextRunAt: completed ? null : nextRun, lastRunAt: now, executionCount: { increment: 1 }, status: completed ? "COMPLETED" : "ACTIVE", retryAt: null, lastError: null } });
  await audit(tx, { action: "RECURRING_EXECUTE", entityType: "RECURRING_JOURNAL", entityId: id, userId, metadata: { runId: run.id, journalEntryId: journal.id, scheduledFor, branchId: row.branchId } });
  return { ...result, duplicate: false };
}

// Called only after the failed posting transaction has rolled back.
export async function recordRecurringFailure(tx: Tx, id: number, scheduledFor: Date, error: unknown, userId: string) {
  const scope = await getVerifiedDataScope(), message = error instanceof Error ? error.message : "تعذر تنفيذ القيد الدوري";
  const template = await tx.recurringJournal.findFirst({ where: { id, ...scope } });
  if (!template || template.nextRunAt?.getTime() !== scheduledFor.getTime()) return;
  const where = { ...scope, recurringJournalId: id, scheduledFor };
  const existing = await tx.recurringJournalRun.findFirst({ where });
  if (existing?.status === "POSTED") return;
  if (existing) await tx.recurringJournalRun.update({ where: { id: existing.id }, data: { status: "FAILED", attempts: { increment: 1 }, error: message, executedBy: userId, executedAt: new Date() } });
  else await tx.recurringJournalRun.create({ data: { ...where, status: "FAILED", attempts: 1, error: message, executedBy: userId, executedAt: new Date() } });
  await tx.recurringJournal.update({ where: { id }, data: { lastError: message, retryAt: new Date(Date.now() + 15 * 60_000) } });
  await audit(tx, { action: "RECURRING_FAILED", entityType: "RECURRING_JOURNAL", entityId: id, userId, metadata: { scheduledFor, error: message } });
}

export async function recurringJournalWorkspace(tx: Tx) {
  const scope = await getVerifiedDataScope();
  const [templates, accounts, costCenters, branches, currencies, company] = await Promise.all([
    tx.recurringJournal.findMany({ where: scope, include: { lines: true, runs: { orderBy: { scheduledFor: "desc" }, take: 100 } }, orderBy: { id: "desc" } }),
    tx.account.findMany({ where: { ...scope, isActive: true, allowPosting: true }, select: { id: true, code: true, nameAr: true }, orderBy: { code: "asc" } }),
    tx.costCenter.findMany({ where: { ...scope, isActive: true }, select: { id: true, code: true, nameAr: true } }),
    tx.branch.findMany({ where: { companyId: scope.companyId, isActive: true }, select: { id: true, nameAr: true } }),
    tx.currency.findMany({ where: { isActive: true }, select: { code: true, nameAr: true } }),
    tx.company.findUniqueOrThrow({ where: { id: scope.companyId }, select: { baseCurrencyCode: true } }),
  ]);
  return { templates, accounts, costCenters, branches, currencies, baseCurrencyCode: company.baseCurrencyCode };
}
