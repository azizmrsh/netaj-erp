import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getVerifiedDataScope } from "@/lib/data-scope";

const postedLedgerStatus = { in: ["POSTED", "REVERSED"] };
const decimal = (value: Prisma.Decimal.Value | null | undefined) => Number(value ?? 0);
const sumMoney = (values: Array<Prisma.Decimal.Value | null | undefined>) => values.reduce<Prisma.Decimal>((sum, value) => sum.plus(value ?? 0), new Prisma.Decimal(0)).toNumber();
export class ReportInputError extends Error {}
const boundary = (value: string | null, end = false) => {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : `${value}T${end ? "23:59:59.999" : "00:00:00.000"}`);
  if (Number.isNaN(date.getTime()) || (/^\d{4}-\d{2}-\d{2}$/.test(value) && `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` !== value)) throw new ReportInputError("تاريخ التقرير غير صحيح");
  return date;
};

export function reportDates(params: URLSearchParams) {
  const from = boundary(params.get("from")), to = boundary(params.get("to"), true);
  if (from && to && from > to) throw new ReportInputError("بداية الفترة يجب أن تسبق نهايتها");
  return { from, to };
}

export type ReportFilters = { accountId?: number; partyId?: number; costCenterId?: number; departmentId?: number; branchId?: number; level?: number; includeZero?: boolean; includeChildren?: boolean };
export function reportFilters(params: URLSearchParams): ReportFilters {
  const result: ReportFilters = { includeZero: params.get("includeZero") === "1", includeChildren: params.get("includeChildren") === "1" };
  for (const key of ["accountId", "partyId", "costCenterId", "departmentId", "branchId", "level"] as const) {
    const raw = params.get(key);
    if (!raw) continue;
    const id = Number(raw);
    if (!Number.isInteger(id) || id < 1) throw new ReportInputError("معرّف فلتر التقرير غير صحيح");
    result[key] = id;
  }
  if (result.level && result.level > 20) throw new ReportInputError("مستوى تجميع الحسابات يجب أن يكون بين 1 و20");
  return result;
}
async function branchFilter(filters: ReportFilters): Promise<Prisma.JournalEntryWhereInput> {
  if (!filters.branchId) return {};
  const { companyId } = await getVerifiedDataScope();
  if (!await prisma.branch.findFirst({ where: { id: filters.branchId, companyId } })) throw new ReportInputError("الفرع غير موجود ضمن الشركة الحالية");
  return { branchId: filters.branchId };
}
async function ledgerFilter(filters: ReportFilters): Promise<Prisma.JournalEntryLineWhereInput> {
  const { accountId, partyId, costCenterId, departmentId } = filters;
  const center = costCenterId ? await prisma.costCenter.findUnique({ where: { id: costCenterId } }) : null;
  if (costCenterId && !center) throw new ReportInputError("مركز التكلفة غير موجود");
  const account = accountId ? await prisma.account.findUnique({ where: { id: accountId } }) : null;
  if (accountId && !account) throw new ReportInputError("الحساب غير موجود");
  const branch = await branchFilter(filters);
  const accountIds = new Set(account ? [account.id] : []), accountCodes = new Set(account ? [account.code] : []);
  if (account && filters.includeChildren) {
    const chart = await prisma.account.findMany();
    let size = 0;
    while (size !== accountIds.size) { size = accountIds.size; for (const row of chart) if (row.parentId && accountIds.has(row.parentId)) { accountIds.add(row.id); accountCodes.add(row.code); } }
  }
  return { ...(partyId ? { partyId } : {}), ...(departmentId ? { departmentId } : {}), AND: [
    ...(filters.branchId ? [{ journalEntry: branch }] : []),
    ...(account ? [{ OR: [{ accountId: { in: [...accountIds] } }, { accountId: null, accountCode: { in: [...accountCodes] } }] }] : []),
    ...(center ? [{ OR: [{ costCenterId: center.id }, { costCenterId: null, costCenter: center.code }] }] : []),
  ] };
}
const nonClosingEntries: Prisma.JournalEntryWhereInput = { OR: [
  { referenceType: null },
  { NOT: [{ referenceType: { startsWith: "FISCAL_YEAR_CLOSE_" } }, { referenceType: { startsWith: "FISCAL_YEAR_REOPEN_" } }] },
] };
function ledgerDrilldown(accountId: number | null, from?: Date, to?: Date, filters: ReportFilters = {}) {
  const query = new URLSearchParams({ tab: "reports", report: "account-statement" });
  if (accountId) query.set("accountId", String(accountId));
  if (from) query.set("from", from.toISOString());
  if (to) query.set("to", to.toISOString());
  if (filters.costCenterId) query.set("costCenterId", String(filters.costCenterId));
  if (filters.departmentId) query.set("departmentId", String(filters.departmentId));
  if (filters.partyId) query.set("partyId", String(filters.partyId));
  if (filters.branchId) query.set("branchId", String(filters.branchId));
  if (filters.level || filters.includeChildren) query.set("includeChildren", "1");
  return `/accounting?${query}`;
}

