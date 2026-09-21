import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";
import { nextDocumentNumber } from "@/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export class BudgetError extends Error {
  constructor(message: string) { super(message); this.name = "BudgetError"; }
}

const amount = (value: unknown) => {
  const parsed = new Prisma.Decimal(String(value ?? 0)).toDecimalPlaces(2);
  if (parsed.isNegative()) throw new BudgetError("مبلغ الميزانية لا يمكن أن يكون سالبًا");
  return parsed;
};

export async function createBudget(tx: Tx, input: Record<string, unknown>, userId?: number | string | null) {
  const { companyId } = await getVerifiedDataScope();
  const fiscalYearId = Number(input.fiscalYearId);
  const name = String(input.name ?? "").trim();
  const rawLines = Array.isArray(input.lines) ? input.lines as Array<Record<string, unknown>> : [];
  if (!Number.isInteger(fiscalYearId) || !name || !rawLines.length) throw new BudgetError("السنة واسم الميزانية وبنودها مطلوبة");
  const year = await tx.fiscalYear.findFirst({ where: { id: fiscalYearId, companyId }, include: { periods: true } });
  if (!year) throw new BudgetError("السنة المالية غير موجودة في الشركة الحالية");
  const periodIds = new Set(year.periods.map((row) => row.id));
  const accountIds = [...new Set(rawLines.map((row) => Number(row.accountId)))];
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds }, isActive: true, allowPosting: true } });
  if (accounts.length !== accountIds.length) throw new BudgetError("أحد حسابات الميزانية غير صالح");
  const lines = rawLines.map((row) => {
    const periodType = String(row.periodType ?? (row.fiscalPeriodId ? "MONTHLY" : "ANNUAL")).toUpperCase();
    const fiscalPeriodId = row.fiscalPeriodId ? Number(row.fiscalPeriodId) : null;
    if (!['ANNUAL', 'MONTHLY'].includes(periodType) || (periodType === "MONTHLY" && (!fiscalPeriodId || !periodIds.has(fiscalPeriodId))) || (periodType === "ANNUAL" && fiscalPeriodId)) {
      throw new BudgetError("ربط فترة بند الميزانية غير صحيح");
    }
    return { accountId: Number(row.accountId), periodType, fiscalPeriodId, costCenterId: row.costCenterId ? Number(row.costCenterId) : null,
      departmentId: row.departmentId ? Number(row.departmentId) : null, projectCode: String(row.projectCode ?? "").trim() || null,
      amount: amount(row.amount), notes: String(row.notes ?? "").trim() || null };
  });
  const dimensionIds = { cost: lines.flatMap((row) => row.costCenterId ? [row.costCenterId] : []), department: lines.flatMap((row) => row.departmentId ? [row.departmentId] : []) };
  if (dimensionIds.cost.length && await tx.costCenter.count({ where: { id: { in: dimensionIds.cost }, companyId } }) !== new Set(dimensionIds.cost).size) throw new BudgetError("مركز تكلفة لا يتبع الشركة الحالية");
  if (dimensionIds.department.length && await tx.department.count({ where: { id: { in: dimensionIds.department }, companyId } }) !== new Set(dimensionIds.department).size) throw new BudgetError("قسم لا يتبع الشركة الحالية");
  const budgetNumber = await nextDocumentNumber(tx, "BUD", year.startDate);
  const budget = await tx.budget.create({ data: { fiscalYearId, budgetNumber, name, currencyCode: String(input.currencyCode ?? "SAR").toUpperCase(), notes: String(input.notes ?? "").trim() || null, lines: { create: lines } },
    include: { fiscalYear: true, lines: { include: { account: true, fiscalPeriod: true, costCenter: true, department: true } } } });
  await audit(tx, { action: "CREATE", entityType: "BUDGET", entityId: budget.id, userId: userId ? String(userId) : undefined, metadata: { budgetNumber, lineCount: lines.length } });
  return budget;
}

