import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agingReport, cashFlow, statementReport } from "@/lib/financial-reports";
import { ensureFinanceFoundation } from "@/lib/finance";

export async function GET() {
  try {
    await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
    const [banks, receivables, payables, statements, cash, recentVouchers, categories, parties, accounts, periods, journals, transfers, reconciliations, vatReturns] = await Promise.all([
      prisma.bankAccount.findMany({ where: { isActive: true }, include: { ledgerAccount: true }, orderBy: { name: "asc" } }),
      agingReport("AR"), agingReport("AP"), statementReport(), cashFlow(),
      prisma.financialVoucher.findMany({ include: { party: true, bankAccount: true, allocations: true }, orderBy: [{ voucherDate: "desc" }, { id: "desc" }], take: 30 }),
      Promise.all([prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }), prisma.revenueCategory.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }), prisma.costCenter.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } })]),
      prisma.party.findMany({ where: { isActive: true }, select: { id: true, nameAr: true, isCustomer: true, isSupplier: true }, orderBy: { nameAr: "asc" } }),
      prisma.account.findMany({ where: { isActive: true, allowPosting: true }, orderBy: { code: "asc" } }),
      prisma.accountingPeriod.findMany({ orderBy: { startDate: "desc" } }),
      prisma.journalEntry.findMany({ include: { lines: true }, orderBy: [{ entryDate: "desc" }, { id: "desc" }], take: 50 }),
      prisma.bankTransfer.findMany({ include: { fromBankAccount: true, toBankAccount: true }, orderBy: [{ transferDate: "desc" }, { id: "desc" }], take: 50 }),
      prisma.bankReconciliation.findMany({ include: { bankAccount: true, lines: true }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 50 }),
      prisma.vatReturn.findMany({ include: { lines: true, bankAccount: true }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 50 }),
    ]);
    return NextResponse.json({ banks, receivables, payables, statements, cash, recentVouchers,
      expenseCategories: categories[0], revenueCategories: categories[1], costCenters: categories[2], parties, accounts, periods, journals, transfers, reconciliations, vatReturns });
  } catch (error) { console.error(error); return NextResponse.json({ error: "تعذر تحميل البيانات المالية" }, { status: 500 }); }
}
