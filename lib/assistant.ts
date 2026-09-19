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
const money = (value: unknown) => `${number(value).toLocaleString("ar-SA", { maximumFractionDigits: 2 })} ر.س`;

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
      return { answer: data.factory ? `إنتاج المصنع هذا الشهر ${number(data.factory.tons).toLocaleString("ar-SA")} طن، وصافي الربح ${money(data.factory.netProfit)}، وربح الطن ${money(data.factory.profitPerTon)}.` : "لا توجد بيانات مصنع متاحة للفترة.", responseType: "TABLE", data: data.factory ? [data.factory] : [], drillDown: "/reports?report=daily-production" };
    }
    if (intent === "TOP_CUSTOMERS") {
      requireModule(context, "INVENTORY");
      const rows = data.customerActivity.slice(0, 10);
      return { answer: rows[0] ? `أعلى عميل سحبًا هو ${rows[0].partyName} بكمية ${number(rows[0].withdrawals).toLocaleString("ar-SA")}.` : "لا توجد حركات سحب في الفترة.", responseType: "CHART", data: rows, drillDown: "/reports?report=customer-activity" };
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
    if (text(input.actionType).toUpperCase() !== "CRM_TASK" || !context.permissions.has("CRM.CREATE")) throw new AssistantError("الإجراء غير مسموح", 403, "ASSISTANT_ACTION_DENIED");
    const conversationId = Number(input.conversationId);
    const conversation = await tx.assistantConversation.findUnique({ where: { id: conversationId } });
    if (!conversation || conversation.userId !== context.userId) throw new AssistantError("المحادثة غير متاحة", 404, "NOT_FOUND");
    const payload = input.payload as Record<string, unknown>;
    if (!text(payload?.subject)) throw new AssistantError("عنوان المهمة مطلوب");
    return tx.assistantActionProposal.create({ data: { conversationId, userId: context.userId, actionType: "CRM_TASK", previewJson: JSON.stringify({ title: "إنشاء مهمة CRM", subject: text(payload.subject), dueAt: payload.dueAt ?? null }), payloadJson: JSON.stringify(payload), expiresAt: new Date(Date.now() + 15 * 60_000) } });
  }
  const proposal = await tx.assistantActionProposal.findUnique({ where: { id: Number(input.id) } });
  if (!proposal || proposal.userId !== context.userId) throw new AssistantError("المقترح غير موجود", 404, "NOT_FOUND");
  if (proposal.status !== "PENDING" || proposal.expiresAt <= new Date()) throw new AssistantError("انتهت صلاحية المقترح أو تم التعامل معه", 409, "PROPOSAL_CLOSED");
  if (action === "CANCEL") return tx.assistantActionProposal.update({ where: { id: proposal.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  if (action === "EDIT") {
    const payload = input.payload as Record<string, unknown>;
    if (!text(payload?.subject)) throw new AssistantError("عنوان المهمة مطلوب");
    return tx.assistantActionProposal.update({ where: { id: proposal.id }, data: { payloadJson: JSON.stringify(payload), previewJson: JSON.stringify({ title: "إنشاء مهمة CRM", subject: text(payload.subject), dueAt: payload.dueAt ?? null }) } });
  }
  if (action === "CONFIRM") {
    if (!context.permissions.has("CRM.CREATE")) throw new AssistantError("فقدت صلاحية إنشاء المهمة", 403, "ASSISTANT_ACTION_DENIED");
    const payload = JSON.parse(proposal.payloadJson) as Record<string, unknown>;
    const activity = await tx.crmActivity.create({ data: { activityType: "TASK", subject: text(payload.subject), partyId: Number(payload.partyId) || null, assignedUserId: context.userId, dueAt: payload.dueAt ? new Date(String(payload.dueAt)) : null, notes: text(payload.notes) || null } });
    await tx.assistantActionProposal.update({ where: { id: proposal.id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });
    await audit(tx, { action: "ASSISTANT_CONFIRMED_ACTION", entityType: "CRM_ACTIVITY", entityId: activity.id, userId: String(context.userId), metadata: { proposalId: proposal.id } });
    return { proposalId: proposal.id, activity };
  }
  throw new AssistantError("إجراء المقترح غير مدعوم");
}