export async function approveBudget(tx: Tx, id: number, userId?: number | string | null) {
  const budget = await tx.budget.findUnique({ where: { id }, include: { lines: true } });
  if (!budget) throw new BudgetError("الميزانية غير موجودة");
  if (budget.status === "APPROVED") return budget;
  if (budget.status !== "DRAFT" || !budget.lines.length) throw new BudgetError("لا يمكن اعتماد الميزانية في حالتها الحالية");
  const approved = await tx.budget.update({ where: { id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy: userId ? String(userId) : null }, include: { lines: true } });
  await audit(tx, { action: "APPROVE", entityType: "BUDGET", entityId: id, userId: userId ? String(userId) : undefined });
  return approved;
}

export async function budgetVsActual(tx: Tx, params: URLSearchParams) {
  const budgetId = Number(params.get("budgetId"));
  const budget = await tx.budget.findFirst({ where: { id: budgetId, status: "APPROVED" }, include: { fiscalYear: true, lines: { include: { account: true, fiscalPeriod: true, costCenter: true, department: true } } } });
  if (!budget) throw new BudgetError("اختر ميزانية معتمدة");
  const requestedPeriodId = Number(params.get("fiscalPeriodId"));
  const rows = [];
  for (const line of budget.lines) {
    if (requestedPeriodId > 0 && line.periodType === "MONTHLY" && line.fiscalPeriodId !== requestedPeriodId) continue;
    const startDate = line.fiscalPeriod?.startDate ?? budget.fiscalYear.startDate;
    const endDate = line.fiscalPeriod?.endDate ?? budget.fiscalYear.endDate;
    const ledgerLines = await tx.journalEntryLine.findMany({ where: { accountId: line.accountId,
      ...(line.costCenterId ? { OR: [{ costCenterId: line.costCenterId }, { costCenter: line.costCenter?.code }] } : {}),
      ...(line.departmentId ? { departmentId: line.departmentId } : {}), ...(line.projectCode ? { projectCode: line.projectCode } : {}),
      journalEntry: { status: { in: ["POSTED", "REVERSED"] }, entryDate: { gte: startDate, lte: endDate } } }, include: { journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
    const creditNature = ["REVENUE", "LIABILITY", "EQUITY"].includes(line.account.accountType);
    const actual = ledgerLines.reduce((sum, entry) => sum.plus(creditNature ? new Prisma.Decimal(entry.credit).minus(entry.debit) : new Prisma.Decimal(entry.debit).minus(entry.credit)), new Prisma.Decimal(0)).toNumber();
    const budgetAmount = Number(line.amount), varianceAmount = actual - budgetAmount;
    rows.push({ id: line.id, accountId: line.accountId, accountCode: line.account.code, accountName: line.account.nameAr, accountType: line.account.accountType,
      periodType: line.periodType, fiscalPeriodId: line.fiscalPeriodId, periodName: line.fiscalPeriod?.name ?? "سنوي",
      costCenter: line.costCenter?.nameAr ?? null, department: line.department?.nameAr ?? null, projectCode: line.projectCode,
      budget: budgetAmount, actual, varianceAmount, variancePercent: budgetAmount === 0 ? null : (varianceAmount / budgetAmount) * 100,
      transactions: ledgerLines.map((entry) => ({ id: entry.id, date: entry.journalEntry.entryDate, entryNumber: entry.journalEntry.entryNumber,
        referenceType: entry.journalEntry.referenceType, referenceId: entry.journalEntry.referenceId, referenceNumber: entry.journalEntry.referenceNumber,
        description: entry.description, debit: Number(entry.debit), credit: Number(entry.credit) })) });
  }
  return { budget: { id: budget.id, number: budget.budgetNumber, name: budget.name, fiscalYear: budget.fiscalYear.name, currencyCode: budget.currencyCode }, rows,
    totals: rows.reduce((sum, row) => ({ budget: sum.budget + row.budget, actual: sum.actual + row.actual, varianceAmount: sum.varianceAmount + row.varianceAmount }), { budget: 0, actual: 0, varianceAmount: 0 }) };
}
