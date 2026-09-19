import { prisma } from "@/lib/prisma";
import { budgetVsActual } from "@/lib/budgeting";
import { accountStatement, agingReport, cashFlow, changesInEquity, generalLedger, reportDates, statementReport, trialBalance, vatReport } from "@/lib/financial-reports";

export const supportedFinancialReports = ["ar-aging", "ap-aging", "trial-balance", "general-ledger", "account-statement", "statements", "profit-and-loss", "balance-sheet", "changes-in-equity", "cash-flow", "vat", "budget-vs-actual"] as const;

export async function loadFinancialReport(report: string, params: URLSearchParams) {
  const { from, to } = reportDates(params);
  if (report === "ar-aging") return agingReport("AR", to ?? new Date());
  if (report === "ap-aging") return agingReport("AP", to ?? new Date());
  if (report === "trial-balance") return trialBalance(from, to);
  if (report === "general-ledger") return generalLedger(params);
  if (report === "account-statement") return accountStatement(params);
  if (["statements", "profit-and-loss", "balance-sheet"].includes(report)) return statementReport(from, to);
  if (report === "changes-in-equity") return changesInEquity(from, to);
  if (report === "cash-flow") return cashFlow(from, to);
  if (report === "vat") return vatReport(from, to);
  if (report === "budget-vs-actual") return prisma.$transaction((tx) => budgetVsActual(tx, params));
  throw new Error("UNKNOWN_REPORT");
}

