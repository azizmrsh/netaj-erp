import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

type Tx = Prisma.TransactionClient;
type AssistantContext = {
  userId: number;
  tenantId?: number;
  companyId?: number;
  permissions: Set<string>;
  enabledModules: Set<string>;
};

export class AssistantError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "ASSISTANT_ERROR") { super(message); }
}

const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => `${number(value).toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;

function monthRange(offset = 0) {
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset + 1, 1) - 1);
  return { from, to };
}

type DateRange = { from: Date; to: Date; label: string };
function resolvedRange(question: string, fallback = monthRange()): DateRange {
  const normalized = normalizedMention(question);
  const now = new Date();
  if (/(اليوم|today)/i.test(normalized)) { const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()); return { from, to: new Date(from.getTime() + 86_400_000 - 1), label: "اليوم / Today" }; }
  if (/(امس|yesterday)/i.test(normalized)) { const to = new Date(now.getFullYear(), now.getMonth(), now.getDate()); const from = new Date(to.getTime() - 86_400_000); return { from, to: new Date(to.getTime() - 1), label: "أمس / Yesterday" }; }
  if (/(الشهر الماضي|الشهر السابق|last month|previous month)/i.test(normalized)) { const from = new Date(now.getFullYear(), now.getMonth() - 1, 1); return { from, to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999), label: "الشهر الماضي / Last month" }; }
  if (/(من بدايه السنه|من بداية السنه|من بداية السنة|year to date|ytd|this year)/i.test(normalized)) return { from: new Date(now.getFullYear(), 0, 1), to: now, label: "من بداية السنة / Year to date" };
  const explicit = normalized.match(/(?:من|from)\s+(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?\s+(?:الى|إلى|to)\s+(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/i);
  if (explicit) { const year = (value: string | undefined) => value ? Number(value.length === 2 ? `20${value}` : value) : now.getFullYear(); const from = new Date(year(explicit[3]), Number(explicit[2]) - 1, Number(explicit[1])); const to = new Date(year(explicit[6]), Number(explicit[5]) - 1, Number(explicit[4]), 23, 59, 59, 999); return { from, to, label: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}` }; }
  return { ...fallback, label: "هذا الشهر / This month" };
}

const scope = (context: AssistantContext) => ({ tenantId: context.tenantId ?? 1, companyId: context.companyId ?? 1 });
const source = (report: string, range: DateRange, extra = "") => ({ report, from: range.from.toISOString().slice(0, 10), to: range.to.toISOString().slice(0, 10), filters: extra || undefined });

function requireModule(context: AssistantContext, moduleKey: string) {
  if (!context.enabledModules.has(moduleKey)) throw new AssistantError("لا تملك صلاحية قراءة البيانات المطلوبة لهذا السؤال", 403, "ASSISTANT_PERMISSION_DENIED");
}

function classify(question: string, previous?: string) {
  const normalized = normalizedMention(question);
  if (/(قارنها|قارن ذلك|compare it|compare this)/.test(normalized) && previous) return previous;
  if (/(فرق|قارن|مقارنه|difference|compare)/.test(normalized) && previous) return "COMPARISON";
  if (/(pdf|excel|xlsx|نزله|نزلي|صدّر|صدر|export|download)/.test(normalized) && previous) return "EXPORT_PREVIOUS";
  if (/(اخر فاتوره|اخر فاتورة|last invoice|latest invoice)/.test(normalized) && /(اشتر|مورد|purchase|supplier)/.test(normalized)) return "LAST_PURCHASE";
  if (/(اخر فاتوره|اخر فاتورة|last invoice|latest invoice)/.test(normalized)) return "LAST_SALE";
  if (/(كم باقي|المتبقي|remaining|how much.*left)/.test(normalized) && previous) return "SALE_BALANCE";
  if (/(اخر رحله|آخر رحلة|last trip|latest trip)/.test(normalized)) return "LAST_TRIP";
  if (/(اخر حركه|آخر حركة|last activity|recent activity)/.test(normalized)) return "PARTY_ACTIVITY";
  if (/(كل شي|كل شيء|everything|all.*about)/.test(normalized)) return "PARTY_OVERVIEW";
  if (/(حركات مخزون|حركه مخزون|inventory movements|stock movements)/.test(normalized)) return "PARTY_INVENTORY_MOVEMENTS";
  if (/(مخزونهم سالب|رصيد.*سالب|negative.*stock|negative balance)/.test(normalized)) return "NEGATIVE_CUSTOMER_STOCK";
  if (/(وثائق.*تنته|تأمين.*ينته|insurance.*expire|expir.*document)/.test(normalized)) return "EXPIRING_DOCUMENTS";
  if (/(كم صرفنا|تكلفت.*شاح|كلفت.*شاح|truck.*cost|vehicle.*cost)/.test(normalized)) return "TRUCK_COST";
  if (/(مبيعات|بيع|sales|revenue)/.test(normalized)) return "SALES_SUMMARY";
  if (/(مشتريات|شراء|purchases|procurement)/.test(normalized)) return "PURCHASE_SUMMARY";
  if (/(ربح|profit|margin|ربحيه)/.test(normalized)) return "PROFIT_SUMMARY";
  if (/(كشف حساب|statement|رصيد الحساب|customer balance|supplier balance)/.test(normalized)) return "PARTY_STATEMENT";
  if (/(مخزون العميل|كشف مخزون|customer stock|inventory statement|كم مخزونه)/.test(normalized)) return "PARTY_INVENTORY";
  if (/(بنوك|البنك|bank balance|cash balance|حساب البنك)/.test(normalized)) return "BANK_BALANCES";
  if (/(ذمم العملاء|مديوني|receivable|ar aging)/.test(normalized)) return "RECEIVABLES";
  if (/(ذمم الموردين|مستحق.*مورد|payable|ap aging)/.test(normalized)) return "PAYABLES";
  if (/(النقل|نقليات|transport|trips)/.test(normalized)) return "TRANSPORT";
  if (/(وثائق|تنتهي|expiry|expiring|insurance|اقامه|رخص)/.test(normalized)) return "EXPIRING_DOCUMENTS";
  if (/(سيول|نقد|cash|liquidity)/.test(normalized)) return "LIQUIDITY";
  if (/(ضريب|vat|tax)/.test(normalized)) return "VAT";
  if (/(مشروع|project).*(خسر|loss)|الخسرانة/.test(normalized)) return "LOSING_PROJECTS";
  if (/(مصنع|factory)/.test(normalized)) return "FACTORY";
  if (/(طن خام|رصيد.*عميل|customer.*stock|raw material)/.test(normalized)) return "CUSTOMER_STOCK";
  if (/(أكثر عميل|اكبر عميل|سحب|withdraw)/.test(normalized)) return "TOP_CUSTOMERS";
  if (/(ما اشتغل|غير نشط|inactive|stopped)/.test(normalized)) return "INACTIVE_CUSTOMERS";
  if (/(مادة|material|netapave|mb-|ربح.*منتج)/.test(normalized)) return "MATERIAL_PROFIT";
  if (/(هات|عطيني|ورجيني|طلعلي|اعرضلي|بدي|وين|شو|قديش|كم|show|find|search|what|which)/.test(normalized)) return "GLOBAL_SEARCH";
  if (/(الشهر الماضي|الشهر السابق|last month|previous month)/.test(normalized) && previous) return previous;
  return "OVERVIEW";
}

async function dashboard(tx: Tx, context: AssistantContext, range = monthRange()) {
  const { loadExecutiveDashboard } = await import("@/lib/analytics");
  return loadExecutiveDashboard(tx, range, context.enabledModules, 60);
}

async function resolveParty(tx: Tx, question: string, context: AssistantContext, role?: "CUSTOMER" | "SUPPLIER") {
  const rows = await tx.party.findMany({ where: { ...scope(context), isActive: true, ...(role === "CUSTOMER" ? { isCustomer: true } : role === "SUPPLIER" ? { isSupplier: true } : {}) }, select: { id: true, nameAr: true, nameEn: true, unifiedNumber: true, isCustomer: true, isSupplier: true } });
  return matchMention(question, rows);
}

async function resolveTruck(tx: Tx, question: string, context: AssistantContext) {
  const rows = await tx.truck.findMany({ where: { ...scope(context) }, select: { id: true, plateNumber: true, fleetCode: true, make: true, model: true } });
  return matchMention(question, rows.map((row) => ({ ...row, nameAr: row.plateNumber, nameEn: row.fleetCode })));
}