export async function agingReport(kind: "AR" | "AP", asOf = new Date()) {
  // Legacy migrations use POSTED while native invoices use COMPLETED. Both
  // represent an approved invoice and must participate in sub-ledger aging.
  const approvedStatuses = { in: ["POSTED", "COMPLETED"] };
  const rows = kind === "AR"
    ? (await prisma.sale.findMany({ where: { status: approvedStatuses, invoiceDate: { lte: asOf } }, include: { party: true, allocations: { where: { voucher: { status: "POSTED", voucherDate: { lte: asOf } } } } }, orderBy: { invoiceDate: "asc" } })).map((row) => ({ id: row.id, number: row.invoiceNumber, invoiceDate: row.invoiceDate, dueDate: row.dueDate, partyId: row.partyId, partyName: row.party.nameAr, currency: row.currency, totalAmount: row.totalAmount, functionalTotalAmount: row.functionalTotalAmount, allocations: row.allocations }))
    : (await prisma.purchase.findMany({ where: { status: approvedStatuses, purchaseDate: { lte: asOf } }, include: { party: true, allocations: { where: { voucher: { status: "POSTED", voucherDate: { lte: asOf } } } } }, orderBy: { purchaseDate: "asc" } })).map((row) => ({ id: row.id, number: row.purchaseNumber, invoiceDate: row.purchaseDate, dueDate: row.dueDate, partyId: row.partyId, partyName: row.party.nameAr, currency: row.currency, totalAmount: row.totalAmount, functionalTotalAmount: row.functionalTotalAmount, allocations: row.allocations }));
  const notes = await prisma.creditDebitNote.findMany({ where: { direction: kind === "AR" ? "SALES" : "PURCHASE", status: "POSTED", noteDate: { lte: asOf } } });
  const noteBalance = new Map<number, number>(), functionalNoteBalance = new Map<number, number>();
  for (const note of notes) { const sourceId = kind === "AR" ? note.saleId : note.purchaseId; if (!sourceId) continue; const sign = note.noteType === "DEBIT_NOTE" ? 1 : -1; noteBalance.set(sourceId, (noteBalance.get(sourceId) ?? 0) + sign * decimal(note.totalAmount)); functionalNoteBalance.set(sourceId, (functionalNoteBalance.get(sourceId) ?? 0) + sign * decimal(note.functionalTotalAmount)); }
  const items = rows.flatMap((row) => {
    const paid = row.allocations.reduce((sum, allocation) => sum + decimal(allocation.amount), 0), paidFunctional = row.allocations.reduce((sum, allocation) => sum + decimal(allocation.carryingFunctionalAmount), 0);
    const transactionOutstanding = decimal(row.totalAmount) + (noteBalance.get(row.id) ?? 0) - paid;
    const outstanding = decimal(row.functionalTotalAmount) + (functionalNoteBalance.get(row.id) ?? 0) - paidFunctional;
    if (transactionOutstanding <= 0.004) return [];
    const invoiceDate = row.invoiceDate;
    const dueDate = row.dueDate ?? invoiceDate;
    const ageDays = Math.max(0, Math.floor((asOf.getTime() - dueDate.getTime()) / 86_400_000));
    const bucket = ageDays === 0 ? "CURRENT" : ageDays <= 30 ? "1_30" : ageDays <= 60 ? "31_60" : ageDays <= 90 ? "61_90" : "OVER_90";
    return [{ id: row.id, number: row.number, partyId: row.partyId,
      partyName: row.partyName, invoiceDate, dueDate, currency: row.currency, transactionTotal: decimal(row.totalAmount), transactionPaid: paid,
      transactionOutstanding, total: decimal(row.functionalTotalAmount), paid: paidFunctional, outstanding, ageDays, bucket }];
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

export async function trialBalance(from?: Date, to?: Date, excludeClosing = false, filters: ReportFilters = {}) {
  const where = await ledgerFilter(filters);
  const [lines, chart] = await Promise.all([
    prisma.journalEntryLine.findMany({ where: { ...where, journalEntry: { status: postedLedgerStatus, ...(excludeClosing ? nonClosingEntries : {}), ...(to ? { entryDate: { lte: to } } : {}) } }, include: { account: true, journalEntry: { select: { entryDate: true, branchId: true } } } }),
    prisma.account.findMany({ orderBy: { code: "asc" } }),
  ]);
  const chartByCode = new Map(chart.map(account => [account.code, account]));
  const chartById = new Map(chart.map(account => [account.id, account]));
  type BalanceRow = { accountId: number | null; code: string; name: string; type: string; opening: Prisma.Decimal; debit: Prisma.Decimal; credit: Prisma.Decimal };
  const accounts = new Map<string, BalanceRow>();
  if (filters.includeZero) for (const account of chart) {
    if (filters.accountId && account.id !== filters.accountId) {
      let parent = filters.includeChildren ? account.parentId : null;
      const visited = new Set<number>();
      while (parent && parent !== filters.accountId && !visited.has(parent)) { visited.add(parent); parent = chartById.get(parent)?.parentId ?? null; }
      if (parent !== filters.accountId) continue;
    }
    accounts.set(account.code, { accountId: account.id, code: account.code, name: account.nameAr, type: account.accountType, opening: new Prisma.Decimal(0), debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) });
  }
  for (const line of lines) {
    const account = line.account ?? chartByCode.get(line.accountCode);
    const code = account?.code ?? line.accountCode;
    const row = accounts.get(code) ?? { accountId: account?.id ?? null, code, name: account?.nameAr ?? line.accountName, type: account?.accountType ?? "UNMAPPED", opening: new Prisma.Decimal(0), debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    if (from && line.journalEntry.entryDate < from) row.opening = row.opening.plus(line.debit).minus(line.credit);
    else { row.debit = row.debit.plus(line.debit); row.credit = row.credit.plus(line.credit); }
    accounts.set(code, row);
  }
  // One non-overlapping bucket per ancestor: never add parent totals to leaf
  // totals again. Direct postings to a parent are included exactly once.
  const grouped = new Map<string, BalanceRow>();
  for (const row of accounts.values()) {
    const ancestry = [], visited = new Set<number>();
    let current = row.accountId ? chartById.get(row.accountId) : undefined;
    while (current && !visited.has(current.id)) { visited.add(current.id); ancestry.unshift(current); current = current.parentId ? chartById.get(current.parentId) : undefined; }
    const target = filters.level ? ancestry[Math.min(filters.level, ancestry.length) - 1] : undefined;
    const code = target?.code ?? row.code;
    const bucket = grouped.get(code) ?? { ...row, ...(target ? { accountId: target.id, code, name: target.nameAr, type: target.accountType } : {}), opening: new Prisma.Decimal(0), debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) };
    bucket.opening = bucket.opening.plus(row.opening); bucket.debit = bucket.debit.plus(row.debit); bucket.credit = bucket.credit.plus(row.credit);
    grouped.set(code, bucket);
  }
  const rows = [...grouped.values()].sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true })).map(row => {
    const movement = row.debit.minus(row.credit), closing = row.opening.plus(movement);
    return { accountId: row.accountId, code: row.code, name: row.name, type: row.type, openingBalance: row.opening.toNumber(),
      openingDebit: Prisma.Decimal.max(row.opening, 0).toNumber(), openingCredit: Prisma.Decimal.max(row.opening.negated(), 0).toNumber(),
      debit: row.debit.toNumber(), credit: row.credit.toNumber(), movementBalance: movement.toNumber(), balance: closing.toNumber(),
      closingDebit: Prisma.Decimal.max(closing, 0).toNumber(), closingCredit: Prisma.Decimal.max(closing.negated(), 0).toNumber(), drilldownUrl: ledgerDrilldown(row.accountId, from, to, filters) };
  }).filter(row => filters.includeZero || row.openingBalance !== 0 || row.debit !== 0 || row.credit !== 0);
  const totals = { openingDebit: sumMoney(rows.map(row => row.openingDebit)), openingCredit: sumMoney(rows.map(row => row.openingCredit)),
    debit: sumMoney(rows.map(row => row.debit)), credit: sumMoney(rows.map(row => row.credit)), closingDebit: sumMoney(rows.map(row => row.closingDebit)), closingCredit: sumMoney(rows.map(row => row.closingCredit)) };
  const difference = new Prisma.Decimal(totals.closingDebit).minus(totals.closingCredit).toNumber();
  return { rows, totals, difference, balanced: Math.abs(difference) < 0.005, unmappedAccountCount: rows.filter(row => row.type === "UNMAPPED").length,
    unassignedEntryCount: new Set(lines.filter(line => line.journalEntry.branchId == null).map(line => line.journalEntryId)).size };
}

