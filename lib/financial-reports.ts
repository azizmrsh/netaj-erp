import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const decimal = (value: Prisma.Decimal.Value | null | undefined) => Number(value ?? 0);
const boundary = (value: string | null, end = false) => {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T${end ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

export function reportDates(params: URLSearchParams) {
  return { from: boundary(params.get("from")), to: boundary(params.get("to"), true) };
}

export async function agingReport(kind: "AR" | "AP", asOf = new Date()) {
  const rows = kind === "AR"
    ? (await prisma.sale.findMany({ where: { status: "COMPLETED", invoiceDate: { lte: asOf } }, include: { party: true, allocations: { where: { voucher: { status: "POSTED", voucherDate: { lte: asOf } } } } }, orderBy: { invoiceDate: "asc" } })).map((row) => ({ id: row.id, number: row.invoiceNumber, invoiceDate: row.invoiceDate, dueDate: row.dueDate, partyId: row.partyId, partyName: row.party.nameAr, totalAmount: row.totalAmount, allocations: row.allocations }))
    : (await prisma.purchase.findMany({ where: { status: "COMPLETED", purchaseDate: { lte: asOf } }, include: { party: true, allocations: { where: { voucher: { status: "POSTED", voucherDate: { lte: asOf } } } } }, orderBy: { purchaseDate: "asc" } })).map((row) => ({ id: row.id, number: row.purchaseNumber, invoiceDate: row.purchaseDate, dueDate: row.dueDate, partyId: row.partyId, partyName: row.party.nameAr, totalAmount: row.totalAmount, allocations: row.allocations }));
  const items = rows.flatMap((row) => {
    const paid = row.allocations.reduce((sum, allocation) => sum + decimal(allocation.amount), 0);
    const outstanding = decimal(row.totalAmount) - paid;
    if (outstanding <= 0.004) return [];
    const invoiceDate = row.invoiceDate;
    const dueDate = row.dueDate ?? invoiceDate;
    const ageDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000));
    const bucket = ageDays === 0 ? "CURRENT" : ageDays <= 30 ? "1_30" : ageDays <= 60 ? "31_60" : ageDays <= 90 ? "61_90" : "OVER_90";
    return [{ id: row.id, number: row.number, partyId: row.partyId,
      partyName: row.partyName, invoiceDate, dueDate, total: decimal(row.totalAmount), paid, outstanding, ageDays, bucket }];
  });
  const totals = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0, total: 0 };
  for (const row of items) {
    totals.total += row.outstanding;
    if (row.bucket === "CURRENT") totals.current += row.outstanding;
    else if (row.bucket === "1_30") totals.days1to30 += row.outstanding;
    else if (row.bucket === "31_60") totals.days31to60 += row.outstanding;
    else if (row.bucket === "61_90") totals.days61to90 += row.outstanding;
    else totals.over90 += row.outstanding;
  }
  return { kind, asOf, items, totals };
}

export async function trialBalance(from?: Date, to?: Date, excludeClosing = false) {
  const lines = await prisma.journalEntryLine.findMany({ where: { journalEntry: { status: "POSTED", ...(excludeClosing ? { NOT: [{ referenceType: { startsWith: "FISCAL_YEAR_CLOSE_" } }, { referenceType: { startsWith: "FISCAL_YEAR_REOPEN_" } }] } : {}), ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } }, include: { account: true } });
  const accounts = new Map<number, { accountId: number; code: string; name: string; type: string; debit: number; credit: number; balance: number }>();
  for (const line of lines) {
    if (!line.accountId || !line.account) continue;
    const row = accounts.get(line.accountId) ?? { accountId: line.accountId, code: line.account.code, name: line.account.nameAr, type: line.account.accountType, debit: 0, credit: 0, balance: 0 };
    row.debit += decimal(line.debit); row.credit += decimal(line.credit); row.balance = row.debit - row.credit;
    accounts.set(line.accountId, row);
  }
  const rows = [...accounts.values()].sort((a, b) => a.code.localeCompare(b.code));
  return { rows, totals: rows.reduce((sum, row) => ({ debit: sum.debit + row.debit, credit: sum.credit + row.credit }), { debit: 0, credit: 0 }) };
}

