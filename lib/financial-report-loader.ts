import { prisma } from "@/lib/prisma";
import { budgetVsActual } from "@/lib/budgeting";
import { accountStatement, agingReport, cashFlow, changesInEquity, generalLedger, reportDates, reportFilters, ReportInputError, statementReport, trialBalance, vatReport } from "@/lib/financial-reports";

export const supportedFinancialReports = ["ar-aging", "ap-aging", "trial-balance", "general-ledger", "account-statement", "statements", "profit-and-loss", "balance-sheet", "changes-in-equity", "cash-flow", "vat", "budget-vs-actual"] as const;

export async function loadFinancialReport(report: string, params: URLSearchParams) {
  const { from, to } = reportDates(params);
  const filters = reportFilters(params);
  if (filters.branchId && ["ar-aging", "ap-aging", "budget-vs-actual"].includes(report)) throw new ReportInputError("هذا التقرير لا يدعم تصفية الفرع؛ استخدم تقارير الأستاذ المرتبطة بالفروع");
  if (filters.level && report !== "trial-balance") throw new ReportInputError("تجميع المستوى متاح في ميزان المراجعة فقط");
  if ((filters.costCenterId || filters.departmentId || filters.accountId || filters.partyId) && !["trial-balance", "general-ledger", "account-statement", "statements", "profit-and-loss", "balance-sheet", "budget-vs-actual"].includes(report)) throw new ReportInputError("هذا التقرير لا يدعم أبعاد التصفية المختارة");
  if (report === "ar-aging") return agingReport("AR", to ?? new Date());
  if (report === "ap-aging") return agingReport("AP", to ?? new Date());
  if (report === "trial-balance") return trialBalance(from, to, false, filters);
  if (report === "general-ledger") return generalLedger(params);
  if (report === "account-statement") return accountStatement(params);
  if (["statements", "profit-and-loss", "balance-sheet"].includes(report)) return statementReport(from, to, filters);
  if (report === "changes-in-equity") return changesInEquity(from, to, filters);
  if (report === "cash-flow") return cashFlow(from, to, filters);
  if (report === "vat") return vatReport(from, to, filters);
  if (report === "budget-vs-actual") return prisma.$transaction((tx) => budgetVsActual(tx, params));
  throw new Error("UNKNOWN_REPORT");
}