async function lastInvoice(tx: Tx, context: AssistantContext, question: string, range: DateRange, purchase = false) {
  const party = await resolveParty(tx, question, context, purchase ? "SUPPLIER" : "CUSTOMER");
  if (!party) throw new AssistantError(purchase ? "لم أجد المورد المذكور." : "لم أجد العميل المذكور.", 404, "ENTITY_NOT_FOUND");
  const row = purchase
    ? await tx.purchase.findFirst({ where: { ...scope(context), partyId: party.id, status: "POSTED" }, orderBy: { purchaseDate: "desc" } })
    : await tx.sale.findFirst({ where: { ...scope(context), partyId: party.id, status: "POSTED" }, orderBy: { invoiceDate: "desc" }, include: { allocations: true } });
  if (!row) return { party, row: null, paid: 0 };
  const paid = purchase ? 0 : (row as { allocations?: Array<{ amount: unknown }> }).allocations?.reduce((sum, allocation) => sum + number(allocation.amount), 0) ?? 0;
  return { party, row, paid };
}

async function partyOverview(tx: Tx, context: AssistantContext, question: string, range: DateRange) {
  const party = await resolveParty(tx, question, context);
  if (!party) throw new AssistantError("لم أجد الجهة المذكورة بثقة كافية.", 404, "ENTITY_NOT_FOUND");
  const [sales, purchases, stock, movements, trips] = await Promise.all([
    tx.sale.findMany({ where: { ...scope(context), partyId: party.id }, orderBy: { invoiceDate: "desc" }, take: 20, select: { id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true, status: true } }),
    tx.purchase.findMany({ where: { ...scope(context), partyId: party.id }, orderBy: { purchaseDate: "desc" }, take: 20, select: { id: true, purchaseNumber: true, purchaseDate: true, totalAmount: true, status: true } }),
    tx.partyStockAccount.findMany({ where: { ...scope(context), partyId: party.id }, include: { item: true }, orderBy: { quantity: "asc" } }),
    tx.stockMovement.findMany({ where: { ...scope(context), partyId: party.id, movementDate: { gte: range.from, lte: range.to } }, include: { item: true }, orderBy: { movementDate: "desc" }, take: 20 }),
    tx.transportTrip.findMany({ where: { ...scope(context), partyId: party.id }, orderBy: { tripDate: "desc" }, take: 10, select: { id: true, tripNumber: true, tripDate: true, truckId: true, quantity: true, totalCost: true } }),
  ]);
  return { party, sales, purchases, stock, movements, trips };
}

async function salesSummary(tx: Tx, context: AssistantContext, range: DateRange, question = "") {
  requireModule(context, "SALES");
  const party = question ? await resolveParty(tx, question, context, "CUSTOMER") : null;
  const rows = await tx.sale.findMany({ where: { ...scope(context), ...(party ? { partyId: party.id } : {}), status: "POSTED", invoiceDate: { gte: range.from, lte: range.to } }, include: { party: true }, orderBy: { invoiceDate: "desc" }, take: 200 });
  const total = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);
  return { rows, total, count: rows.length };
}

async function purchaseSummary(tx: Tx, context: AssistantContext, range: DateRange, question = "") {
  requireModule(context, "PURCHASES");
  const party = question ? await resolveParty(tx, question, context, "SUPPLIER") : null;
  const rows = await tx.purchase.findMany({ where: { ...scope(context), ...(party ? { partyId: party.id } : {}), status: "POSTED", purchaseDate: { gte: range.from, lte: range.to } }, include: { party: true }, orderBy: { purchaseDate: "desc" }, take: 200 });
  const total = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);
  return { rows, total, count: rows.length };
}

async function partyStatement(tx: Tx, context: AssistantContext, question: string, range: DateRange) {
  requireModule(context, "ACCOUNTING");
  const party = await resolveParty(tx, question, context);
  if (!party) throw new AssistantError("لم أجد عميلًا أو موردًا مطابقًا. اذكر الاسم أو الكود كما يظهر في النظام.", 404, "ENTITY_NOT_FOUND");
  const lines = await tx.journalEntryLine.findMany({ where: { ...scope(context), partyId: party.id, journalEntry: { status: "POSTED", entryDate: { gte: range.from, lte: range.to } } }, include: { journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { id: "asc" }] });
  const debit = lines.reduce((sum, row) => sum + Number(row.debit), 0), credit = lines.reduce((sum, row) => sum + Number(row.credit), 0);
  return { party, lines, debit, credit, balance: debit - credit };
}

async function partyInventory(tx: Tx, context: AssistantContext, question: string, range: DateRange) {
  requireModule(context, "INVENTORY");
  const party = await resolveParty(tx, question, context);
  if (!party) throw new AssistantError("لم أجد العميل المطلوب لكشف المخزون.", 404, "ENTITY_NOT_FOUND");
  const rows = await tx.partyStockAccount.findMany({ where: { ...scope(context), partyId: party.id }, include: { item: true }, orderBy: { quantity: "asc" } });
  const movements = await tx.stockMovement.findMany({ where: { ...scope(context), partyId: party.id, movementDate: { gte: range.from, lte: range.to } }, include: { item: true }, orderBy: { movementDate: "desc" }, take: 100 });
  return { party, rows, movements };
}

