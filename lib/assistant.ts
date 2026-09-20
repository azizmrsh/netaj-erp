import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

type Tx = Prisma.TransactionClient;
type AssistantContext = {
  userId: number;
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

function requireModule(context: AssistantContext, moduleKey: string) {
  if (!context.enabledModules.has(moduleKey)) throw new AssistantError("لا تملك صلاحية قراءة البيانات المطلوبة لهذا السؤال", 403, "ASSISTANT_PERMISSION_DENIED");
}

function classify(question: string, previous?: string) {
  const normalized = question.toLowerCase();
  if (/(سيول|نقد|cash|liquidity)/.test(normalized)) return "LIQUIDITY";
  if (/(ضريب|vat|tax)/.test(normalized)) return "VAT";
  if (/(مشروع|project).*(خسر|loss)|الخسرانة/.test(normalized)) return "LOSING_PROJECTS";
  if (/(مصنع|factory)/.test(normalized)) return "FACTORY";
  if (/(طن خام|رصيد.*عميل|customer.*stock|raw material)/.test(normalized)) return "CUSTOMER_STOCK";
  if (/(أكثر عميل|اكبر عميل|سحب|withdraw)/.test(normalized)) return "TOP_CUSTOMERS";
  if (/(ما اشتغل|غير نشط|inactive|stopped)/.test(normalized)) return "INACTIVE_CUSTOMERS";
  if (/(مادة|material|netapave|mb-|ربح.*منتج)/.test(normalized)) return "MATERIAL_PROFIT";
  if (/(قارن|compare|مقارنة)/.test(normalized) && previous) return previous;
  return "OVERVIEW";
}

async function dashboard(tx: Tx, context: AssistantContext, range = monthRange()) {
  const { loadExecutiveDashboard } = await import("@/lib/analytics");
  return loadExecutiveDashboard(tx, range, context.enabledModules, 60);
}

async function answerIntent(tx: Tx, intent: string, question: string, context: AssistantContext) {
  const range = monthRange();
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
    const rows = await tx.partyStockAccount.findMany({ include: { party: true, item: true }, orderBy: { quantity: "asc" }, take: 100 });
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
    const projects = await tx.project.findMany({ where: { status: { not: "CANCELLED" } }, select: { id: true, name: true, projectNumber: true }, take: 30 });
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
  if (conversation && conversation.userId !== context.userId) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
  if (!conversation) conversation = await tx.assistantConversation.create({ data: { userId: context.userId, title: question.slice(0, 100), locale: /[\u0600-\u06ff]/.test(question) ? "ar" : "en" } });
  const previousContext = JSON.parse(conversation.contextJson || "{}") as { lastIntent?: string };
  const intent = classify(question, previousContext.lastIntent);
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "USER", content: question } });
  const result = await answerIntent(tx, intent, question, context);
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "ASSISTANT", content: result.answer, responseType: result.responseType, dataJson: JSON.stringify({ data: result.data, drillDown: result.drillDown, intent }) } });
  await tx.assistantConversation.update({ where: { id: conversation.id }, data: { contextJson: JSON.stringify({ lastIntent: intent, lastQuestion: question }) } });
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
    const conversation = await tx.assistantConversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== context.userId) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
    const payload = input.payload as Record<string, unknown>;
    const preview = proposalPreview(actionType, payload);
    return tx.assistantActionProposal.create({ data: { conversationId, userId: context.userId, actionType, previewJson: JSON.stringify(preview), payloadJson: JSON.stringify(payload), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  }
  const proposal = await tx.assistantActionProposal.findUnique({ where: { id: Number(input.id) } });
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
      const activity = await tx.crmActivity.create({ data: { activityType: "TASK", subject: text(payload.subject), partyId: Number(payload.partyId) || null, assignedUserId: context.userId, dueAt: payload.dueAt ? new Date(String(payload.dueAt)) : null, notes: text(payload.notes) || null } });
      result = { activity };
    } else if (proposal.actionType === "PARTY_CREATE") {
      if (!context.permissions.has("CORE.CREATE")) throw new AssistantError("فقدت صلاحية إنشاء العميل", 403, "ASSISTANT_ACTION_DENIED");
      const nameAr = text(payload.nameAr); if (!nameAr) throw new AssistantError("اسم العميل مطلوب");
      if (await tx.party.findFirst({ where: { OR: [{ nameAr }, ...(text(payload.unifiedNumber) ? [{ unifiedNumber: text(payload.unifiedNumber) }] : [])] } })) throw new AssistantError("يوجد كيان مطابق؛ افتحه بدل إنشاء نسخة مكررة", 409, "DUPLICATE");
      const party = await tx.party.create({ data: { nameAr, nameEn: text(payload.nameEn) || null, unifiedNumber: text(payload.unifiedNumber) || null, vatNumber: text(payload.vatNumber) || null, telephone: text(payload.telephone) || null, email: text(payload.email) || null, isCustomer: payload.isSupplier !== true, isSupplier: payload.isSupplier === true } });
      if (text(payload.city) || text(payload.street) || text(payload.district)) await tx.partyAddress.create({ data: { partyId: party.id, city: text(payload.city) || null, street: text(payload.street) || null, district: text(payload.district) || null } });
      result = { party };
    } else if (proposal.actionType === "SALES_WORKFLOW_DRAFT") {
      if (!context.permissions.has("SALES.CREATE") || !context.enabledModules.has("SALES")) throw new AssistantError("فقدت صلاحية إنشاء مستند البيع", 403, "ASSISTANT_ACTION_DENIED");
      const { createBusinessDocument, parseWorkflowInput } = await import("@/lib/workflows");
      const document = await createBusinessDocument(tx, parseWorkflowInput(payload, "SALES_ORDER"));
      result = { document };
    } else if (proposal.actionType === "PURCHASE_WORKFLOW_DRAFT") {
      if (!context.permissions.has("PURCHASES.CREATE") || !context.enabledModules.has("PURCHASES")) throw new AssistantError("فقدت صلاحية إنشاء مستند الشراء", 403, "ASSISTANT_ACTION_DENIED");
      const { createBusinessDocument, parseWorkflowInput } = await import("@/lib/workflows");
      const document = await createBusinessDocument(tx, parseWorkflowInput(payload, "PURCHASE_ORDER"));
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
  if (conversation && conversation.userId !== context.userId) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
  if (!conversation) conversation = await tx.assistantConversation.create({ data: { userId: context.userId, title: `NETAJ ONE: ${command.slice(0, 80)}`, locale: /[\u0600-\u06ff]/.test(command) ? "ar" : "en" } });
  await tx.assistantMessage.create({ data: { conversationId: conversation.id, role: "USER", content: command, responseType: "COMMAND" } });
  if (/(اضف|أضف|انشئ|أنشئ|add|create).*(عميل|customer)/i.test(command)) {
    const name = command.match(/(?:عميل|customer)\s+(?:شركة\s+)?(.+?)(?=\s+(?:في|بال|رقم|هاتف|phone|جوال|$))/i)?.[1]?.trim() ?? "";
    const telephone = command.match(/(?:هاتف|الجوال|جوال|phone)\s*[:\-]?\s*([+\d٠-٩۰-۹ -]{7,})/i)?.[1]?.replace(/\s/g, "") ?? "";
    const city = command.match(/(?:في|بالمدينة|المدينة)\s+([\p{L}\s]+?)(?=\s+(?:رقم|هاتف|جوال|phone)|$)/iu)?.[1]?.trim() ?? "";
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "PARTY_CREATE", conversationId: conversation.id, payload: { nameAr: name, telephone, city, isCustomer: true } }, context);
  }
  if (/(حول|حوّل|نقل).*(ملكي|ownership)/i.test(command)) {
    if (!context.enabledModules.has("INVENTORY") || !context.permissions.has("INVENTORY.CREATE")) throw new AssistantError("لا تملك صلاحية تحويل ملكية المخزون", 403, "ASSISTANT_ACTION_DENIED");
    const [parties, items] = await Promise.all([tx.party.findMany({ where: { isCustomer: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.item.findMany({ where: { isActive: true }, select: { id: true, code: true, nameAr: true } })]), normalized = command.toLowerCase(), party = matchMention(normalized, parties), item = matchMention(normalized, items.map((row) => ({ ...row, unifiedNumber: row.code }))), quantity = commandQuantity(command), direction = /من\s+(?:الشركه|الشركة|company)\s+(?:الى|إلى|to)/i.test(command) ? "COMPANY_TO_PARTY" : /من\s+(?:العميل|customer)\s+(?:الى|إلى|to)\s+(?:الشركه|الشركة|company)/i.test(command) ? "PARTY_TO_COMPANY" : "";
    if (!party || !item || quantity <= 0 || !direction) throw new AssistantError("لم أستطع تحديد اتجاه التحويل والعميل والمادة والكمية بثقة.", 400, "COMMAND_NEEDS_REVIEW");
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "OWNERSHIP_TRANSFER", conversationId: conversation.id, payload: { direction, partyId: party.id, partyName: party.nameAr, itemId: item.id, itemName: item.nameAr, quantity, notes: `اعتمد بواسطة NETAJ ONE: ${command}` } }, context);
  }
  if (/(اشترينا|شراء|طلب شراء|purchase|buy)/i.test(command)) {
    if (!context.enabledModules.has("PURCHASES") || !context.permissions.has("PURCHASES.CREATE")) throw new AssistantError("لا تملك صلاحية إنشاء مشتريات", 403, "ASSISTANT_ACTION_DENIED");
    const [parties, items] = await Promise.all([tx.party.findMany({ where: { isSupplier: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.item.findMany({ where: { isActive: true }, select: { id: true, code: true, nameAr: true, vatRate: true } })]), normalized = command.toLowerCase(), party = matchMention(normalized, parties), item = matchMention(normalized, items.map((row) => ({ ...row, unifiedNumber: row.code }))), quantity = commandQuantity(command), unitPrice = commandPrice(command);
    if (!party || !item || quantity <= 0 || unitPrice < 0) throw new AssistantError("لم أستطع تحديد المورد والمادة والكمية والسعر بثقة.", 400, "COMMAND_NEEDS_REVIEW");
    const payload = { documentType: "PURCHASE_ORDER", documentDate: new Date().toISOString(), partyId: party.id, partyName: party.nameAr, currency: "SAR", notes: `أُعد بواسطة NETAJ ONE بعد مراجعة المستخدم: ${command}`, items: [{ itemId: item.id, itemName: item.nameAr, lineType: "ITEM", quantity, unitPrice, discount: 0, vatRate: Number(item.vatRate) }] };
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "PURCHASE_WORKFLOW_DRAFT", conversationId: conversation.id, payload }, context);
  }
  if (/(سند\s*(?:قبض|صرف)|ادفع|إدفع|استلم|payment|receipt)/i.test(command)) {
    if (!context.enabledModules.has("ACCOUNTING") || !context.permissions.has("ACCOUNTING.CREATE")) throw new AssistantError("لا تملك صلاحية إنشاء سند مالي", 403, "ASSISTANT_ACTION_DENIED");
    const receipt = /(قبض|استلم|receipt)/i.test(command), [parties, banks] = await Promise.all([tx.party.findMany({ where: receipt ? { isCustomer: true, isActive: true } : { isSupplier: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.bankAccount.findMany({ where: { isActive: true }, select: { id: true, name: true, bankName: true, currency: true } })]), normalized = command.toLowerCase(), party = matchMention(normalized, parties), bank = banks.sort((a, b) => Math.max(b.name.length, b.bankName?.length ?? 0) - Math.max(a.name.length, a.bankName?.length ?? 0)).find((row) => normalized.includes(row.name.toLowerCase()) || Boolean(row.bankName && normalized.includes(row.bankName.toLowerCase()))), amount = commandMoney(command);
    if (!party || !bank || amount <= 0) throw new AssistantError("لم أستطع تحديد الجهة والبنك والمبلغ بثقة.", 400, "COMMAND_NEEDS_REVIEW");
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "FINANCIAL_VOUCHER_DRAFT", conversationId: conversation.id, payload: { voucherType: receipt ? "CUSTOMER_RECEIPT" : "SUPPLIER_PAYMENT", voucherDate: new Date().toISOString(), partyId: party.id, partyName: party.nameAr, bankAccountId: bank.id, bankName: bank.name, amount, currency: bank.currency, paymentMethod: "BANK", description: `أُعد بواسطة NETAJ ONE بعد مراجعة المستخدم: ${command}` } }, context);
  }
  if (/(بعنا|بيع|sales?|sell)/i.test(command)) {
    if (!context.enabledModules.has("SALES") || !context.permissions.has("SALES.CREATE")) throw new AssistantError("لا تملك صلاحية إنشاء مبيعات", 403, "ASSISTANT_ACTION_DENIED");
    const [parties, items] = await Promise.all([tx.party.findMany({ where: { isCustomer: true, isActive: true }, select: { id: true, nameAr: true, unifiedNumber: true } }), tx.item.findMany({ where: { isActive: true }, select: { id: true, code: true, nameAr: true, vatRate: true } })]);
    const normalized = command.toLowerCase(), party = matchMention(normalized, parties), item = matchMention(normalized, items.map((row) => ({ ...row, unifiedNumber: row.code }))), quantity = commandQuantity(command), unitPrice = commandPrice(command);
    if (!party || !item || quantity <= 0 || unitPrice < 0) throw new AssistantError("لم أستطع تحديد العميل والمادة والكمية والسعر بثقة. اذكر أسماءها كما تظهر في النظام.", 400, "COMMAND_NEEDS_REVIEW");
    const payload = { documentType: "SALES_ORDER", documentDate: new Date().toISOString(), partyId: party.id, partyName: party.nameAr, currency: "SAR", notes: `أُعد بواسطة NETAJ ONE بعد مراجعة المستخدم: ${command}`, items: [{ itemId: item.id, itemName: item.nameAr, lineType: "ITEM", quantity, unitPrice, discount: 0, vatRate: Number(item.vatRate) }] };
    return saveAssistantProposal(tx, { action: "PROPOSE", actionType: "SALES_WORKFLOW_DRAFT", conversationId: conversation.id, payload }, context);
  }
  throw new AssistantError("هذا الأمر غير مدعوم كعملية كتابة. استخدم وضع السؤال للتحليلات أو اطلب إضافة عميل/إعداد بيع.", 400, "COMMAND_NOT_SUPPORTED");
}

function matchMention<T extends { nameAr: string; unifiedNumber?: string | null }>(command: string, rows: T[]) { return rows.sort((left, right) => Math.max(right.nameAr.length, right.unifiedNumber?.length ?? 0) - Math.max(left.nameAr.length, left.unifiedNumber?.length ?? 0)).find((row) => command.includes(row.nameAr.toLowerCase()) || Boolean(row.unifiedNumber && command.includes(row.unifiedNumber.toLowerCase()))); }
function commandNumber(value?: string) { return number(value?.replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/,/g, "")); }
function commandQuantity(command: string) { return commandNumber(command.match(/([\d٠-٩۰-۹,.]+)\s*(?:طن|kg|كجم|وحده|وحدة|piece)/i)?.[1]); }
function commandPrice(command: string) { return commandNumber(command.match(/(?:بسعر|سعر|at)\s*([\d٠-٩۰-۹,.]+)/i)?.[1]); }
function commandMoney(command: string) { return commandNumber(command.match(/(?:مبلغ|بقيمة|amount|ادفع|إدفع|استلم)\s*[:\-]?\s*([\d٠-٩۰-۹,.]+)/i)?.[1]); }
