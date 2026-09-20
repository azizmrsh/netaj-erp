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

async function salesSummary(tx: Tx, context: AssistantContext, range: DateRange) {
  requireModule(context, "SALES");
  const rows = await tx.sale.findMany({ where: { ...scope(context), status: "POSTED", invoiceDate: { gte: range.from, lte: range.to } }, include: { party: true }, orderBy: { invoiceDate: "desc" }, take: 200 });
  const total = rows.reduce((sum, row) => sum + Number(row.totalAmount), 0);
  return { rows, total, count: rows.length };
}

async function purchaseSummary(tx: Tx, context: AssistantContext, range: DateRange) {
  requireModule(context, "PURCHASES");
  const rows = await tx.purchase.findMany({ where: { ...scope(context), status: "POSTED", purchaseDate: { gte: range.from, lte: range.to } }, include: { party: true }, orderBy: { purchaseDate: "desc" }, take: 200 });
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
  if (intent === "SALES_SUMMARY") {
    const result = await salesSummary(tx, context, range);
    const rows = result.rows.map(row => ({ invoice: row.invoiceNumber, date: row.invoiceDate, customer: row.party.nameAr, amount: Number(row.totalAmount), status: row.status, href: `/sales/${row.id}/print` }));
    return { answer: `إجمالي المبيعات للفترة ${range.label}: ${money(result.total)} من ${result.count} فاتورة مرحّلة.`, responseType: "TABLE", data: rows, drillDown: `/sales?from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}`, source: source("posted_sales", range), export: { pdf: `/api/assistant/export?format=pdf&report=sales&from=${range.from.toISOString()}&to=${range.to.toISOString()}`, excel: `/api/assistant/export?format=xlsx&report=sales&from=${range.from.toISOString()}&to=${range.to.toISOString()}` } };
  }
  if (intent === "PURCHASE_SUMMARY") {
    const result = await purchaseSummary(tx, context, range);
    const rows = result.rows.map(row => ({ purchase: row.purchaseNumber, date: row.purchaseDate, supplier: row.party.nameAr, amount: Number(row.totalAmount), status: row.status, href: `/purchases/${row.id}/print` }));
    return { answer: `إجمالي المشتريات للفترة ${range.label}: ${money(result.total)} من ${result.count} فاتورة مرحّلة.`, responseType: "TABLE", data: rows, drillDown: `/purchases?from=${range.from.toISOString().slice(0, 10)}&to=${range.to.toISOString().slice(0, 10)}`, source: source("posted_purchases", range), export: { pdf: `/api/assistant/export?format=pdf&report=purchases&from=${range.from.toISOString()}&to=${range.to.toISOString()}`, excel: `/api/assistant/export?format=xlsx&report=purchases&from=${range.from.toISOString()}&to=${range.to.toISOString()}` } };
  }
  if (intent === "PROFIT_SUMMARY") {
    const [sales, purchases] = await Promise.all([salesSummary(tx, context, range), purchaseSummary(tx, context, range)]);
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
    const [nowSales, oldSales] = await Promise.all([salesSummary(tx, context, current), salesSummary(tx, context, previous)]);
    const delta = nowSales.total - oldSales.total, percent = oldSales.total ? delta / Math.abs(oldSales.total) * 100 : null;
    return { answer: `مقارنة المبيعات: الحالية ${money(nowSales.total)} مقابل ${money(oldSales.total)} للفترة السابقة؛ الفرق ${money(delta)}${percent == null ? "" : ` (${percent.toFixed(1)}%)`}.`, responseType: "TABLE", data: [{ period: current.label, value: nowSales.total }, { period: previous.label, value: oldSales.total }, { period: "الفرق", value: delta }], drillDown: "/reports?report=monthly-comparison", source: source("sales_comparison", current) };
  }
  if (intent === "EXPORT_PREVIOUS") {
    const report = /مشتريات|شراء|purchase/i.test(question) ? "purchases" : "sales";
    const format = /pdf/i.test(question) ? "pdf" : "xlsx";
    return { answer: `جهزت تصدير ${report === "sales" ? "المبيعات" : "المشتريات"} للفترة ${range.label}.`, responseType: "TEXT", export: { [format === "pdf" ? "pdf" : "excel"]: `/api/assistant/export?format=${format}&report=${report}&from=${range.from.toISOString()}&to=${range.to.toISOString()}` }, source: source(`posted_${report}`, range) };
  }
  if (intent === "BANK_BALANCES") { requireModule(context, "ACCOUNTING"); const rows = await tx.bankAccount.findMany({ where: { ...scope(context), isActive: true }, select: { id: true, name: true, bankName: true, currency: true, openingBalance: true, currentBalance: true } }); return { answer: `لدي ${rows.length} حسابًا بنكيًا/نقديًا نشطًا ضمن الشركة الحالية.`, responseType: "TABLE", data: rows.map(row => ({ bank: row.name, institution: row.bankName, currency: row.currency, balance: Number(row.currentBalance ?? row.openingBalance), href: "/accounting?tab=banks" })), drillDown: "/accounting?tab=banks", source: source("bank_accounts", range) }; }
  if (intent === "RECEIVABLES" || intent === "PAYABLES") { requireModule(context, "ACCOUNTING"); const rows = await tx.party.findMany({ where: { ...scope(context), isActive: true, ...(intent === "RECEIVABLES" ? { isCustomer: true } : { isSupplier: true }) }, select: { id: true, nameAr: true }, take: 200 }); const balances = await Promise.all(rows.map(async party => { const lines = await tx.journalEntryLine.findMany({ where: { ...scope(context), partyId: party.id, journalEntry: { status: "POSTED" } }, select: { debit: true, credit: true } }); return { party: party.nameAr, balance: lines.reduce((sum, row) => sum + Number(row.debit) - Number(row.credit), 0), href: `/parties/${party.id}?tab=financial` }; })); return { answer: `${intent === "RECEIVABLES" ? "ذمم العملاء" : "ذمم الموردين"}: ${money(balances.reduce((sum, row) => sum + row.balance, 0))}.`, responseType: "TABLE", data: balances.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)).slice(0, 50), drillDown: `/accounting?tab=reports&report=${intent === "RECEIVABLES" ? "ar-aging" : "ap-aging"}`, source: source(intent === "RECEIVABLES" ? "posted_ar" : "posted_ap", range) }; }
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
  const intent = classify(question, previousContext.lastIntent);
  const fallback = previousContext.lastRange ? { from: new Date(previousContext.lastRange.from), to: new Date(previousContext.lastRange.to), label: previousContext.lastRange.label } : monthRange();
  const range = resolvedRange(question, fallback);
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "USER", content: question } });
  const result = await answerIntent(tx, intent, question, context, range);
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
  return rows.sort((left, right) => Math.max(right.nameAr.length, right.nameEn?.length ?? 0, right.unifiedNumber?.length ?? 0) - Math.max(left.nameAr.length, left.nameEn?.length ?? 0, left.unifiedNumber?.length ?? 0)).find((row) => [row.nameAr, row.nameEn, row.unifiedNumber].filter(Boolean).some((candidate) => normalized.includes(normalizedMention(String(candidate)))));
}
function commandNumber(value?: string) { return number(value?.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/,/g, "")); }
function commandQuantity(command: string) { return commandNumber(command.match(/([\d٠-٩۰-۹,.]+)\s*(?:طن|kg|كجم|وحده|وحدة|piece)/i)?.[1]); }
function commandPrice(command: string) { return commandNumber(command.match(/(?:بسعر|سعر|at)\s*([\d٠-٩۰-۹,.]+)/i)?.[1]); }
function commandMoney(command: string) { return commandNumber(command.match(/(?:مبلغ|بقيمة|amount|ادفع|إدفع|استلم)\s*[:\-]?\s*([\d٠-٩۰-۹,.]+)/i)?.[1]); }