async function answerIntent(tx: Tx, intent: string, question: string, context: AssistantContext, range = resolvedRange(question)) {
  if (intent === "LAST_SALE" || intent === "LAST_PURCHASE") {
    const result = await lastInvoice(tx, context, question, range, intent === "LAST_PURCHASE");
    if (!result.row) return { answer: `لا توجد فاتورة مرحّلة مرتبطة بـ ${result.party.nameAr}.`, responseType: "TEXT", source: source(intent === "LAST_SALE" ? "posted_sales" : "posted_purchases", range, `partyId=${result.party.id}`) };
    const row = result.row as Record<string, unknown>;
    const date = String(row.invoiceDate ?? row.purchaseDate).slice(0, 10);
    const numberValue = String(row.invoiceNumber ?? row.purchaseNumber);
    const amount = number(row.totalAmount);
    return { answer: `${intent === "LAST_SALE" ? "آخر فاتورة بيع" : "آخر فاتورة شراء"} لـ ${result.party.nameAr}: ${numberValue} بتاريخ ${date} بقيمة ${money(amount)}${intent === "LAST_SALE" ? `، والمتبقي ${money(Math.max(0, amount - result.paid))}` : ""}.`, responseType: "TABLE", data: [{ number: numberValue, date, amount, paid: result.paid, remaining: intent === "LAST_SALE" ? Math.max(0, amount - result.paid) : undefined, href: intent === "LAST_SALE" ? `/sales/${row.id}/print` : `/purchases/${row.id}/print` }], drillDown: `/parties/${result.party.id}?tab=financial`, source: source(intent === "LAST_SALE" ? "posted_sales" : "posted_purchases", range, `partyId=${result.party.id}`), export: { pdf: `/api/parties/${result.party.id}/statement?kind=financial&format=pdf`, excel: `/api/parties/${result.party.id}/statement?kind=financial&format=xlsx` } };
  }
  if (intent === "SALE_BALANCE") {
    const result = await lastInvoice(tx, context, question, range);
    if (!result.row) return { answer: `لا توجد فاتورة بيع مرحّلة مرتبطة بـ ${result.party.nameAr}.`, responseType: "TEXT" };
    const row = result.row as Record<string, unknown>, remaining = Math.max(0, number(row.totalAmount) - result.paid);
    return { answer: `المتبقي من آخر فاتورة لـ ${result.party.nameAr} هو ${money(remaining)} من إجمالي ${money(row.totalAmount)}، بعد دفعات قدرها ${money(result.paid)}.`, responseType: "TABLE", data: [{ invoice: row.invoiceNumber, total: number(row.totalAmount), paid: result.paid, remaining, href: `/sales/${row.id}/print` }], drillDown: `/parties/${result.party.id}?tab=financial`, source: source("posted_sales_and_allocations", range, `partyId=${result.party.id}`) };
  }
  if (intent === "PARTY_OVERVIEW") {
    const result = await partyOverview(tx, context, question, range);
    return { answer: `${result.party.nameAr}: ${result.sales.length} مبيعات، ${result.purchases.length} مشتريات، ${result.stock.length} أرصدة مخزون، ${result.movements.length} حركة مخزون، و${result.trips.length} رحلات ضمن البيانات المتاحة.`, responseType: "TABLE", data: [{ section: "المبيعات", count: result.sales.length, href: `/parties/${result.party.id}?tab=sales` }, { section: "المشتريات", count: result.purchases.length, href: `/parties/${result.party.id}?tab=purchases` }, { section: "المخزون", count: result.stock.length, href: `/parties/${result.party.id}?tab=inventory` }, { section: "النقل", count: result.trips.length, href: `/transport?partyId=${result.party.id}` }], drillDown: `/parties/${result.party.id}`, source: source("party_cross_module_overview", range, `partyId=${result.party.id}`) };
  }
  if (intent === "PARTY_INVENTORY_MOVEMENTS") {
    const party = await resolveParty(tx, question, context);
    if (!party) throw new AssistantError("لم أجد العميل المذكور لكشف حركات المخزون.", 404, "ENTITY_NOT_FOUND");
    const movements = await tx.stockMovement.findMany({ where: { ...scope(context), partyId: party.id, movementDate: { gte: range.from, lte: range.to } }, include: { item: true }, orderBy: { movementDate: "desc" }, take: 200 });
    const rows = movements.map((movement) => ({ date: movement.movementDate, item: movement.item.nameAr, code: movement.item.code, direction: movement.movementType, quantityIn: number(movement.quantityIn), quantityOut: number(movement.quantityOut), balanceAfter: number(movement.balanceAfter), reference: movement.referenceNumber, href: `/parties/${party.id}?tab=inventory` }));
    return { answer: `وجدت ${rows.length} حركة مخزون لـ ${party.nameAr} للفترة ${range.label}.`, responseType: "TABLE", data: rows, drillDown: `/parties/${party.id}?tab=inventory`, source: source("party_stock_movements", range, `partyId=${party.id}`) };
  }
  if (intent === "PARTY_ACTIVITY") {
    const party = await resolveParty(tx, question, context);
    if (!party) throw new AssistantError("لم أجد العميل المذكور.", 404, "ENTITY_NOT_FOUND");
    const [sale, purchase, movement, trip] = await Promise.all([
      tx.sale.findFirst({ where: { ...scope(context), partyId: party.id }, orderBy: { invoiceDate: "desc" }, select: { id: true, invoiceNumber: true, invoiceDate: true, totalAmount: true } }),
      tx.purchase.findFirst({ where: { ...scope(context), partyId: party.id }, orderBy: { purchaseDate: "desc" }, select: { id: true, purchaseNumber: true, purchaseDate: true, totalAmount: true } }),
      tx.stockMovement.findFirst({ where: { ...scope(context), partyId: party.id }, orderBy: { movementDate: "desc" }, include: { item: true } }),
      tx.transportTrip.findFirst({ where: { ...scope(context), partyId: party.id }, orderBy: { tripDate: "desc" }, select: { id: true, tripNumber: true, tripDate: true, quantity: true } }),
    ]);
    const candidates = [sale && { kind: "فاتورة بيع", date: sale.invoiceDate, reference: sale.invoiceNumber, amount: number(sale.totalAmount), href: `/sales/${sale.id}/print` }, purchase && { kind: "فاتورة شراء", date: purchase.purchaseDate, reference: purchase.purchaseNumber, amount: number(purchase.totalAmount), href: `/purchases/${purchase.id}/print` }, movement && { kind: "حركة مخزون", date: movement.movementDate, reference: movement.movementNumber, amount: number(movement.quantityIn) + number(movement.quantityOut), href: `/parties/${party.id}?tab=inventory` }, trip && { kind: "رحلة نقل", date: trip.tripDate, reference: trip.tripNumber, amount: number(trip.quantity), href: `/transport/trips/${trip.id}/print` }].filter(Boolean).sort((a, b) => new Date(String((b as Record<string, unknown>).date)).getTime() - new Date(String((a as Record<string, unknown>).date)).getTime()) as Array<Record<string, unknown>>;
    const latest = candidates[0];
    const answer = latest ? `آخر حركة لـ ${party.nameAr}: ${String(latest.kind)} ${String(latest.reference)} بتاريخ ${String(latest.date).slice(0, 10)}.` : `لا توجد حركة مسجلة لـ ${party.nameAr}.`;
    return { answer, responseType: "TABLE", data: latest ? [latest] : [], drillDown: `/parties/${party.id}`, source: source("party_recent_activity", range, `partyId=${party.id}`) };
  }
  if (intent === "NEGATIVE_CUSTOMER_STOCK") {
    requireModule(context, "INVENTORY");
    const rows = await tx.partyStockAccount.findMany({ where: { ...scope(context), quantity: { lt: 0 } }, include: { party: true, item: true }, orderBy: { quantity: "asc" }, take: 200 });
    return { answer: rows.length ? `وجدت ${rows.length} رصيدًا سالبًا لمواد العملاء.` : "لا توجد أرصدة سالبة لمواد العملاء.", responseType: "TABLE", data: rows.map((row) => ({ customer: row.party.nameAr, material: row.item.nameAr, code: row.item.code, quantity: number(row.quantity), href: `/parties/${row.partyId}?tab=inventory` })), drillDown: "/reports?report=customer-raw-balances", source: source("negative_customer_stock", range) };
  }
  if (intent === "LAST_TRIP") {
    const party = await resolveParty(tx, question, context);
    const truck = await resolveTruck(tx, question, context);
    const trip = await tx.transportTrip.findFirst({ where: { ...scope(context), ...(party ? { partyId: party.id } : {}), ...(truck ? { truckId: truck.id } : {}) }, orderBy: { tripDate: "desc" }, include: { truck: true, driver: true, party: true } });
    if (!trip) return { answer: "لا توجد رحلة مطابقة في البيانات الحالية.", responseType: "TEXT" };
    return { answer: `آخر رحلة هي ${trip.tripNumber} بتاريخ ${trip.tripDate.toISOString().slice(0, 10)}${trip.party ? ` للجهة ${trip.party.nameAr}` : ""}${trip.truck ? ` بالشاحنة ${trip.truck.plateNumber}` : ""}، بكمية ${number(trip.quantity).toLocaleString("en-US")}.`, responseType: "TABLE", data: [{ trip: trip.tripNumber, date: trip.tripDate, truck: trip.truck?.plateNumber, driver: trip.driver?.name, quantity: number(trip.quantity), href: `/transport/trips/${trip.id}/print` }], drillDown: `/transport?tripId=${trip.id}`, source: source("transport_trips", range, party ? `partyId=${party.id}` : truck ? `truckId=${truck.id}` : "") };
  }
  if (intent === "TRUCK_COST") {
    const truck = await resolveTruck(tx, question, context);
    if (!truck) throw new AssistantError("لم أجد الشاحنة المذكورة. اذكر رقم اللوحة أو كود الأسطول.", 404, "ENTITY_NOT_FOUND");
    const [trips, fuel, maintenance] = await Promise.all([
      tx.transportTrip.findMany({ where: { ...scope(context), truckId: truck.id, tripDate: { gte: range.from, lte: range.to } }, select: { id: true, tripNumber: true, tripDate: true, totalCost: true, netProfit: true } }),
      tx.vehicleFuelTransaction.findMany({ where: { ...scope(context), truckId: truck.id, transactionDate: { gte: range.from, lte: range.to } }, select: { id: true, transactionDate: true, totalAmount: true } }),
      tx.vehicleMaintenanceRecord.findMany({ where: { ...scope(context), truckId: truck.id, maintenanceDate: { gte: range.from, lte: range.to } }, select: { id: true, maintenanceDate: true, cost: true } }),
    ]);
    const total = trips.reduce((sum, row) => sum + number(row.totalCost), 0) + fuel.reduce((sum, row) => sum + number(row.totalAmount), 0) + maintenance.reduce((sum, row) => sum + number(row.cost), 0);
    return { answer: `تكلفة الشاحنة ${truck.plateNumber} للفترة ${range.label}: ${money(total)} تشمل ${money(trips.reduce((s, r) => s + number(r.totalCost), 0))} رحلات، ${money(fuel.reduce((s, r) => s + number(r.totalAmount), 0))} وقود، و${money(maintenance.reduce((s, r) => s + number(r.cost), 0))} صيانة.`, responseType: "TABLE", data: [{ category: "الرحلات", value: trips.reduce((s, r) => s + number(r.totalCost), 0) }, { category: "الوقود", value: fuel.reduce((s, r) => s + number(r.totalAmount), 0) }, { category: "الصيانة", value: maintenance.reduce((s, r) => s + number(r.cost), 0) }, { category: "الإجمالي", value: total }], drillDown: `/transport?truckId=${truck.id}`, source: source("truck_costs", range, `truckId=${truck.id}`) };
  }
  if (intent === "GLOBAL_SEARCH") {
    const { globalSearch } = await import("@/lib/global-search");
    const modules = new Set([...context.enabledModules, "CORE"]);
    const result = await globalSearch(tx, question, modules, 1, 30, context.tenantId ?? 1, context.companyId ?? 1);
    const rows = result.results.map((row) => ({ type: row.type, title: row.title, subtitle: row.subtitle, href: row.href }));
    return { answer: rows.length ? `وجدت ${rows.length} نتيجة مرتبطة بطلبك.` : "لم أجد سجلاً مطابقًا ضمن البيانات المصرح بها.", responseType: "TABLE", data: rows, drillDown: "/search", source: source("global_search", range, `query=${question.slice(0, 80)}`) };
  }
  if (intent === "SALES_SUMMARY") {
    const result = await salesSummary(tx, context, range, question);
    const rows = result.rows.map(row => ({ invoice: row.invoiceNumber, date: row.invoiceDate, customer: row.party.nameAr, amount: Number(row.totalAmount), status: row.status, href: `/sales/${row.id}/print` }));
    return { answer: `إجمالي المبيعات للفترة ${range.label}: ${money(result.total)} من ${result.count} فاتورة مرحّلة.`, responseType: "TABLE", data: rows, drillDown: `/sales?from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}`, source: source("posted_sales", range), export: { pdf: `/api/assistant/export?format=pdf&report=sales&from=${range.from.toISOString()}&to=${range.to.toISOString()}`, excel: `/api/assistant/export?format=xlsx&report=sales&from=${range.from.toISOString()}&to=${range.to.toISOString()}` } };
  }
  if (intent === "PURCHASE_SUMMARY") {
    const result = await purchaseSummary(tx, context, range, question);
    const rows = result.rows.map(row => ({ purchase: row.purchaseNumber, date: row.purchaseDate, supplier: row.party.nameAr, amount: Number(row.totalAmount), status: row.status, href: `/purchases/${row.id}/print` }));
    return { answer: `إجمالي المشتريات للفترة ${range.label}: ${money(result.total)} من ${result.count} فاتورة مرحّلة.`, responseType: "TABLE", data: rows, drillDown: `/purchases?from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}`, source: source("posted_purchases", range), export: { pdf: `/api/assistant/export?format=pdf&report=purchases&from=${range.from.toISOString()}&to=${range.to.toISOString()}`, excel: `/api/assistant/export?format=xlsx&report=purchases&from=${range.from.toISOString()}&to=${range.to.toISOString()}` } };
  }
  if (intent === "PROFIT_SUMMARY") {
    const [sales, purchases] = await Promise.all([salesSummary(tx, context, range, question), purchaseSummary(tx, context, range, question)]);
    const profit = sales.total - purchases.total;
    return { answer: `النتيجة الإدارية المبسطة للفترة ${range.label}: مبيعات ${money(sales.total)} ناقص مشتريات ${money(purchases.total)} = ${money(profit)}. هذا ليس بديلًا عن قائمة الدخل الرسمية.`, responseType: "TABLE", data: [{ metric: "المبيعات", value: sales.total }, { metric: "المشتريات", value: purchases.total }, { metric: "الفرق الإداري المبسط", value: profit }], drillDown: `/accounting?tab=reports&report=profit-loss`, source: source("sales_minus_purchases", range) };
  }
  if (intent === "PARTY_STATEMENT") {
    const result = await partyStatement(tx, context, question, range);
    const rows = result.lines.map(row => ({ date: row.journalEntry.entryDate, number: row.journalEntry.entryNumber, description: row.description ?? row.journalEntry.description, debit: Number(row.debit), credit: Number(row.credit), status: "POSTED", href: `/accounting?tab=journals&entry=${row.journalEntryId}` }));
    return { answer: `كشف ${result.party.nameAr} للفترة ${range.label}: مدين ${money(result.debit)}، دائن ${money(result.credit)}، والرصيد الصافي ${money(result.balance)}.`, responseType: "TABLE", data: rows, drillDown: `/parties/${result.party.id}?tab=financial`, source: source("posted_party_statement", range, `partyId=${result.party.id}`), export: { pdf: `/api/parties/${result.party.id}/statement?kind=financial&from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}&format=pdf`, excel: `/api/parties/${result.party.id}/statement?kind=financial&from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}&format=xlsx` } };
  }
  if (intent === "PARTY_INVENTORY") {
    const result = await partyInventory(tx, context, question, range);
    const rows = result.rows.map(row => ({ material: row.item.nameAr, code: row.item.code, quantity: Number(row.quantity), estimatedValue: Number(row.quantity) * Number(row.averageValue), negative: Number(row.quantity) < 0, href: `/parties/${result.party.id}?tab=inventory` }));
    return { answer: `مخزون ${result.party.nameAr}: ${rows.length} مادة، منها ${rows.filter(row => row.negative).length} برصيد سالب.`, responseType: "TABLE", data: rows, drillDown: `/parties/${result.party.id}?tab=inventory`, source: source("party_stock_accounts", range, `partyId=${result.party.id}`), export: { pdf: `/api/parties/${result.party.id}/statement?kind=inventory&from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}&format=pdf`, excel: `/api/parties/${result.party.id}/statement?kind=inventory&from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}&format=xlsx` } };
  }
  if (intent === "COMPARISON") {
    const current = resolvedRange(question);
    const previous = { from: new Date(current.from.getFullYear(), current.from.getMonth() - 1, 1), to: new Date(current.from.getFullYear(), current.from.getMonth(), 0, 23, 59, 59, 999), label: "الشهر السابق / Previous month" };
    const [nowSales, oldSales] = await Promise.all([salesSummary(tx, context, current, question), salesSummary(tx, context, previous, question)]);
    const delta = nowSales.total - oldSales.total, percent = oldSales.total ? delta / Math.abs(oldSales.total) * 100 : null;
    return { answer: `مقارنة المبيعات: الحالية ${money(nowSales.total)} مقابل ${money(oldSales.total)} للفترة السابقة؛ الفرق ${money(delta)}${percent == null ? "" : ` (${percent.toFixed(1)}%)`}.`, responseType: "TABLE", data: [{ period: current.label, value: nowSales.total }, { period: previous.label, value: oldSales.total }, { period: "الفرق", value: delta }], drillDown: "/reports?report=monthly-comparison", source: source("sales_comparison", current) };
  }
  if (intent === "EXPIRING_DOCUMENTS") {
    requireModule(context, "TRANSPORT");
    const days = Math.min(365, Math.max(1, Number(question.match(/\d+/)?.[0] ?? 60)));
    const until = new Date(Date.now() + days * 86_400_000);
    const docs = await tx.truckDocument.findMany({ where: { ...scope(context), expiryDate: { gte: new Date(), lte: until }, status: "ACTIVE" }, include: { truck: true }, orderBy: { expiryDate: "asc" }, take: 200 });
    return { answer: `${docs.length} وثيقة مركبة تنتهي خلال ${days} يومًا.`, responseType: "TABLE", data: docs.map((doc) => ({ truck: doc.truck.plateNumber, type: doc.documentType, expiry: doc.expiryDate, number: doc.documentNumber, href: `/transport?truckId=${doc.truckId}` })), drillDown: "/transport?tab=documents", source: source("truck_documents_expiring", range, `days=${days}`) };
  }
  if (intent === "EXPORT_PREVIOUS") {
    const report = /مشتريات|شراء|purchase/i.test(question) ? "purchases" : "sales";
    const format = /pdf/i.test(question) ? "pdf" : "xlsx";
    return { answer: `جهزت تصدير ${report === "sales" ? "المبيعات" : "المشتريات"} للفترة ${range.label}.`, responseType: "TEXT", export: { [format === "pdf" ? "pdf" : "excel"]: `/api/assistant/export?format=${format}&report=${report}&from=${range.from.toISOString()}&to=${range.to.toISOString()}` }, source: source(`posted_${report}`, range) };
  }
  if (intent === "BANK_BALANCES") { requireModule(context, "ACCOUNTING"); const rows = await tx.bankAccount.findMany({ where: { ...scope(context), isActive: true }, select: { id: true, name: true, bankName: true, currency: true, openingBalance: true, currentBalance: true } }); return { answer: `لدي ${rows.length} حسابًا بنكيًا/نقديًا نشطًا ضمن الشركة الحالية.`, responseType: "TABLE", data: rows.map(row => ({ bank: row.name, institution: row.bankName, currency: row.currency, balance: Number(row.currentBalance ?? row.openingBalance), href: "/accounting?tab=banks" })), drillDown: "/accounting?tab=banks", source: source("bank_accounts", range) }; }
  if (intent === "RECEIVABLES" || intent === "PAYABLES") { requireModule(context, "ACCOUNTING"); const rows = await tx.party.findMany({ where: { ...scope(context), isActive: true, ...(intent === "RECEIVABLES" ? { isCustomer: true } : { isSupplier: true }) }, select: { id: true, nameAr: true }, take: 200 }); const balances = await Promise.all(rows.map(async party => { const lines = await tx.journalEntryLine.findMany({ where: { ...scope(context), partyId: party.id, journalEntry: { status: "POSTED" } }, select: { debit: true, credit: true } }); return { party: party.nameAr, balance: lines.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0), href: `/parties/${party.id}?tab=financial` }; })); const ranked = balances.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 50), top = ranked[0]; return { answer: `${intent === "RECEIVABLES" ? "ذمم العملاء" : "ذمم الموردين"}: ${money(balances.reduce((sum, row) => sum + row.balance, 0))}.${top ? ` الأعلى حاليًا ${top.party} برصيد ${money(top.balance)}.` : ""}`, responseType: "TABLE", data: ranked, drillDown: `/accounting?tab=reports&report=${intent === "RECEIVABLES" ? "ar-aging" : "ap-aging"}`, source: source(intent === "RECEIVABLES" ? "posted_ar" : "posted_ap", range) }; }
  if (intent === "LIQUIDITY") {
    requireModule(context, "ACCOUNTING");
    const data = await dashboard(tx, context, range);
    return { answer: `السيولة الحالية ${money(data.kpis.liquidity)}، وصافي التدفق هذا الشهر ${money(data.kpis.cashFlow)}.`, responseType: "TABLE", data: [{ metric: "السيولة", value: data.kpis.liquidity }, { metric: "صافي التدفق", value: data.kpis.cashFlow }], drillDown: "/treasury" };
  }
  if (intent === "VAT") {
    requireModule(context, "ACCOUNTING");
    const { buildVatSnapshot } = await import("@/lib/financial-reconciliation");
    const vat = await buildVatSnapshot(tx, range.from, range.to);
    return { answer: `صافي الضريبة للفترة ${money(vat.netVatDue)}، وفارق المطابقة ${money(vat.variance)}.`, responseType: "TABLE", data: [{ metric: "ضريبة مخرجات", value: Number(vat.documentOutputVat) }, { metric: "ضريبة مدخلات", value: Number(vat.documentInputVat) }, { metric: "الصافي", value: Number(vat.netVatDue) }, { metric: "فرق المطابقة", value: Number(vat.variance) }], drillDown: "/accounting?tab=vat" };
  }
  if (intent === "CUSTOMER_STOCK") {
    requireModule(context, "INVENTORY");
    const rows = await tx.partyStockAccount.findMany({ where: scope(context), include: { party: true, item: true }, orderBy: { quantity: "asc" }, take: 100 });
    const data = rows.map((row) => ({ party: row.party.nameAr, item: row.item.nameAr, quantity: Number(row.quantity), value: Number(row.quantity) * Number(row.averageValue), href: `/parties/${row.partyId}?tab=inventory` }));
    return { answer: `وجدت ${data.length} رصيدًا لمواد مملوكة للعملاء؛ ${data.filter((row) => row.quantity < 0).length} منها سالب.`, responseType: "TABLE", data, drillDown: "/reports?report=customer-raw-balances" };
  }
  if (["TOP_CUSTOMERS", "INACTIVE_CUSTOMERS", "FACTORY", "MATERIAL_PROFIT", "OVERVIEW"].includes(intent)) {
    const data = await dashboard(tx, context, range);
    if (intent === "FACTORY") {
      requireModule(context, "FACTORY");
      return { answer: data.factory ? `إنتاج المصنع هذا الشهر ${number(data.factory.tons).toLocaleString("en-US")} طن، وصافي الربح ${money(data.factory.netProfit)}، وربح الطن ${money(data.factory.profitPerTon)}.` : "لا توجد بيانات مصنع متاحة للفترة.", responseType: "TABLE", data: data.factory ? [data.factory] : [], drillDown: "/reports?report=daily-production" };
    }
    if (intent === "TOP_CUSTOMERS") {
      requireModule(context, "INVENTORY");
      const rows = data.customerActivity.slice(0, 10);
      return { answer: rows[0] ? `أعلى عميل سحبًا هو ${rows[0].partyName} بكمية ${number(rows[0].withdrawals).toLocaleString("en-US")}.` : "لا توجد حركات سحب في الفترة.", responseType: "CHART", data: rows, drillDown: "/reports?report=customer-activity" };
    }
    if (intent === "INACTIVE_CUSTOMERS") {
      requireModule(context, "INVENTORY");
      const days = Math.min(3650, Math.max(1, Number(question.match(/\d+/)?.[0] ?? 60)));
      const cutoff = new Date(Date.now() - days * 86_400_000);
      const rows = data.customerActivity.filter((row) => !row.lastActivity || new Date(row.lastActivity) < cutoff);
      return { answer: `${rows.length} عميلًا بلا نشاط خلال ${days} يومًا.`, responseType: "TABLE", data: rows, drillDown: `/reports?report=customer-activity&inactiveDays=${days}` };
    }
    if (intent === "MATERIAL_PROFIT") {
      requireModule(context, "ACCOUNTING");
      const query = question.toLowerCase();
      const matches = data.materials.filter((row) => query.includes(String(row.itemCode).toLowerCase()) || query.includes(String(row.itemName).toLowerCase()));
      const rows = (matches.length ? matches : data.materials).sort((a, b) => number(b.netProfit) - number(a.netProfit)).slice(0, 10);
      return { answer: rows[0] ? `ربحية ${rows[0].itemName}: ${money(rows[0].netProfit)} للفترة الحالية.` : "لا توجد بيانات ربحية مواد للفترة.", responseType: "CHART", data: rows, drillDown: "/reports?report=material-profitability" };
    }
    return { answer: `هذا الشهر: المبيعات ${money(data.kpis.sales)}، صافي الربح ${money(data.kpis.netProfit)}، السيولة ${money(data.kpis.liquidity)}، والذمم المدينة ${money(data.kpis.ar)}.`, responseType: "TABLE", data: Object.entries(data.kpis).map(([metric, value]) => ({ metric, value })), drillDown: "/" };
  }
  if (intent === "LOSING_PROJECTS") {
    requireModule(context, "PROJECTS");
    const { projectKpis } = await import("@/lib/projects");
    const projects = await tx.project.findMany({ where: { ...scope(context), status: { not: "CANCELLED" } }, select: { id: true, name: true, projectNumber: true }, take: 30 });
    const rows = [];
    for (const project of projects) {
      const report = await projectKpis(tx, project.id);
      if (report.kpis.estimatedFinalProfit < 0) rows.push({ ...project, ...report.kpis, href: `/projects?projectId=${project.id}` });
    }
    return { answer: rows.length ? `${rows.length} مشروعًا متوقعًا أن ينتهي بخسارة.` : "لا توجد مشاريع بخسارة متوقعة ضمن البيانات الحالية.", responseType: "TABLE", data: rows, drillDown: "/projects" };
  }
  throw new AssistantError("لم أتمكن من تحديد التقرير المطلوب");
}

