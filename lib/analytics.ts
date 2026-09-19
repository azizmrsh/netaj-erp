import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

type Tx = Prisma.TransactionClient;
type Range = { from: Date; to: Date };
const n = (value: unknown) => Number(value ?? 0);
const day = (value: Date) => value.toISOString().slice(0, 10);
const monthKey = (value: Date) => value.toISOString().slice(0, 7);
const clean = (value: unknown) => String(value ?? "").trim();

export class AnalyticsError extends Error {
  constructor(message: string) { super(message); this.name = "AnalyticsError"; }
}

export function analyticsRange(params: URLSearchParams): Range {
  const now = new Date();
  const from = params.get("from") ? new Date(`${params.get("from")}T00:00:00.000Z`) : new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59.999Z`) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) throw new AnalyticsError("الفترة الزمنية غير صحيحة");
  return { from, to };
}

const dateWhere = ({ from, to }: Range) => ({ gte: from, lte: to });
const active = { notIn: ["CANCELLED", "REVERSED"] };

async function ledgerProfit(tx: Tx, range: Range) {
  const lines = await tx.journalEntryLine.findMany({
    where: { journalEntry: { status: "POSTED", entryDate: dateWhere(range) }, account: { accountType: { in: ["REVENUE", "EXPENSE"] } } },
    include: { account: true, journalEntry: { select: { id: true, entryNumber: true, entryDate: true, referenceType: true, referenceId: true } } },
  });
  const revenue = lines.filter((row) => row.account?.accountType === "REVENUE").reduce((sum, row) => sum + n(row.credit) - n(row.debit), 0);
  const expenses = lines.filter((row) => row.account?.accountType === "EXPENSE").reduce((sum, row) => sum + n(row.debit) - n(row.credit), 0);
  return { revenue, expenses, netProfit: revenue - expenses, lines };
}

async function materialProfitability(tx: Tx, range: Range, itemIds: number[] = []) {
  const itemFilter = itemIds.length ? { itemId: { in: itemIds } } : {};
  const [items, sales, purchases, movements, linkedCosts, fuel] = await Promise.all([
    tx.item.findMany({ where: { isActive: true, ...(itemIds.length ? { id: { in: itemIds } } : {}) }, include: { unit: true }, orderBy: { nameAr: "asc" } }),
    tx.saleItem.findMany({ where: { ...itemFilter, sale: { status: active, invoiceDate: dateWhere(range) } }, include: { sale: { select: { id: true, invoiceNumber: true, invoiceDate: true } } } }),
    tx.purchaseItem.findMany({ where: { ...itemFilter, purchase: { status: active, purchaseDate: dateWhere(range) } }, include: { purchase: { select: { id: true, purchaseNumber: true, purchaseDate: true } } } }),
    tx.stockMovement.findMany({ where: { ...itemFilter, movementDate: dateWhere(range) }, orderBy: [{ movementDate: "asc" }, { id: "asc" }] }),
    tx.externalLinkedCost.findMany({ where: { ...itemFilter, costDate: dateWhere(range) } }),
    tx.factoryFuelMovement.findMany({ where: { productionItemId: itemIds.length ? { in: itemIds } : { not: null }, movementDate: dateWhere(range), quantityOut: { gt: 0 } } }),
  ]);
  return items.map((item) => {
    const itemSales = sales.filter((row) => row.itemId === item.id), itemPurchases = purchases.filter((row) => row.itemId === item.id);
    const itemMovements = movements.filter((row) => row.itemId === item.id), company = itemMovements.filter((row) => row.ownershipType === "COMPANY");
    const quantitySold = itemSales.reduce((sum, row) => sum + n(row.quantity), 0);
    const revenueExVat = itemSales.reduce((sum, row) => sum + n(row.quantity) * n(row.unitPrice) - n(row.discount), 0);
    const revenueWithVat = itemSales.reduce((sum, row) => sum + n(row.totalAmount), 0);
    const purchasesValue = itemPurchases.reduce((sum, row) => sum + n(row.quantity) * n(row.unitPrice) - n(row.discount), 0);
    const purchasesQty = itemPurchases.reduce((sum, row) => sum + n(row.quantity), 0);
    const cogs = company.filter((row) => n(row.quantityOut) > 0).reduce((sum, row) => sum + n(row.totalValue), 0);
    const customerTransfers = itemMovements.filter((row) => row.ownershipType === "PARTY" && row.movementType.includes("TRANSFER")).reduce((sum, row) => sum + n(row.quantityIn) - n(row.quantityOut), 0);
    const carriageInward = linkedCosts.filter((row) => row.itemId === item.id && row.costType === "TRANSPORT").reduce((sum, row) => sum + n(row.amount), 0);
    const productionExpenses = fuel.filter((row) => row.productionItemId === item.id).reduce((sum, row) => sum + n(row.totalValue), 0);
    const last = company.at(-1), closingQty = last ? n(last.balanceAfter) : 0, closingValue = closingQty * n(last?.unitCost);
    const first = company[0], openingQty = first ? n(first.balanceAfter) - n(first.quantityIn) + n(first.quantityOut) : 0, openingValue = openingQty * n(first?.unitCost);
    const grossProfit = revenueExVat - cogs, expenses = carriageInward + productionExpenses, netProfit = grossProfit - expenses;
    return { itemId: item.id, itemCode: item.code, itemName: item.nameAr, unit: item.unit.nameAr, revenueExVat, revenueWithVat, cogs, openingQty, openingValue, customerTransfers, purchasesQty, purchasesValue, carriageInward, closingQty, closingValue, grossProfit, expenses, netProfit, tons: quantitySold, profitPerTon: quantitySold ? netProfit / quantitySold : 0,
      source: { sales: itemSales.map((row) => ({ id: row.sale.id, number: row.sale.invoiceNumber, date: row.sale.invoiceDate, href: `/sales?invoiceId=${row.sale.id}` })), movements: itemMovements.map((row) => ({ id: row.id, number: row.movementNumber, date: row.movementDate, href: `/inventory?movementId=${row.id}` })) } };
  });
}

async function factoryProfitability(tx: Tx, range: Range) {
  const periodPairs = monthsBetween(range).map((key) => ({ payrollRun: { year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)), status: "POSTED" }, employee: { costCenter: "FACTORY" } }));
  const [production, expenses, fuel, targets, payroll] = await Promise.all([
    tx.factoryTransaction.findMany({ where: { status: "POSTED", transactionDate: dateWhere(range) }, include: { party: true, item: true } }),
    tx.expense.findMany({ where: { status: "POSTED", costCenter: "FACTORY", expenseDate: dateWhere(range) } }),
    tx.factoryFuelMovement.findMany({ where: { movementDate: dateWhere(range), quantityOut: { gt: 0 } } }),
    tx.factoryProductionTarget.findMany({ where: { OR: Array.from(new Set(monthsBetween(range))).map((key) => ({ year: Number(key.slice(0, 4)), month: Number(key.slice(5, 7)) })) }, include: { item: true } }),
    periodPairs.length ? tx.payrollLine.findMany({ where: { OR: periodPairs } }) : [],
  ]);
  const revenue = production.reduce((sum, row) => sum + n(row.manufacturingFeeTotal), 0), tons = production.reduce((sum, row) => sum + n(row.quantity), 0);
  const operatingExpenses = expenses.reduce((sum, row) => sum + n(row.amountBeforeVat), 0), fuelCost = fuel.reduce((sum, row) => sum + n(row.totalValue), 0), labourCost = payroll.reduce((sum, row) => sum + n(row.grossSalary), 0), totalCost = operatingExpenses + fuelCost + labourCost, netProfit = revenue - totalCost;
  return { revenue, operatingExpenses, fuelCost, labourCost, totalCost, netProfit, tons, costPerTon: tons ? totalCost / tons : 0, profitPerTon: tons ? netProfit / tons : 0, targetTons: targets.reduce((sum, row) => sum + n(row.targetTons), 0), transactions: production, targets };
}

async function transportProfitability(tx: Tx, range: Range) {
  const trips = await tx.transportTrip.findMany({ where: { tripDate: dateWhere(range) }, include: { party: true, item: true, truck: true, driver: true, note: true, expenses: true }, orderBy: { tripDate: "desc" } });
  const revenue = trips.reduce((sum, row) => sum + n(row.transportRevenue), 0), cost = trips.reduce((sum, row) => sum + n(row.totalCost), 0), tons = trips.reduce((sum, row) => sum + n(row.weight ?? row.quantity), 0), km = trips.reduce((sum, row) => sum + n(row.actualKm ?? row.estimatedKm), 0);
  return { revenue, cost, netProfit: revenue - cost, tons, km, profitPerTon: tons ? (revenue - cost) / tons : 0, profitPerKm: km ? (revenue - cost) / km : 0, trips };
}

function monthsBetween(range: Range) { const rows: string[] = [], cursor = new Date(Date.UTC(range.from.getUTCFullYear(), range.from.getUTCMonth(), 1)); while (cursor <= range.to) { rows.push(monthKey(cursor)); cursor.setUTCMonth(cursor.getUTCMonth() + 1); } return rows; }
function pct(current: number, previous: number) { return previous ? (current - previous) / Math.abs(previous) * 100 : current ? 100 : 0; }

async function monthlyComparison(tx: Tx, range: Range) {
  const start = new Date(range.from); start.setFullYear(start.getFullYear() - 1);
  const [sales, saleItems, purchases, journals, factory, transport] = await Promise.all([
    tx.sale.findMany({ where: { status: active, invoiceDate: { gte: start, lte: range.to } } }),
    tx.saleItem.findMany({ where: { sale: { status: active, invoiceDate: { gte: start, lte: range.to } } }, include: { sale: true, item: true } }),
    tx.purchase.findMany({ where: { status: active, purchaseDate: { gte: start, lte: range.to } } }),
    tx.journalEntry.findMany({ where: { status: "POSTED", entryDate: { gte: start, lte: range.to } }, include: { lines: { include: { account: true } } } }),
    tx.factoryTransaction.findMany({ where: { status: "POSTED", transactionDate: { gte: start, lte: range.to } }, include: { item: true } }),
    tx.transportTrip.findMany({ where: { tripDate: { gte: start, lte: range.to } } }),
  ]);
  const keys = monthsBetween(range), values = new Map<string, { sales: number; purchases: number; revenue: number; expenses: number; factory: number; transport: number;mb:number;oil:number;asphalt:number }>();
  const row = (key: string) => values.get(key) ?? { sales: 0, purchases: 0, revenue: 0, expenses: 0, factory: 0, transport: 0, mb:0, oil:0, asphalt:0 };
  for (const sale of sales) { const key = monthKey(sale.invoiceDate), value = row(key); value.sales += n(sale.functionalTotalAmount || sale.totalAmount); values.set(key, value); }
  for (const line of saleItems) { const key=monthKey(line.sale.invoiceDate),value=row(key),name=`${line.item.code} ${line.item.nameAr} ${line.item.nameEn??""}`.toUpperCase(),amount=n(line.quantity)*n(line.unitPrice)-n(line.discount);if(/OIL|LCO|زيت/.test(name))value.oil+=amount;else if(/MB|NETAPAVE/.test(name))value.mb+=amount;else if(/ASPHALT|اسفلت|أسفلت/.test(name))value.asphalt+=amount;values.set(key,value); }
  for (const purchase of purchases) { const key = monthKey(purchase.purchaseDate), value = row(key); value.purchases += n(purchase.functionalTotalAmount || purchase.totalAmount); values.set(key, value); }
  for (const journal of journals) { const key = monthKey(journal.entryDate), value = row(key); for (const line of journal.lines) { if (line.account?.accountType === "REVENUE") value.revenue += n(line.credit) - n(line.debit); if (line.account?.accountType === "EXPENSE") value.expenses += n(line.debit) - n(line.credit); } values.set(key, value); }
  for (const entry of factory) { const key = monthKey(entry.transactionDate), value = row(key),amount=n(entry.manufacturingFeeTotal),name=`${entry.item?.code??""} ${entry.item?.nameAr??""} ${entry.item?.nameEn??""}`.toUpperCase(); value.factory += amount;if(/MB|NETAPAVE/.test(name))value.mb+=amount; values.set(key, value); }
  for (const trip of transport) { const key = monthKey(trip.tripDate), value = row(key); value.transport += n(trip.netProfit); values.set(key, value); }
  const annualAverage = keys.length ? keys.reduce((sum, key) => sum + row(key).revenue - row(key).expenses, 0) / keys.length : 0;
  return keys.map((key, index) => { const current = row(key), prior = row(`${Number(key.slice(0, 4)) - 1}-${key.slice(5)}`), previous = index ? row(keys[index - 1]) : row(""); const netProfit = current.revenue - current.expenses; return { month: key, ...current, netProfit, allSectors:netProfit, momPercent: pct(netProfit, previous.revenue - previous.expenses), yoyPercent: pct(netProfit, prior.revenue - prior.expenses), annualAverage }; });
}

async function customerActivity(tx: Tx, range: Range, inactiveDays: number) {
  const parties = await tx.party.findMany({ where: { isActive: true, isCustomer: true }, select: { id: true, nameAr: true, createdAt: true } });
  const startPrevious = new Date(range.from.getTime() - (range.to.getTime() - range.from.getTime()) - 86_400_000);
  const movements = await tx.stockMovement.findMany({ where: { ownershipType: "PARTY", partyId: { not: null }, movementDate: { gte: startPrevious, lte: range.to } }, include: { item: true }, orderBy: { movementDate: "desc" } });
  const cutoff = new Date(range.to.getTime() - inactiveDays * 86_400_000);
  return parties.map((party) => { const rows = movements.filter((movement) => movement.partyId === party.id), current = rows.filter((movement) => movement.movementDate >= range.from), previous = rows.filter((movement) => movement.movementDate < range.from); const withdrawals = current.reduce((sum, row) => sum + n(row.quantityOut), 0), value = current.reduce((sum, row) => sum + (n(row.quantityOut) || n(row.quantityIn)) * n(row.unitCost), 0), previousWithdrawals = previous.reduce((sum, row) => sum + n(row.quantityOut), 0), lastActivity = rows[0]?.movementDate ?? null, isNew = party.createdAt >= range.from && party.createdAt <= range.to, stopped = previousWithdrawals > 0 && withdrawals === 0, declining = withdrawals > 0 && previousWithdrawals > 0 && withdrawals < previousWithdrawals; return { partyId: party.id, partyName: party.nameAr, withdrawals, value, previousWithdrawals, changePercent: pct(withdrawals, previousWithdrawals), lastActivity, inactive: !lastActivity || lastActivity < cutoff, inactiveDays: lastActivity ? Math.floor((range.to.getTime() - lastActivity.getTime()) / 86_400_000) : null, declining, stopped, isNew, href: `/parties/${party.id}` }; }).sort((a, b) => b.withdrawals - a.withdrawals);
}

export async function loadExecutiveDashboard(tx: Tx, range: Range, enabledModules: Set<string>, inactiveDays = 60) {
  const [sales, purchases, ledger, banks, stocks, factory, transport, monthly, customers, vatReturns, projectLines] = await Promise.all([
    enabledModules.has("SALES") ? tx.sale.findMany({ where: { status: active, invoiceDate: dateWhere(range) }, include: { allocations: true, creditDebitNotes: { where: { status: "POSTED" } } } }) : [],
    enabledModules.has("PURCHASES") ? tx.purchase.findMany({ where: { status: active, purchaseDate: dateWhere(range) }, include: { allocations: true, creditDebitNotes: { where: { status: "POSTED" } } } }) : [],
    enabledModules.has("ACCOUNTING") ? ledgerProfit(tx, range) : { revenue: 0, expenses: 0, netProfit: 0, lines: [] },
    enabledModules.has("ACCOUNTING") ? tx.bankAccount.findMany({ where: { isActive: true } }) : [],
    enabledModules.has("INVENTORY") ? tx.companyStock.findMany({ include: { item: true } }) : [],
    enabledModules.has("FACTORY") ? factoryProfitability(tx, range) : null,
    enabledModules.has("TRANSPORT") ? transportProfitability(tx, range) : null,
    enabledModules.has("ACCOUNTING") ? monthlyComparison(tx, range) : [], enabledModules.has("INVENTORY") ? customerActivity(tx, range, inactiveDays) : [],
    enabledModules.has("ACCOUNTING") ? tx.vatReturn.findMany({where:{periodEnd:dateWhere(range),status:{not:"CANCELLED"}},select:{netVatDue:true}}) : [],
    enabledModules.has("PROJECTS") ? tx.journalEntryLine.findMany({where:{projectCode:{not:null},journalEntry:{status:"POSTED",entryDate:dateWhere(range)}},include:{account:true}}) : [],
  ]);
  const salesTotal = sales.reduce((sum, row) => sum + n(row.functionalTotalAmount || row.totalAmount), 0), purchaseTotal = purchases.reduce((sum, row) => sum + n(row.functionalTotalAmount || row.totalAmount), 0);
  const ar = sales.reduce((sum, row) => sum + n(row.functionalTotalAmount || row.totalAmount) - row.allocations.reduce((s, a) => s + n(a.functionalAmount || a.amount), 0) - row.creditDebitNotes.reduce((s, note) => s + (note.noteType === "CREDIT_NOTE" ? n(note.functionalTotalAmount || note.totalAmount) : -n(note.functionalTotalAmount || note.totalAmount)), 0), 0);
  const ap = purchases.reduce((sum, row) => sum + n(row.functionalTotalAmount || row.totalAmount) - row.allocations.reduce((s, a) => s + n(a.functionalAmount || a.amount), 0) + row.creditDebitNotes.reduce((s, note) => s + (note.noteType === "DEBIT_NOTE" ? n(note.functionalTotalAmount || note.totalAmount) : -n(note.functionalTotalAmount || note.totalAmount)), 0), 0);
  const cashFlow = enabledModules.has("ACCOUNTING") ? await tx.bankTransaction.aggregate({ where: { transactionDate: dateWhere(range) }, _sum: { functionalAmountIn: true, functionalAmountOut: true } }) : null;
  const projectProfit=projectLines.reduce((sum,row)=>sum+(row.account?.accountType==="REVENUE"?n(row.credit)-n(row.debit):row.account?.accountType==="EXPENSE"?n(row.credit)-n(row.debit):0),0);
  const [recentSales,recentPurchases,recentVouchers,recentTrips,recentMovements,recentJournals,pendingApprovals,failedJobs,migrationWarnings,openControlAlerts] = await Promise.all([
    enabledModules.has("SALES") ? tx.sale.findMany({ where:{invoiceDate:dateWhere(range),status:active},include:{party:true},orderBy:{invoiceDate:"desc"},take:5 }) : [],
    enabledModules.has("PURCHASES") ? tx.purchase.findMany({ where:{purchaseDate:dateWhere(range),status:active},include:{party:true},orderBy:{purchaseDate:"desc"},take:5 }) : [],
    enabledModules.has("ACCOUNTING") ? tx.financialVoucher.findMany({ where:{voucherDate:dateWhere(range),status:{notIn:["CANCELLED","REVERSED"]}},include:{party:true},orderBy:{voucherDate:"desc"},take:5 }) : [],
    enabledModules.has("TRANSPORT") ? tx.transportTrip.findMany({ where:{tripDate:dateWhere(range)},include:{party:true},orderBy:{tripDate:"desc"},take:5 }) : [],
    enabledModules.has("INVENTORY") ? tx.stockMovement.findMany({ where:{movementDate:dateWhere(range)},include:{item:true,party:true},orderBy:[{movementDate:"desc"},{id:"desc"}],take:5 }) : [],
    enabledModules.has("ACCOUNTING") ? tx.journalEntry.findMany({ where:{entryDate:dateWhere(range),status:"POSTED"},orderBy:{entryDate:"desc"},take:5 }) : [],
    enabledModules.has("APPROVALS") ? tx.unifiedApprovalRequest.count({where:{status:"PENDING"}}) : 0,
    tx.backgroundJob.count({where:{status:{in:["FAILED","DEAD"]}}}),
    enabledModules.has("IMPORT") ? tx.importBatch.count({where:{status:{in:["FAILED","MISMATCH","WARNING"]}}}) : 0,
    tx.controlAlert.count({where:{status:"OPEN"}}),
  ]);
  const latestTransactions = [
    ...recentSales.map(row=>({key:`sale-${row.id}`,type:"فاتورة مبيعات",document:row.invoiceNumber,party:row.party.nameAr,amount:n(row.functionalTotalAmount||row.totalAmount),status:row.status,date:row.invoiceDate,href:`/sales?id=${row.id}`})),
    ...recentPurchases.map(row=>({key:`purchase-${row.id}`,type:"فاتورة مشتريات",document:row.purchaseNumber,party:row.party.nameAr,amount:n(row.functionalTotalAmount||row.totalAmount),status:row.status,date:row.purchaseDate,href:`/purchases?id=${row.id}`})),
    ...recentVouchers.map(row=>({key:`voucher-${row.id}`,type:row.voucherType==="RECEIPT"?"سند قبض":"سند صرف",document:row.voucherNumber,party:row.party?.nameAr??"—",amount:n(row.functionalAmount||row.amount),status:row.status,date:row.voucherDate,href:`/accounting?tab=vouchers&id=${row.id}`})),
    ...recentTrips.map(row=>({key:`trip-${row.id}`,type:"رحلة نقل",document:row.tripNumber,party:row.party?.nameAr??"—",amount:n(row.transportRevenue),status:row.status,date:row.tripDate,href:`/transport?tripId=${row.id}`})),
    ...recentMovements.map(row=>({key:`stock-${row.id}`,type:"حركة مخزون",document:row.movementNumber,party:row.party?.nameAr??row.item.nameAr,amount:n(row.quantityIn)||n(row.quantityOut),unit:"كمية",status:row.movementType,date:row.movementDate,href:`/inventory?movementId=${row.id}`})),
    ...recentJournals.map(row=>({key:`journal-${row.id}`,type:"قيد يومية",document:row.entryNumber,party:row.description??"—",amount:n(row.totalDebit),status:row.status,date:row.entryDate,href:`/accounting?tab=journal&id=${row.id}`})),
  ].sort((a,b)=>b.date.getTime()-a.date.getTime()).slice(0,8).map(row=>({...row,date:row.date.toISOString()}));
  return { range: { from: day(range.from), to: day(range.to) }, kpis: { sales: salesTotal, purchases: purchaseTotal, netProfit: ledger.netProfit, liquidity: banks.reduce((sum, row) => sum + n(row.currentBalance), 0), inventory: stocks.reduce((sum, row) => sum + n(row.quantity) * n(row.averageCost), 0), ar, ap, cashFlow: n(cashFlow?._sum.functionalAmountIn) - n(cashFlow?._sum.functionalAmountOut), activeCustomers:customers.filter(row=>!row.inactive).length, vat:vatReturns.reduce((sum,row)=>sum+n(row.netVatDue),0), projectProfit }, factory, transport, monthly, materials: enabledModules.has("ACCOUNTING") ? await materialProfitability(tx, range) : [], customerActivity: customers, latestTransactions, alerts: { negativeCustomerStocks: enabledModules.has("INVENTORY") ? await tx.partyStockAccount.count({ where: { quantity: { lt: 0 } } }) : 0, inactiveCustomers: customers.filter((row) => row.inactive).length, decliningCustomers: customers.filter((row) => row.declining).length, stoppedCustomers: customers.filter((row) => row.stopped).length, newCustomers: customers.filter((row) => row.isNew).length, overdueReceivables: sales.filter((row) => row.dueDate && row.dueDate < range.to).length, openTrips: transport?.trips.filter((row) => row.status === "OPEN").length ?? 0, pendingApprovals, failedJobs, migrationWarnings, openControlAlerts } };
}

export async function loadLegacyReport(tx: Tx, report: string, range: Range, params: URLSearchParams) {
  const itemIds = (params.get("itemIds") ?? "").split(",").map(Number).filter((id) => id > 0), partyId = Number(params.get("partyId")), driverId = Number(params.get("driverId"));
  if (report === "material-profitability") return { rows: await materialProfitability(tx, range, itemIds) };
  if (report === "monthly-comparison") return { rows: await monthlyComparison(tx, range) };
  if (report === "customer-activity") return { rows: await customerActivity(tx, range, Math.min(Math.max(Number(params.get("inactiveDays")) || 60, 1), 3650)) };
  if (report === "customer-raw-balances") return { rows: (await tx.partyStockAccount.findMany({ where: { ...(partyId > 0 ? { partyId } : {}), ...(itemIds.length ? { itemId: { in: itemIds } } : {}) }, include: { party: true, item: { include: { unit: true } } } })).map((row) => ({ partyId: row.partyId, party: row.party.nameAr, item: row.item.nameAr, unit: row.item.unit.nameAr, quantity: n(row.quantity), averageValue: n(row.averageValue), value: n(row.quantity) * n(row.averageValue), side: n(row.quantity) >= 0 ? "له" : "عليه", href: `/parties/${row.partyId}?tab=inventory` })) };
  if (report === "daily-production") {
    const [factory, material, readings] = await Promise.all([factoryProfitability(tx, range), materialProfitability(tx, range, itemIds), tx.equipmentReading.findMany({ where: { readingDate: dateWhere(range), assetType: "TANK" }, orderBy: { readingDate: "asc" } })]);
    const materialIn = material.reduce((sum, row) => sum + row.purchasesQty, 0), materialOut = material.reduce((sum, row) => sum + row.tons, 0), targetVariance = factory.tons - factory.targetTons;
    return { summary: { materialIn, materialOut, revenue: factory.revenue, alSolahShare: null, productionExpenses: factory.totalCost, materialsConsumed: materialOut, overheads: factory.operatingExpenses, labour: factory.labourCost, netProfitMb: factory.netProfit, productionTons: factory.tons, profitLossPerTon: factory.profitPerTon, monthlyTargetTons: factory.targetTons, monthlyTargetVariance: targetVariance }, rows: factory.transactions.map((row) => ({ date: day(row.transactionDate), number: row.transactionNumber, customer: row.party?.nameAr, material: row.item?.nameAr, tons: n(row.quantity), revenue: n(row.manufacturingFeeTotal), href: `/factory?transactionId=${row.id}` })), oil: readings };
  }
  if (report === "reconciliation") {
    const [banks, stocks, customerStocks, sales, purchases, vat, mappings, uninvoiced] = await Promise.all([
      tx.bankAccount.findMany({ include: { ledgerAccount: true } }), tx.companyStock.findMany(), tx.partyStockAccount.findMany(),
      tx.sale.findMany({ where: { status: active }, include: { allocations: true } }), tx.purchase.findMany({ where: { status: active }, include: { allocations: true } }),
      tx.vatReturn.findMany({ where: { periodStart: { lte: range.to }, periodEnd: { gte: range.from } }, orderBy: { periodEnd: "desc" } }),
      tx.accountingMapping.findMany({ where: { key: { in: ["ACCOUNTS_RECEIVABLE", "ACCOUNTS_PAYABLE", "INVENTORY_ASSET", "VAT_PAYABLE", "INPUT_VAT"] } } }),
      tx.deliveryReceiptNote.findMany({ where: { status: "POSTED", noteDate: dateWhere(range), noteType: "DELIVERY", salesInvoices: { none: {} } }, include: { items: true } }),
    ]);
    const mapping = new Map(mappings.map((row) => [row.key, row.accountId])), accountIds = [...new Set([...banks.map((row) => row.ledgerAccountId), ...mappings.map((row) => row.accountId)])];
    const ledgerLines = await tx.journalEntryLine.findMany({ where: { accountId: { in: accountIds }, journalEntry: { status: "POSTED", entryDate: { lte: range.to } } } });
    const balance = (accountId: number | undefined, creditNormal = false) => ledgerLines.filter((row) => row.accountId === accountId).reduce((sum, row) => sum + (creditNormal ? n(row.credit) - n(row.debit) : n(row.debit) - n(row.credit)), 0);
    const ar = sales.reduce((sum, row) => sum + n(row.functionalTotalAmount || row.totalAmount) - row.allocations.reduce((s, a) => s + n(a.functionalAmount || a.amount), 0), 0), ap = purchases.reduce((sum, row) => sum + n(row.functionalTotalAmount || row.totalAmount) - row.allocations.reduce((s, a) => s + n(a.functionalAmount || a.amount), 0), 0), inventory = stocks.reduce((sum, row) => sum + n(row.quantity) * n(row.averageCost), 0), bankOperational = banks.reduce((s, b) => s + n(b.currentBalance), 0), bankLedger = banks.reduce((s, b) => s + balance(b.ledgerAccountId), 0), arLedger = balance(mapping.get("ACCOUNTS_RECEIVABLE")), apLedger = balance(mapping.get("ACCOUNTS_PAYABLE"), true), inventoryLedger = balance(mapping.get("INVENTORY_ASSET")), vatOperational = vat.reduce((s, v) => s + n(v.netVatDue), 0), vatLedger = balance(mapping.get("VAT_PAYABLE"), true) - balance(mapping.get("INPUT_VAT")), customerOwned = customerStocks.reduce((sum, row) => sum + n(row.quantity) * n(row.averageValue), 0), uninvoicedQuantity = uninvoiced.flatMap((row) => row.items).reduce((sum, row) => sum + n(row.quantity), 0), sarNet = ar - ap;
    const make = (area: string, operational: number, ledger: number, href: string, note?: string) => ({ area, operational, ledger, difference: operational - ledger, note, href });
    return { rows: [make("Bank ↔ GL", bankOperational, bankLedger, "/accounting?tab=reconciliation"), make("AR ↔ GL", ar, arLedger, "/accounting?tab=reports&report=ar-aging"), make("AP ↔ GL", ap, apLedger, "/accounting?tab=reports&report=ap-aging"), make("Inventory ↔ GL", inventory, inventoryLedger, "/inventory"), make("VAT ↔ GL/Documents", vatOperational, vatLedger, "/accounting?tab=vat"), make("Customer Program Balance", customerOwned, customerOwned, "/inventory", "Customer-owned stock quantity/value"), make("Transfers not invoiced", uninvoicedQuantity, 0, "/notes", "Physical quantity; no price is invented"), make("Customer-owned Bitumen", customerOwned, customerOwned, "/reports?report=customer-raw-balances"), make("SAR balance", sarNet, sarNet, "/accounting?tab=reports"), make("Net له/عليه", sarNet + customerOwned, sarNet + customerOwned, "/parties")], net: sarNet + customerOwned };
  }
  if (report === "payroll") return { rows: (await tx.payrollLine.findMany({ where: { payrollRun: { year: { gte: range.from.getFullYear(), lte: range.to.getFullYear() }, month: { gte: 1, lte: 12 } } }, include: { employee: true, payrollRun: true } })).map((row) => ({ payroll: row.payrollRun.payrollNumber, year: row.payrollRun.year, month: row.payrollRun.month, employee: row.employee.nameAr, basic: n(row.basicSalary), housing: n(row.housingAllowance), transport: n(row.transportAllowance), deductions: n(row.totalDeductions), overtime: n(row.overtimeValue), fridayHours: n(row.fridayHours), total: n(row.netSalary), iban: row.employee.iban, bank: row.employee.bankName })) };
  if (report === "driver-advances") {
    const drivers = await tx.driver.findMany({ where: { ...(driverId > 0 ? { id: driverId } : {}) }, include: { employee: { include: { advances: true } }, trips: { where: { tripDate: dateWhere(range) } } } });
    return { rows: drivers.map((driver) => { const advance = driver.employee?.advances.reduce((s, row) => s + n(row.amount), 0) ?? 0, recovered = driver.employee?.advances.reduce((s, row) => s + n(row.recoveredAmount), 0) ?? 0, tripFees = driver.trips.reduce((s, row) => s + n(row.driverTripFee), 0), paid = driver.trips.reduce((s, row) => s + n(row.driverPaidAmount), 0); return { driverId: driver.id, driver: driver.name, advance, tripFees, deductions: recovered, paid, remaining: advance + tripFees - recovered - paid, href: `/transport?driverId=${driver.id}` }; }) };
  }
  if (report === "driver-expenses") return { rows: (await tx.transportTrip.findMany({ where: { tripDate: dateWhere(range), ...(driverId > 0 ? { driverId } : {}) }, include: { driver: true, truck: true, expenses: true } })).flatMap((trip) => [{ date: day(trip.tripDate), trip: trip.tripNumber, driver: trip.driver?.name, vehicle: trip.truck?.plateNumber, type: "Trip calculated costs", amount: n(trip.totalCost), href: `/transport?tripId=${trip.id}` }, ...trip.expenses.map((expense) => ({ date: day(expense.expenseDate), trip: trip.tripNumber, driver: trip.driver?.name, vehicle: trip.truck?.plateNumber, type: expense.expenseType, amount: n(expense.amount), href: `/transport?tripId=${trip.id}` }))]) };
  if (report === "attendance") return { rows: (await tx.attendanceRecord.findMany({ where: { attendanceDate: dateWhere(range) }, include: { employee: true }, orderBy: { attendanceDate: "desc" } })).map((row) => ({ date: day(row.attendanceDate), employee: row.employee.nameAr, department: row.employee.department, status: row.status, workHours: n(row.workHours), overtimeHours: n(row.overtimeHours), fridayHours: n(row.fridayHours), checkIn: row.checkIn, checkOut: row.checkOut })) };
  if (report === "customer-vehicle") return { rows: (await tx.transportTrip.findMany({ where: { tripDate: dateWhere(range), ...(partyId > 0 ? { partyId } : {}) }, include: { party: true, truck: true, driver: true, note: true } })).map((row) => ({ date: day(row.tripDate), trip: row.tripNumber, customer: row.party?.nameAr, vehicle: row.truck?.plateNumber, driver: row.driver?.name, quantity: n(row.weight ?? row.quantity), revenue: n(row.transportRevenue), cost: n(row.totalCost), net: n(row.netProfit), note: row.note?.noteNumber, href: `/transport?tripId=${row.id}` })) };
  if (report === "equipment-readings") return { rows: (await tx.equipmentReading.findMany({ where: { readingDate: dateWhere(range) }, orderBy: [{ readingDate: "desc" }, { id: "desc" }] })).map((row) => ({ id: row.id, date: day(row.readingDate), assetType: row.assetType, assetName: row.assetName, readingType: row.readingType, unit: row.unit, opening: n(row.openingValue), used: n(row.usedValue), closing: n(row.closingValue), reading: n(row.readingValue), notes: row.notes })) };
  throw new AnalyticsError("التقرير غير مدعوم");
}

export async function createEquipmentReading(tx: Tx, input: Record<string, unknown>) {
  const readingDate = input.readingDate ? new Date(String(input.readingDate)) : new Date(), assetType = clean(input.assetType).toUpperCase(), assetName = clean(input.assetName), readingType = clean(input.readingType), unit = clean(input.unit);
  if (Number.isNaN(readingDate.getTime()) || !["TANK", "EQUIPMENT"].includes(assetType) || !assetName || !readingType || !unit) throw new AnalyticsError("بيانات القراءة الفيزيائية غير مكتملة");
  const decimal = (value: unknown) => value === "" || value == null ? null : new Prisma.Decimal(String(value));
  const row = await tx.equipmentReading.create({ data: { readingDate, assetType, assetName, readingType, unit, openingValue: decimal(input.openingValue), usedValue: decimal(input.usedValue), closingValue: decimal(input.closingValue), readingValue: decimal(input.readingValue), notes: clean(input.notes) || null } });
  await audit(tx, { action: "CREATE", entityType: "EQUIPMENT_READING", entityId: row.id, metadata: { assetType, assetName, readingType } }); return row;
}

export async function upsertFactoryTarget(tx: Tx, input: Record<string, unknown>) {
  const year = Number(input.year), month = Number(input.month), itemId = Number(input.itemId), targetTons = new Prisma.Decimal(String(input.targetTons ?? 0));
  if (!Number.isInteger(year) || year < 2000 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(itemId) || itemId <= 0 || targetTons.lt(0)) throw new AnalyticsError("بيانات هدف الإنتاج غير صحيحة");
  if (!await tx.item.findUnique({ where: { id: itemId } })) throw new AnalyticsError("المادة غير موجودة");
  const existing = await tx.factoryProductionTarget.findFirst({ where: { year, month, itemId } });
  const row = existing
    ? await tx.factoryProductionTarget.update({ where: { id: existing.id }, data: { targetTons, notes: clean(input.notes) || null }, include: { item: true } })
    : await tx.factoryProductionTarget.create({ data: { year, month, itemId, targetTons, notes: clean(input.notes) || null }, include: { item: true } });
  await audit(tx, { action: "UPSERT", entityType: "FACTORY_PRODUCTION_TARGET", entityId: row.id, metadata: { year, month, itemId, targetTons: String(targetTons) } }); return row;
}