export async function generalLedger(params: URLSearchParams) {
  const { from, to } = reportDates(params);
  const accountId = Number(params.get("accountId"));
  const partyId = Number(params.get("partyId"));
  const lines = await prisma.journalEntryLine.findMany({ where: {
    ...(Number.isInteger(accountId) && accountId > 0 ? { accountId } : {}),
    ...(Number.isInteger(partyId) && partyId > 0 ? { partyId } : {}),
    journalEntry: { status: "POSTED", ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
  }, include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
  let balance = 0;
  return lines.map((line) => { balance += decimal(line.debit) - decimal(line.credit); return { id: line.id, date: line.journalEntry.entryDate,
    entryNumber: line.journalEntry.entryNumber, referenceNumber: line.journalEntry.referenceNumber, accountCode: line.accountCode,
    accountName: line.accountName, description: line.description, debit: decimal(line.debit), credit: decimal(line.credit), balance }; });
}

export async function statementReport(from?: Date, to?: Date) {
  const trial = await trialBalance(from, to, true);
  const byType = (type: string) => trial.rows.filter((row) => row.type === type).reduce((sum, row) => sum + row.balance, 0);
  const revenue = -byType("REVENUE"), expenses = byType("EXPENSE");
  const assets = byType("ASSET"), liabilities = -byType("LIABILITY"), equity = -byType("EQUITY");
  return { profitAndLoss: { revenue, expenses, netProfit: revenue - expenses }, balanceSheet: { assets, liabilities, equity, currentProfit: revenue - expenses, liabilitiesAndEquity: liabilities + equity + revenue - expenses } };
}

export async function accountStatement(params: URLSearchParams) {
  const { from, to } = reportDates(params), accountId = Number(params.get("accountId")), partyId = Number(params.get("partyId"));
  if (!Number.isInteger(accountId) || accountId < 1) return { openingBalance: 0, rows: [], closingBalance: 0 };
  const partyFilter = Number.isInteger(partyId) && partyId > 0 ? { partyId } : {};
  const openingLines = from ? await prisma.journalEntryLine.findMany({ where: { accountId, ...partyFilter, journalEntry: { status: "POSTED", entryDate: { lt: from } } } }) : [];
  const openingBalance = openingLines.reduce((sum, line) => sum + decimal(line.debit) - decimal(line.credit), 0);
  const lines = await prisma.journalEntryLine.findMany({ where: { accountId, ...partyFilter,
    journalEntry: { status: "POSTED", ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } },
    include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
  let balance = openingBalance;
  const rows = lines.map((line) => { balance += decimal(line.debit) - decimal(line.credit); return { id: line.id, date: line.journalEntry.entryDate,
    entryNumber: line.journalEntry.entryNumber, referenceType: line.journalEntry.referenceType, referenceId: line.journalEntry.referenceId,
    referenceNumber: line.journalEntry.referenceNumber, description: line.description ?? line.journalEntry.description,
    debit: decimal(line.debit), credit: decimal(line.credit), balance }; });
  return { account: lines[0]?.account ?? await prisma.account.findUnique({ where: { id: accountId } }), openingBalance, rows, closingBalance: balance,
    totals: rows.reduce((sum, row) => ({ debit: sum.debit + row.debit, credit: sum.credit + row.credit }), { debit: 0, credit: 0 }) };
}

export async function changesInEquity(from?: Date, to?: Date) {
  const equityAccounts = await prisma.account.findMany({ where: { accountType: "EQUITY", isActive: true }, orderBy: { code: "asc" } });
  const accountIds = equityAccounts.map((account) => account.id);
  const [openingLines, movementLines, performance] = await Promise.all([
    from ? prisma.journalEntryLine.findMany({ where: { accountId: { in: accountIds }, journalEntry: { status: "POSTED", entryDate: { lt: from } } } }) : Promise.resolve([]),
    prisma.journalEntryLine.findMany({ where: { accountId: { in: accountIds }, journalEntry: { status: "POSTED", NOT: [{ referenceType: { startsWith: "FISCAL_YEAR_CLOSE_" } }, { referenceType: { startsWith: "FISCAL_YEAR_REOPEN_" } }], ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } } }),
    statementReport(from, to),
  ]);
  const creditBalance = (lines: typeof movementLines, accountId: number) => lines.filter((line) => line.accountId === accountId).reduce((sum, line) => sum + decimal(line.credit) - decimal(line.debit), 0);
  const rows = equityAccounts.map((account) => { const opening = creditBalance(openingLines, account.id), directChanges = creditBalance(movementLines, account.id); return { accountId: account.id, code: account.code, name: account.nameAr, opening, directChanges, closingBeforeProfit: opening + directChanges }; });
  const openingEquity = rows.reduce((sum, row) => sum + row.opening, 0), directChanges = rows.reduce((sum, row) => sum + row.directChanges, 0), currentProfit = Number(performance.profitAndLoss.netProfit);
  return { rows, totals: { openingEquity, directChanges, currentProfit, closingEquity: openingEquity + directChanges + currentProfit } };
}

export async function cashFlow(from?: Date, to?: Date) {
  const transactions = await prisma.bankTransaction.findMany({ where: from || to ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}, include: { bankAccount: true }, orderBy: [{ transactionDate: "asc" }, { id: "asc" }] });
  const rows = transactions.map((row) => ({ ...row, amountIn: decimal(row.amountIn), amountOut: decimal(row.amountOut), balanceAfter: decimal(row.balanceAfter) }));
  return { rows, totals: rows.reduce((sum, row) => ({ inflow: sum.inflow + row.amountIn, outflow: sum.outflow + row.amountOut, net: sum.net + row.amountIn - row.amountOut }), { inflow: 0, outflow: 0, net: 0 }) };
}

export async function vatReport(from?: Date, to?: Date) {
  const lines = await prisma.journalEntryLine.findMany({ where: { journalEntry: { status: "POSTED", ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, account: { mappings: { some: { key: { in: ["VAT_PAYABLE", "INPUT_VAT"] } } } } }, include: { account: { include: { mappings: true } }, journalEntry: true } });
  let outputVat = 0, inputVat = 0;
  for (const line of lines) {
    const key = line.account?.mappings.find((row) => row.key === "VAT_PAYABLE" || row.key === "INPUT_VAT")?.key;
    if (key === "VAT_PAYABLE") outputVat += decimal(line.credit) - decimal(line.debit);
    if (key === "INPUT_VAT") inputVat += decimal(line.debit) - decimal(line.credit);
  }
  return { outputVat, inputVat, netVatDue: outputVat - inputVat, lines: lines.map((line) => ({ date: line.journalEntry.entryDate, entryNumber: line.journalEntry.entryNumber, accountName: line.accountName, debit: decimal(line.debit), credit: decimal(line.credit) })) };
}