export async function askAssistant(tx: Tx, input: Record<string, unknown>, context: AssistantContext) {
  const question = text(input.question);
  if (!question || question.length > 1000) throw new AssistantError("السؤال مطلوب وبحد أقصى 1000 حرف");
  let conversation = input.conversationId ? await tx.assistantConversation.findUnique({ where: { id: Number(input.conversationId) } }) : null;
  if (conversation && (conversation.userId !== context.userId || conversation.tenantId !== (context.tenantId ?? 1) || conversation.companyId !== (context.companyId ?? 1))) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
  if (!conversation) conversation = await tx.assistantConversation.create({ data: { userId: context.userId, tenantId: context.tenantId ?? 1, companyId: context.companyId ?? 1, title: question.slice(0, 100), locale: /[\u0600-\u06ff]/.test(question) ? "ar" : "en" } });
  const previousContext = JSON.parse(conversation.contextJson || "{}") as { lastIntent?: string; lastQuestion?: string; lastRange?: { from: string; to: string; label: string } };
  const plannerHint = input.plannerHint as { intent?: string } | undefined;
  const hintedIntent = plannerHint?.intent && ["SALES_SUMMARY", "PURCHASE_SUMMARY", "PROFIT_SUMMARY", "PARTY_STATEMENT", "PARTY_INVENTORY", "BANK_BALANCES", "RECEIVABLES", "PAYABLES", "TRANSPORT", "EXPIRING_DOCUMENTS", "GLOBAL_SEARCH"].includes(plannerHint.intent) ? plannerHint.intent : undefined;
  const intent = hintedIntent ?? classify(question, previousContext.lastIntent);
  const fallback = previousContext.lastRange ? { from: new Date(previousContext.lastRange.from), to: new Date(previousContext.lastRange.to), label: previousContext.lastRange.label } : monthRange();
  const range = resolvedRange(question, fallback);
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "USER", content: question } });
  const queryQuestion = previousContext.lastQuestion ? `${previousContext.lastQuestion} ${question}` : question;
  const result = await answerIntent(tx, intent, queryQuestion, context, range);
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: result.answer, responseType: result.responseType, dataJson: JSON.stringify({ data: result.data, drillDown: result.drillDown, source: result.source, export: result.export, intent }) } });
  await tx.assistantConversation.update({ where: { id: conversation.id }, data: { contextJson: JSON.stringify({ lastIntent: intent, lastQuestion: question, lastRange: { from: range.from.toISOString(), to: range.to.toISOString(), label: range.label } }) } });
  await audit(tx, { action: "ASSISTANT_QUERY", entityType: "ASSISTANT_CONVERSATION", entityId: conversation.id, userId: String(context.userId), metadata: { intent } });
  return { conversationId: conversation.id, intent, ...result };
}

