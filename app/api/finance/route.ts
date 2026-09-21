import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { agingReport, cashFlow, statementReport } from "@/lib/financial-reports";
import { ensureFinanceFoundation } from "@/lib/finance";
import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
    const [banks, receivables, payables, statements, cash, recentVouchers, categories, parties, accounts, periods, journals, transfers, reconciliations, vatReturns, creditDebitNotes, adjustments, invoices] = await Promise.all([
      prisma.bankAccount.findMany({ where: { isActive: true }, include: { ledgerAccount: true }, orderBy: { name: "asc" } }),
      agingReport("AR"), agingReport("AP"), statementReport(), cashFlow(),
      prisma.financialVoucher.findMany({ include: { party: true, bankAccount: true, allocations: true }, orderBy: [{ voucherDate: "desc" }, { id: "desc" }], take: 30 }),
      Promise.all([prisma.expenseCategory.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }), prisma.revenueCategory.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }), prisma.costCenter.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } })]),
      prisma.party.findMany({ where: { isActive: true }, select: { id: true, nameAr: true, isCustomer: true, isSupplier: true }, orderBy: { nameAr: "asc" } }),
      // The chart of accounts needs both posting accounts and their parent
      // nodes. Filtering to allowPosting accounts made the tree look flat.
      prisma.account.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      prisma.accountingPeriod.findMany({ orderBy: { startDate: "desc" } }),
      prisma.journalEntry.findMany({ include: { lines: true }, orderBy: [{ entryDate: "desc" }, { id: "desc" }], take: 50 }),
      prisma.bankTransfer.findMany({ include: { fromBankAccount: true, toBankAccount: true }, orderBy: [{ transferDate: "desc" }, { id: "desc" }], take: 50 }),
      prisma.bankReconciliation.findMany({ include: { bankAccount: true, lines: true }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 50 }),
      prisma.vatReturn.findMany({ include: { lines: true, bankAccount: true }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 50 }),
      prisma.creditDebitNote.findMany({ include: { party: true, sale: true, purchase: true }, orderBy: [{ noteDate: "desc" }, { id: "desc" }], take: 50 }),
      prisma.accountingAdjustment.findMany({ include: { lines: { include: { account: true } } }, orderBy: [{ adjustmentDate: "desc" }, { id: "desc" }], take: 50 }),
      Promise.all([prisma.sale.findMany({ where: { status: { in: ["POSTED", "COMPLETED"] } }, select: { id: true, invoiceNumber: true, partyId: true, totalAmount: true }, orderBy: { invoiceDate: "desc" }, take: 200 }), prisma.purchase.findMany({ where: { status: { in: ["POSTED", "COMPLETED"] } }, select: { id: true, purchaseNumber: true, partyId: true, totalAmount: true }, orderBy: { purchaseDate: "desc" }, take: 200 })]),
    ]);
    const [fiscalYears, departments, currencies, exchangeRates, budgets, fxRevaluations, ledgerExpenses, ledgerRevenues] = await Promise.all([
      prisma.fiscalYear.findMany({ where: { companyId: auth.companyId }, include: { periods: { orderBy: { periodNumber: "asc" } } }, orderBy: { startDate: "desc" } }),
      prisma.department.findMany({ where: { companyId: auth.companyId }, orderBy: { nameAr: "asc" } }),
      prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
      prisma.exchangeRate.findMany({ orderBy: [{ rateDate: "desc" }, { id: "desc" }], take: 100 }),
      prisma.budget.findMany({ include: { fiscalYear: true, lines: { include: { account: true, fiscalPeriod: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.fxRevaluation.findMany({ include: { lines: true, journalEntry: true, reversalJournal: true }, orderBy: { revaluationDate: "desc" }, take: 100 }),
      prisma.journalEntryLine.findMany({ where: { debit: { gt: 0 }, account: { accountType: "EXPENSE" }, journalEntry: { status: "POSTED" } }, include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "desc" } }, { id: "desc" }], take: 500 }),
      prisma.journalEntryLine.findMany({ where: { credit: { gt: 0 }, account: { accountType: "REVENUE" }, journalEntry: { status: "POSTED" } }, include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "desc" } }, { id: "desc" }], take: 500 }),
    ]);
    const branches = await prisma.branch.findMany({ where: { companyId: auth.companyId, isActive: true }, select: { id: true, nameAr: true } });
    return NextResponse.json({ banks, branches, receivables, payables, statements, cash, recentVouchers,
      expenseCategories: categories[0], revenueCategories: categories[1], costCenters: categories[2], parties, accounts, periods, journals, transfers, reconciliations, vatReturns, creditDebitNotes, adjustments, salesInvoices: invoices[0], purchaseInvoices: invoices[1],
      fiscalYears, departments, currencies, exchangeRates, budgets, fxRevaluations, ledgerExpenses, ledgerRevenues });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    console.error(error); return NextResponse.json({ error: "تعذر تحميل البيانات المالية" }, { status: 500 });
  }
}