export async function generalLedger(params: URLSearchParams) {
  const { from, to } = reportDates(params);
  const where = await ledgerFilter(reportFilters(params));
  const openingLines = from ? await prisma.journalEntryLine.findMany({ where: { ...where, journalEntry: { status: postedLedgerStatus, entryDate: { lt: from } } } }) : [];
  const balances = new Map<string, Prisma.Decimal>();
  for (const line of openingLines) balances.set(line.accountCode, (balances.get(line.accountCode) ?? new Prisma.Decimal(0)).plus(line.debit).minus(line.credit));
  const lines = await prisma.journalEntryLine.findMany({ where: {
    ...where,
    journalEntry: { status: postedLedgerStatus, ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) },
  }, include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
  return lines.map((line) => { const openingBalance = balances.get(line.accountCode) ?? new Prisma.Decimal(0), balance = openingBalance.plus(line.debit).minus(line.credit); balances.set(line.accountCode, balance); return { id: line.id, date: line.journalEntry.entryDate,
    entryNumber: line.journalEntry.entryNumber, referenceType: line.journalEntry.referenceType, referenceId: line.journalEntry.referenceId,
    referenceNumber: line.journalEntry.referenceNumber, journalId: line.journalEntryId, sourceUrl: sourceDocumentUrl(line.journalEntry.referenceType, line.journalEntry.referenceId, line.journalEntryId), accountCode: line.accountCode,
    accountName: line.accountName, description: line.description, transactionCurrency: line.transactionCurrencyCode,
    transactionDebit: decimal(line.transactionDebit), transactionCredit: decimal(line.transactionCredit), exchangeRate: decimal(line.exchangeRate),
    debit: decimal(line.debit), credit: decimal(line.credit), openingBalance: openingBalance.toNumber(), balance: balance.toNumber() }; });
}

export function sourceDocumentUrl(referenceType: string | null, referenceId: number | null, journalId?: number) {
  const fallback = journalId ? `/accounting?tab=journals&journalId=${journalId}` : null;
  if (!referenceType || !referenceId) return fallback;
  // These are existing document routes. Notes have their own IDs and must not
  // open a sale with the same number. Unsupported source viewers open the
  // actual posted journal instead of an unrelated accounting overview.
  if (referenceType === "SALES_INVOICE") return `/sales/${referenceId}/print`;
  if (referenceType === "SUPPLIER_INVOICE") return `/purchases/${referenceId}/print`;
  if (["FINANCIAL_VOUCHER", "FINANCIAL_VOUCHER_RECEIPT", "FINANCIAL_VOUCHER_PAYMENT"].includes(referenceType)) return `/accounting?tab=allVouchers&voucherId=${referenceId}`;
  return fallback;
}

export async function statementReport(from?: Date, to?: Date, filters: ReportFilters = {}) {
  // Performance is a period movement before closing. Financial position is the
  // actual cumulative ledger, including prior-year transfers to retained earnings.
  const [performance, position, mappings] = await Promise.all([trialBalance(from, to, true, filters), trialBalance(undefined, to, false, filters), prisma.accountingMapping.findMany()]);
  const performanceRows = performance.rows.map(row => ({ ...row, reportAmount: row.type === "REVENUE" ? -row.movementBalance : row.movementBalance }));
  const positionRows = position.rows.map(row => ({ ...row, reportAmount: ["REVENUE", "LIABILITY", "EQUITY"].includes(row.type) ? -row.balance : row.balance }));
  const total = (rows: typeof performanceRows, type: string) => sumMoney(rows.filter(row => row.type === type).map(row => row.reportAmount));
  const revenue = total(performanceRows, "REVENUE"), expenses = total(performanceRows, "EXPENSE"), netProfit = sumMoney([revenue, -expenses]);
  const assets = total(positionRows, "ASSET"), liabilities = total(positionRows, "LIABILITY"), equity = total(positionRows, "EQUITY");
  const currentProfit = sumMoney([total(positionRows, "REVENUE"), -total(positionRows, "EXPENSE")]);
  const liabilitiesAndEquity = sumMoney([liabilities, equity, currentProfit]), difference = sumMoney([assets, -liabilitiesAndEquity]);
  const cogsIds = new Set(mappings.filter(row => row.key === "COST_OF_GOODS_SOLD").map(row => row.accountId));
  const salesIds = new Set(mappings.filter(row => row.key === "SALES_REVENUE").map(row => row.accountId));
  const costOfSales = sumMoney(performanceRows.filter(row => row.accountId && cogsIds.has(row.accountId)).map(row => row.reportAmount));
  const netSales = sumMoney(performanceRows.filter(row => row.accountId && salesIds.has(row.accountId)).map(row => row.reportAmount));
  return { profitAndLoss: { revenue, expenses, netProfit, netSales, otherRevenue: sumMoney([revenue, -netSales]), costOfSales, grossProfit: sumMoney([netSales, -costOfSales]), operatingExpenses: sumMoney([expenses, -costOfSales]), profitMargin: revenue ? netProfit / revenue * 100 : null,
      revenueAccounts: performanceRows.filter(row => row.type === "REVENUE"), expenseAccounts: performanceRows.filter(row => row.type === "EXPENSE") },
    balanceSheet: { asOf: to ?? null, assets, liabilities, equity, currentProfit, liabilitiesAndEquity, difference, balanced: Math.abs(difference) < 0.005,
      assetAccounts: positionRows.filter(row => row.type === "ASSET"), liabilityAccounts: positionRows.filter(row => row.type === "LIABILITY"), equityAccounts: positionRows.filter(row => row.type === "EQUITY") },
    unmappedAccountCount: position.unmappedAccountCount, unassignedEntryCount: position.unassignedEntryCount };
}

export async function accountStatement(params: URLSearchParams) {
  const { from, to } = reportDates(params), accountId = Number(params.get("accountId")), partyId = Number(params.get("partyId"));
  if (!Number.isInteger(accountId) || accountId < 1) throw new ReportInputError("اختر الحساب المطلوب لكشف الحساب");
  const where = await ledgerFilter({ ...reportFilters(params), accountId, ...(partyId > 0 ? { partyId } : {}) });
  const openingLines = from ? await prisma.journalEntryLine.findMany({ where: { ...where, journalEntry: { status: postedLedgerStatus, entryDate: { lt: from } } } }) : [];
  const openingBalance = sumMoney(openingLines.flatMap(line => [line.debit, line.credit.negated()]));
  const lines = await prisma.journalEntryLine.findMany({ where: { ...where,
    journalEntry: { status: postedLedgerStatus, ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } },
    include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
  let balance = new Prisma.Decimal(openingBalance);
  const rows = lines.map((line) => { balance = balance.plus(line.debit).minus(line.credit); return { id: line.id, date: line.journalEntry.entryDate,
    entryNumber: line.journalEntry.entryNumber, referenceType: line.journalEntry.referenceType, referenceId: line.journalEntry.referenceId,
    referenceNumber: line.journalEntry.referenceNumber, journalId: line.journalEntryId, sourceUrl: sourceDocumentUrl(line.journalEntry.referenceType, line.journalEntry.referenceId, line.journalEntryId), description: line.description ?? line.journalEntry.description,
    debit: decimal(line.debit), credit: decimal(line.credit), balance: balance.toNumber() }; });
  return { account: await prisma.account.findUnique({ where: { id: accountId } }), openingBalance, rows, closingBalance: balance.toNumber(),
    totals: { debit: sumMoney(rows.map(row => row.debit)), credit: sumMoney(rows.map(row => row.credit)) } };
}

export async function changesInEquity(from?: Date, to?: Date, filters: ReportFilters = {}) {
  const branch = await branchFilter(filters);
  const equityAccounts = await prisma.account.findMany({ where: { accountType: "EQUITY" }, orderBy: { code: "asc" } });
  const accountIds = equityAccounts.map((account) => account.id);
  const accounts: Prisma.JournalEntryLineWhereInput = { OR: [{ accountId: { in: accountIds } }, { accountId: null, accountCode: { in: equityAccounts.map(account => account.code) } }] };
  const [openingLines, movementLines, performance] = await Promise.all([
    from ? prisma.journalEntryLine.findMany({ where: { ...accounts, journalEntry: { ...branch, status: postedLedgerStatus, entryDate: { lt: from } } } }) : Promise.resolve([]),
    prisma.journalEntryLine.findMany({ where: { ...accounts, journalEntry: { ...branch, status: postedLedgerStatus, ...nonClosingEntries, ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) } } }),
    statementReport(from, to, filters),
  ]);
  const creditBalance = (lines: typeof movementLines, account: typeof equityAccounts[number]) => sumMoney(lines.filter(line => line.accountId === account.id || (line.accountId == null && line.accountCode === account.code)).flatMap(line => [line.credit, line.debit.negated()]));
  const rows = equityAccounts.map((account) => { const opening = creditBalance(openingLines, account), directChanges = creditBalance(movementLines, account); return { accountId: account.id, code: account.code, name: account.nameAr, opening, directChanges, closingBeforeProfit: sumMoney([opening, directChanges]) }; });
  const openingTrial = from ? await trialBalance(undefined, new Date(from.getTime() - 1), false, filters) : null;
  const openingUnclosedProfit = openingTrial ? -sumMoney(openingTrial.rows.filter(row => ["REVENUE", "EXPENSE"].includes(row.type)).map(row => row.balance)) : 0;
  const openingEquity = sumMoney([...rows.map(row => row.opening), openingUnclosedProfit]), directChanges = sumMoney(rows.map(row => row.directChanges)), currentProfit = Number(performance.profitAndLoss.netProfit);
  return { rows, totals: { openingEquity, openingUnclosedProfit, directChanges, currentProfit, closingEquity: sumMoney([openingEquity, directChanges, currentProfit]) } };
}

export async function cashFlow(from?: Date, to?: Date, filters: ReportFilters = {}) {
  const branch = await branchFilter(filters);
  const [banks, mappings, assetCategories, chart] = await Promise.all([
    prisma.bankAccount.findMany(), prisma.accountingMapping.findMany(), prisma.assetCategory.findMany(), prisma.account.findMany(),
  ]);
  const cashIds = new Set([...banks.map(row => row.ledgerAccountId), ...mappings.filter(row => ["CASH", "CASH_ON_HAND", "CASH_EQUIVALENTS", "BANK"].includes(row.key)).map(row => row.accountId)]);
  const chartById = new Map(chart.map(row => [row.id, row]));
  const chartByCode = new Map(chart.map(row => [row.code, row]));
  const cashCodes = chart.filter(row => cashIds.has(row.id)).map(row => row.code);
  const investingIds = new Set(assetCategories.flatMap(row => row.assetAccountId ? [row.assetAccountId] : []));
  const operatingKeys = new Set(["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "VAT_PAYABLE", "INPUT_VAT", "VAT_SETTLEMENT", "VAT_RECEIVABLE", "INVENTORY_PURCHASES", "INVENTORY_ASSET", "EMPLOYEE_ADVANCES", "SALARIES_PAYABLE"]);
  type Category = "OPERATING" | "INVESTING" | "FINANCING" | "UNCLASSIFIED" | "EXCHANGE" | "OPENING";
  const classify = (id: number | null, type: string | undefined): Category => {
    const visited = new Set<number>(); let current = id;
    while (current && !visited.has(current)) {
      visited.add(current);
      const keys = mappings.filter(mapping => mapping.accountId === current).map(mapping => mapping.key);
      if (keys.some(key => ["UNREALIZED_FX_GAIN", "UNREALIZED_FX_LOSS"].includes(key))) return "EXCHANGE";
      if (investingIds.has(current) || keys.some(key => ["FIXED_ASSETS", "INVESTMENTS"].includes(key))) return "INVESTING";
      if (keys.some(key => ["LOANS_PAYABLE", "BORROWINGS", "DIVIDENDS_PAYABLE", "SHARE_CAPITAL"].includes(key))) return "FINANCING";
      if (keys.some(key => operatingKeys.has(key))) return "OPERATING";
      current = chartById.get(current)?.parentId ?? null;
    }
    if (type === "EQUITY") return "FINANCING";
    if (type === "REVENUE" || type === "EXPENSE") return "OPERATING";
    return "UNCLASSIFIED";
  };
  // Use functional-currency posted ledger balances. Bank registers can contain
  // mixed currencies, and transfers between our own banks are not cash flows.
  const entries = await prisma.journalEntry.findMany({ where: { ...branch, status: postedLedgerStatus, ...(to ? { entryDate: { lte: to } } : {}), lines: { some: { OR: [{ accountId: { in: [...cashIds] } }, { accountId: null, accountCode: { in: cashCodes } }] } } },
    include: { lines: { include: { account: true } } }, orderBy: [{ entryDate: "asc" }, { id: "asc" }] });
  let opening = new Prisma.Decimal(0), closing = new Prisma.Decimal(0);
  const rows: Array<{ id: string; transactionDate: Date; entryNumber: string; referenceNumber: string | null; description: string | null; category: Category; amountIn: number; amountOut: number; balanceAfter: number; sourceUrl: string; accountName: string }> = [];
  for (const entry of entries) {
    const isCash = (line: typeof entry.lines[number]) => cashIds.has(line.accountId ?? chartByCode.get(line.accountCode)?.id ?? -1);
    const cashLines = entry.lines.filter(isCash);
    const net = cashLines.reduce((sum, line) => sum.plus(line.debit).minus(line.credit), new Prisma.Decimal(0));
    closing = closing.plus(net);
    if (from && entry.entryDate < from) { opening = opening.plus(net); continue; }
    if (net.isZero()) continue;
    const counterLines = entry.lines.filter(line => !isCash(line));
    const offsets = counterLines.map(line => ({ line, amount: line.credit.minus(line.debit) })).filter(row => !row.amount.isZero());
    const isOpening = entry.referenceType === "BANK_OPENING_BALANCE" || entry.referenceType?.startsWith("OPENING_BALANCE");
    const simpleSplit = offsets.every(row => row.amount.isPositive() === net.isPositive()) && offsets.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0)).equals(net);
    const parts = isOpening ? [{ amount: net, category: "OPENING" as Category, accountName: "أرصدة افتتاحية مسجلة في الفترة" }]
      : entry.referenceType?.startsWith("FX_REVALUATION") ? [{ amount: net, category: "EXCHANGE" as Category, accountName: "أثر فروق الصرف على النقد" }]
      : simpleSplit ? offsets.map(({ line, amount }) => { const account = line.account ?? chartByCode.get(line.accountCode); return { amount, category: classify(account?.id ?? null, account?.accountType), accountName: account?.nameAr ?? line.accountName }; })
      : [{ amount: net, category: "UNCLASSIFIED" as Category, accountName: "قيد مركّب يحتاج تصنيف التدفق" }];
    for (const [index, part] of parts.entries()) rows.push({ id: `${entry.id}-${index}`, transactionDate: entry.entryDate, entryNumber: entry.entryNumber, referenceNumber: entry.referenceNumber,
      description: entry.description, category: part.category, accountName: part.accountName, amountIn: Prisma.Decimal.max(part.amount, 0).toNumber(), amountOut: Prisma.Decimal.max(part.amount.negated(), 0).toNumber(), balanceAfter: closing.toNumber(), sourceUrl: `/accounting?tab=journals&journalId=${entry.id}` });
  }
  const categoryNet = (category: Category) => sumMoney(rows.filter(row => row.category === category).flatMap(row => [row.amountIn, -row.amountOut]));
  const flowRows = rows.filter(row => row.category !== "OPENING" && row.category !== "EXCHANGE");
  const inflow = sumMoney(flowRows.map(row => row.amountIn)), outflow = sumMoney(flowRows.map(row => row.amountOut)), net = sumMoney([inflow, -outflow]);
  const openingAdjustments = categoryNet("OPENING"), exchangeDifferences = categoryNet("EXCHANGE");
  return { method: "DIRECT", rows, cashAccountCount: cashIds.size, classificationComplete: !rows.some(row => row.category === "UNCLASSIFIED"), unassignedEntryCount: entries.filter(entry => entry.branchId == null).length,
    totals: { inflow, outflow, net, operating: categoryNet("OPERATING"), investing: categoryNet("INVESTING"), financing: categoryNet("FINANCING"), unclassified: categoryNet("UNCLASSIFIED"),
      openingCash: opening.toNumber(), openingAdjustments, exchangeDifferences, closingCash: closing.toNumber(), reconciliationDifference: sumMoney([closing.toNumber(), -opening.toNumber(), -net, -openingAdjustments, -exchangeDifferences]) } };
}

export async function vatReport(from?: Date, to?: Date, filters: ReportFilters = {}) {
  const branch = await branchFilter(filters);
  const lines = await prisma.journalEntryLine.findMany({ where: { journalEntry: { ...branch, status: postedLedgerStatus, ...(from || to ? { entryDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}) }, account: { mappings: { some: { key: { in: ["VAT_PAYABLE", "INPUT_VAT"] } } } } }, include: { account: { include: { mappings: true } }, journalEntry: true } });
  let outputVat = new Prisma.Decimal(0), inputVat = new Prisma.Decimal(0);
  for (const line of lines) {
    const key = line.account?.mappings.find((row) => row.key === "VAT_PAYABLE" || row.key === "INPUT_VAT")?.key;
    if (key === "VAT_PAYABLE") outputVat = outputVat.plus(line.credit).minus(line.debit);
    if (key === "INPUT_VAT") inputVat = inputVat.plus(line.debit).minus(line.credit);
  }
  return { outputVat: outputVat.toNumber(), inputVat: inputVat.toNumber(), netVatDue: outputVat.minus(inputVat).toNumber(), lines: lines.map((line) => ({ date: line.journalEntry.entryDate, entryNumber: line.journalEntry.entryNumber, accountName: line.accountName, debit: decimal(line.debit), credit: decimal(line.credit) })) };
}