export async function saveAssistantProposal(tx: Tx, input: Record<string, unknown>, context: AssistantContext) {
  const action = text(input.action).toUpperCase();
  if (action === "PROPOSE") {
    const actionType = text(input.actionType).toUpperCase();
    const permission = actionType === "CRM_TASK" ? "CRM.CREATE" : actionType === "PARTY_CREATE" ? "CORE.CREATE" : actionType === "SALES_WORKFLOW_DRAFT" ? "SALES.CREATE" : actionType === "PURCHASE_WORKFLOW_DRAFT" ? "PURCHASES.CREATE" : actionType === "FINANCIAL_VOUCHER_DRAFT" ? "ACCOUNTING.CREATE" : actionType === "OWNERSHIP_TRANSFER" ? "INVENTORY.CREATE" : "";
    if (!permission || !context.permissions.has(permission)) throw new AssistantError("الإجراء غير مسموح", 403, "ASSISTANT_ACTION_DENIED");
    const conversationId = Number(input.conversationId);
    const conversation = await tx.assistantConversation.findFirst({ where: { id: conversationId, userId: context.userId, ...scope(context) } });
    if (!conversation || conversation.userId !== context.userId) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
    const payload = input.payload as Record<string, unknown>;
    const preview = proposalPreview(actionType, payload);
    return tx.assistantActionProposal.create({ data: { conversationId, userId: context.userId, actionType, previewJson: JSON.stringify(preview), payloadJson: JSON.stringify(payload), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  }
  const proposal = await tx.assistantActionProposal.findFirst({ where: { id: Number(input.id), userId: context.userId, ...scope(context) } });
  if (!proposal || proposal.userId !== context.userId) throw new AssistantError("المقترح غير موجود", 404, "NOT_FOUND");
  if (proposal.status !== "PENDING" || proposal.expiresAt <= new Date()) throw new AssistantError("انتهت صلاحية المقترح أو تم التعامل معه", 409, "PROPOSAL_CLOSED");
  if (action === "CANCEL") return tx.assistantActionProposal.update({ where: { id: proposal.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  if (action === "EDIT") {
    const payload = input.payload as Record<string, unknown>;
    return tx.assistantActionProposal.update({ where: { id: proposal.id }, data: { payloadJson: JSON.stringify(payload), previewJson: JSON.stringify(proposalPreview(proposal.actionType, payload)) } });
  }
  if (action === "CONFIRM") {
    const payload = JSON.parse(proposal.payloadJson) as Record<string, unknown>;
    let result: Record<string, unknown>;
    if (proposal.actionType === "CRM_TASK") {
      if (!context.permissions.has("CRM.CREATE")) throw new AssistantError("فقدت صلاحية إنشاء المهمة", 403, "ASSISTANT_ACTION_DENIED");
      const activity = await tx.crmActivity.create({ data: { ...scope(context), activityType: "TASK", subject: text(payload.subject), partyId: Number(payload.partyId) || null, assignedUserId: context.userId, dueAt: payload.dueAt ? new Date(String(payload.dueAt)) : null, notes: text(payload.notes) || null } });
      result = { activity };
    } else if (proposal.actionType === "PARTY_CREATE") {
      if (!context.permissions.has("CORE.CREATE")) throw new AssistantError("فقدت صلاحية إنشاء العميل", 403, "ASSISTANT_ACTION_DENIED");
      const nameAr = text(payload.nameAr); if (!nameAr) throw new AssistantError("اسم العميل مطلوب");
      if (await tx.party.findFirst({ where: { OR: [{ nameAr }, ...(text(payload.unifiedNumber) ? [{ unifiedNumber: text(payload.unifiedNumber) }] : [])] } })) throw new AssistantError("يوجد كيان مطابق؛ افتحه بدل إنشاء نسخة مكررة", 409, "DUPLICATE");
      const party = await tx.party.create({ data: { ...scope(context), nameAr, nameEn: text(payload.nameEn) || null, unifiedNumber: text(payload.unifiedNumber) || null, vatNumber: text(payload.vatNumber) || null, telephone: text(payload.telephone) || null, email: text(payload.email) || null, isCustomer: payload.isSupplier !== true, isSupplier: payload.isSupplier === true } });
      if (text(payload.city) || text(payload.street) || text(payload.district)) await tx.partyAddress.create({ data: { ...scope(context), partyId: party.id, city: text(payload.city) || null, street: text(payload.street) || null, district: text(payload.district) || null } });
      result = { party };
    } else if (proposal.actionType === "SALES_WORKFLOW_DRAFT") {
      if (!context.permissions.has("SALES.CREATE") || !context.enabledModules.has("SALES")) throw new AssistantError("فقدت صلاحية إنشاء مستند البيع", 403, "ASSISTANT_ACTION_DENIED");
      const { createBusinessDocument, parseWorkflowInput } = await import("@/lib/workflows");
      const document = await createBusinessDocument(tx, parseWorkflowInput({ ...payload, tenantId: context.tenantId ?? 1, companyId: context.companyId ?? 1 }, "SALES_ORDER"));
      result = { document };
    } else if (proposal.actionType === "PURCHASE_WORKFLOW_DRAFT") {
      if (!context.permissions.has("PURCHASES.CREATE") || !context.enabledModules.has("PURCHASES")) throw new AssistantError("فقدت صلاحية إنشاء مستند الشراء", 403, "ASSISTANT_ACTION_DENIED");
      const { createBusinessDocument, parseWorkflowInput } = await import("@/lib/workflows");
      const document = await createBusinessDocument(tx, parseWorkflowInput({ ...payload, tenantId: context.tenantId ?? 1, companyId: context.companyId ?? 1 }, "PURCHASE_ORDER"));
      result = { document };
    } else if (proposal.actionType === "FINANCIAL_VOUCHER_DRAFT") {
      if (!context.permissions.has("ACCOUNTING.CREATE") || !context.enabledModules.has("ACCOUNTING")) throw new AssistantError("فقدت صلاحية إنشاء السند المالي", 403, "ASSISTANT_ACTION_DENIED");
      const { createVoucher, ensureFinanceFoundation } = await import("@/lib/finance"); await ensureFinanceFoundation(tx);
      const voucher = await createVoucher(tx, payload); result = { voucher };
    } else if (proposal.actionType === "OWNERSHIP_TRANSFER") {
      if (!context.permissions.has("INVENTORY.CREATE") || !context.enabledModules.has("INVENTORY")) throw new AssistantError("فقدت صلاحية تحويل ملكية المخزون", 403, "ASSISTANT_ACTION_DENIED");
      const { transferStockOwnership } = await import("@/lib/inventory");
      const transfer = await transferStockOwnership(tx, { direction: String(payload.direction) as "COMPANY_TO_PARTY" | "PARTY_TO_COMPANY", itemId: Number(payload.itemId), partyId: Number(payload.partyId), quantity: number(payload.quantity), unitCost: number(payload.unitCost), notes: text(payload.notes) || null }); result = { transfer };
    } else throw new AssistantError("نوع المقترح غير مدعوم");
    await tx.assistantActionProposal.update({ where: { id: proposal.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    const entity = (result.activity ?? result.party ?? result.document ?? result.voucher ?? (result.transfer as { source?: { movement?: { id: number } } } | undefined)?.source?.movement) as { id: number };
    await audit(tx, { action: "ASSISTANT_CONFIRMED_ACTION", entityType: proposal.actionType, entityId: entity.id, userId: String(context.userId), metadata: { proposalId: proposal.id } });
    return { proposalId: proposal.id, ...result };
  }
  throw new AssistantError("إجراء المقترح غير مدعوم");
}

function proposalPreview(actionType: string, payload: Record<string, unknown>) {
  if (actionType === "CRM_TASK") { if (!text(payload.subject)) throw new AssistantError("عنوان المهمة مطلوب"); return { title: "إنشاء مهمة CRM", subject: text(payload.subject), dueAt: payload.dueAt ?? null }; }
  if (actionType === "PARTY_CREATE") { if (!text(payload.nameAr)) throw new AssistantError("اسم العميل مطلوب"); return { title: "إضافة عميل", customer: text(payload.nameAr), city: text(payload.city) || null, telephone: text(payload.telephone) || null, effect: "إنشاء ملف عميل فقط؛ لا أثر محاسبي أو مخزني" }; }
  if (actionType === "SALES_WORKFLOW_DRAFT") {
    const items = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : [];
    if (!Number(payload.partyId) || !items.length) throw new AssistantError("العميل والمادة والكمية مطلوبة لإعداد البيع");
    const subtotal = items.reduce((sum, row) => sum + number(row.quantity) * number(row.unitPrice), 0), vat = items.reduce((sum, row) => sum + number(row.quantity) * number(row.unitPrice) * number(row.vatRate ?? 15) / 100, 0);
    return { title: "NETAJ ONE — مسودة أمر بيع", customer: payload.partyName, material: items[0]?.itemName, quantity: items[0]?.quantity, unitPrice: items[0]?.unitPrice, subtotal, vat, total: subtotal + vat, ownership: "COMPANY", nextSteps: "أمر بيع → سند تسليم → نقل عند اختيار سيارة الشركة → فاتورة → محاسبة", effect: "لا مخزون ولا GL قبل ترحيل المستندات اللاحقة" };
  }
  if (actionType === "PURCHASE_WORKFLOW_DRAFT") { const items = Array.isArray(payload.items) ? payload.items as Record<string, unknown>[] : []; if (!Number(payload.partyId) || !items.length) throw new AssistantError("المورد والمادة والكمية مطلوبة لإعداد الشراء"); const subtotal = items.reduce((sum, row) => sum + number(row.quantity) * number(row.unitPrice), 0), vat = items.reduce((sum, row) => sum + number(row.quantity) * number(row.unitPrice) * number(row.vatRate ?? 15) / 100, 0); return { title: "NETAJ ONE — مسودة أمر شراء", customer: payload.partyName, material: items[0]?.itemName, quantity: items[0]?.quantity, unitPrice: items[0]?.unitPrice, subtotal, vat, total: subtotal + vat, nextSteps: "أمر شراء → استلام → فاتورة مورد → محاسبة", effect: "مسودة فقط؛ لا مخزون ولا AP ولا GL قبل المراحل اللاحقة" }; }
  if (actionType === "FINANCIAL_VOUCHER_DRAFT") { if (!Number(payload.partyId) || !Number(payload.bankAccountId) || number(payload.amount) <= 0 || !["CUSTOMER_RECEIPT", "SUPPLIER_PAYMENT"].includes(text(payload.voucherType).toUpperCase())) throw new AssistantError("نوع السند والجهة والبنك والمبلغ مطلوبة"); return { title: payload.voucherType === "CUSTOMER_RECEIPT" ? "NETAJ ONE — مسودة سند قبض" : "NETAJ ONE — مسودة سند صرف", customer: payload.partyName, amount: payload.amount, bank: payload.bankName, effect: "إنشاء مسودة فقط؛ لا حركة بنك ولا قيد GL قبل الترحيل الصريح" }; }
  if (actionType === "OWNERSHIP_TRANSFER") { if (!Number(payload.partyId) || !Number(payload.itemId) || number(payload.quantity) <= 0 || !["COMPANY_TO_PARTY", "PARTY_TO_COMPANY"].includes(text(payload.direction).toUpperCase())) throw new AssistantError("اتجاه التحويل والعميل والمادة والكمية مطلوبة"); return { title: "NETAJ ONE — تحويل ملكية مخزون", customer: payload.partyName, material: payload.itemName, quantity: payload.quantity, ownership: payload.direction === "COMPANY_TO_PARTY" ? "من الشركة إلى العميل" : "من العميل إلى الشركة", effect: payload.direction === "COMPANY_TO_PARTY" ? "سيُرفض التنفيذ إذا كان رصيد الشركة غير كافٍ" : "سيُسمح برصيد عميل سالب وفق قواعد الملكية" }; }
  throw new AssistantError("نوع المقترح غير مدعوم");
}

export async function interpretAssistantCommand(tx: Tx, input: Record<string, unknown>, context: AssistantContext) {
  const command = text(input.command); if (!command || command.length > 1000) throw new AssistantError("الأمر مطلوب وبحد أقصى 1000 حرف");
  let conversation = input.conversationId ? await tx.assistantConversation.findUnique({ where: { id: Number(input.conversationId) } }) : null;
  if (conversation && (conversation.userId !== context.userId || conversation.tenantId !== (context.tenantId ?? 1) || conversation.companyId !== (context.companyId ?? 1))) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
  if (!conversation) conversation = await tx.assistantConversation.create({ data: { userId: context.userId, tenantId: context.tenantId ?? 1, companyId: context.companyId ?? 1, title: `NETAJ ONE: ${command.slice(0, 80)}`, locale: /[\u0600-\u06ff]/.test(command) ? "ar" : "en" } });
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "USER", content: command, responseType: "COMMAND" } });
  if (/(اضف|أضف|انشئ|أنشئ|add|create).*(عميل|customer)/i.test(command)) {
    const name = command.match(/(?:عميل|customer)\s+(?:شركة\s+)?(.+?)(?=\s+(?:في|بال|رقم|هاتف|phone|جوال|$))/i)?.[1]?.trim() ?? "";
    const telephone = command.match(/(?:هاتف|الجوال|جوال|phone)\s*[:\-]?\s*([+\d٠-٩۰-۹ -]{7,})/i)?.[1]?.replace(/\s/g, "") ?? "";
    const city = command.match(/(?:في|بالمدينة|المدينة)\s+([\p{L}\s]+?)(?=\s+(?:رقم|هاتف|جوال|phone)|$)/iu)?.[1]?.trim() ?? "";
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "PARTY_CREATE", conversationId: conversation.id, payload: { nameAr: name, telephone, city, isCustomer: true } }, context);
  }
  if (/(حول|حوّل|نقل).*(ملكي|ownership)/i.test(command)) {
    if (!context.enabledModules.has("INVENTORY") || !context.permissions.has("INVENTORY.CREATE")) throw new AssistantError("لا تملك صلاحية تحويل ملكية المخزون", 403, "ASSISTANT_ACTION_DENIED");
    const [parties, items] = await Promise.all([tx.party.findMany({ where: { ...scope(context), isCustomer: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.item.findMany({ where: { ...scope(context), isActive: true }, select: { id: true, code: true, nameAr: true } })]), normalized = command.toLowerCase(), party = matchMention(normalized, parties), item = matchMention(normalized, items.map((row) => ({ ...row, unifiedNumber: row.code }))), quantity = commandQuantity(command), direction = /من\s+(?:الشركه|الشركة|company)\s+(?:الى|إلى|to)/i.test(command) ? "COMPANY_TO_PARTY" : /من\s+(?:العميل|customer)\s+(?:الى|إلى|to)\s+(?:الشركه|الشركة|company)/i.test(command) ? "PARTY_TO_COMPANY" : "";
    if (!party || !item || quantity <= 0 || !direction) throw new AssistantError("لم أستطع تحديد اتجاه التحويل والعميل والمادة والكمية بثقة.", 400, "COMMAND_NEEDS_REVIEW");
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "OWNERSHIP_TRANSFER", conversationId: conversation.id, payload: { direction, partyId: party.id, partyName: party.nameAr, itemId: item.id, itemName: item.nameAr, quantity, notes: `اعتمد بواسطة NETAJ ONE: ${command}` } }, context);
  }
  if (/(اشترينا|شراء|طلب شراء|purchase|buy)/i.test(command)) {
    if (!context.enabledModules.has("PURCHASES") || !context.permissions.has("PURCHASES.CREATE")) throw new AssistantError("لا تملك صلاحية إنشاء مشتريات", 403, "ASSISTANT_ACTION_DENIED");
    const [parties, items] = await Promise.all([tx.party.findMany({ where: { ...scope(context), isSupplier: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.item.findMany({ where: { ...scope(context), isActive: true }, select: { id: true, code: true, nameAr: true, vatRate: true } })]), normalized = command.toLowerCase(), party = matchMention(normalized, parties), item = matchMention(normalized, items.map((row) => ({ ...row, unifiedNumber: row.code }))), quantity = commandQuantity(command), unitPrice = commandPrice(command);
    if (!party || !item || quantity <= 0 || unitPrice < 0) throw new AssistantError("لم أستطع تحديد المورد والمادة والكمية والسعر بثقة.", 400, "COMMAND_NEEDS_REVIEW");
    const payload = { documentType: "PURCHASE_ORDER", documentDate: new Date().toISOString(), partyId: party.id, partyName: party.nameAr, currency: "SAR", notes: `أُعد بواسطة NETAJ ONE بعد مراجعة المستخدم: ${command}`, items: [{ itemId: item.id, itemName: item.nameAr, lineType: "ITEM", quantity, unitPrice, discount: 0, vatRate: Number(item.vatRate) }] };
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "PURCHASE_WORKFLOW_DRAFT", conversationId: conversation.id, payload }, context);
  }
  if (/(سند\s*(?:قبض|صرف)|ادفع|إدفع|استلم|payment|receipt)/i.test(command)) {
    if (!context.enabledModules.has("ACCOUNTING") || !context.permissions.has("ACCOUNTING.CREATE")) throw new AssistantError("لا تملك صلاحية إنشاء سند مالي", 403, "ASSISTANT_ACTION_DENIED");
    const receipt = /(قبض|استلم|receipt)/i.test(command), [parties, banks] = await Promise.all([tx.party.findMany({ where: { ...scope(context), ...(receipt ? { isCustomer: true } : { isSupplier: true }), isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.bankAccount.findMany({ where: { ...scope(context), isActive: true }, select: { id: true, name: true, bankName: true, currency: true } })]), normalized = command.toLowerCase(), party = matchMention(normalized, parties), bank = banks.sort((a, b) => Math.max(b.name.length, b.bankName?.length ?? 0) - Math.max(a.name.length, a.bankName?.length ?? 0)).find((row) => normalized.includes(row.name.toLowerCase()) || Boolean(row.bankName && normalized.includes(row.bankName.toLowerCase()))), amount = commandMoney(command);
    if (!party || !bank || amount <= 0) throw new AssistantError("لم أستطع تحديد الجهة والبنك والمبلغ بثقة.", 400, "COMMAND_NEEDS_REVIEW");
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "FINANCIAL_VOUCHER_DRAFT", conversationId: conversation.id, payload: { voucherType: receipt ? "CUSTOMER_RECEIPT" : "SUPPLIER_PAYMENT", voucherDate: new Date().toISOString(), partyId: party.id, partyName: party.nameAr, bankAccountId: bank.id, bankName: bank.name, amount, currency: bank.currency, paymentMethod: "BANK", description: `أُعد بواسطة NETAJ ONE بعد مراجعة المستخدم: ${command}` } }, context);
  }
  if (/(بعنا|بيع|sales?|sell)/i.test(command)) {
    if (!context.enabledModules.has("SALES") || !context.permissions.has("SALES.CREATE")) throw new AssistantError("لا تملك صلاحية إنشاء مبيعات", 403, "ASSISTANT_ACTION_DENIED");
    const [parties, items] = await Promise.all([tx.party.findMany({ where: { ...scope(context), isCustomer: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.item.findMany({ where: { ...scope(context), isActive: true }, select: { id: true, code: true, nameAr: true, vatRate: true } })]);
    const normalized = command.toLowerCase(), party = matchMention(normalized, parties), item = matchMention(normalized, items.map((row) => ({ ...row, unifiedNumber: row.code }))), quantity = commandQuantity(command), unitPrice = commandPrice(command);
    if (!party || !item || quantity <= 0 || unitPrice < 0) throw new AssistantError("لم أستطع تحديد العميل والمادة والكمية والسعر بثقة. اذكر أسماءها كما تظهر في النظام.", 400, "COMMAND_NEEDS_REVIEW");
    const payload = { documentType: "SALES_ORDER", documentDate: new Date().toISOString(), partyId: party.id, partyName: party.nameAr, currency: "SAR", notes: `أُعد بواسطة NETAJ ONE بعد مراجعة المستخدم: ${command}`, items: [{ itemId: item.id, itemName: item.nameAr, lineType: "ITEM", quantity, unitPrice, discount: 0, vatRate: Number(item.vatRate) }] };
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "SALES_WORKFLOW_DRAFT", conversationId: conversation.id, payload }, context);
  }
  throw new AssistantError("هذا الأمر غير مدعوم كعملية كتابة. استخدم وضع السؤال للتحليلات أو اطلب إضافة عميل/إعداد بيع.", 400, "COMMAND_NOT_SUPPORTED");
}

function normalizedMention(value: string) { return value.toLowerCase().normalize("NFKC").replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/[\s_\-./]+/g, " ").trim(); }
function matchMention<T extends { nameAr: string; nameEn?: string | null; unifiedNumber?: string | null }>(command: string, rows: T[]) {
  const normalized = normalizedMention(command);
  const commandTokens = new Set(normalized.split(" ").filter((token) => token.length > 1));
  const scored = rows.map((row) => {
    const candidates = [row.nameAr, row.nameEn, row.unifiedNumber].filter(Boolean).map((candidate) => normalizedMention(String(candidate)));
    let score = 0;
    for (const candidate of candidates) {
      if (candidate && normalized.includes(candidate)) score = Math.max(score, 1);
      const tokens = candidate.split(" ").filter((token) => token.length > 1);
      const overlap = tokens.filter((token) => commandTokens.has(token)).length;
      score = Math.max(score, tokens.length ? overlap / tokens.length : 0);
    }
    return { row, score };
  }).sort((left, right) => right.score - left.score);
  return scored[0] && scored[0].score >= 0.5 ? scored[0].row : undefined;
}
function commandNumber(value?: string) { return number(value?.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/,/g, "")); }
function commandQuantity(command: string) { return commandNumber(command.match(/([\d٠-٩۰-۹,.]+)\s*(?:طن|kg|كجم|وحده|وحدة|piece)/i)?.[1]); }
function commandPrice(command: string) { return commandNumber(command.match(/(?:بسعر|سعر|at)\s*([\d٠-٩۰-۹,.]+)/i)?.[1]); }
function commandMoney(command: string) { return commandNumber(command.match(/(?:مبلغ|بقيمة|amount|ادفع|إدفع|استلم)\s*[:\-]?\s*([\d٠-٩۰-۹,.]+)/i)?.[1]); }
