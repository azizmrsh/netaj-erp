import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { AccountingError } from "@/lib/accounting";
import { runWithDataScope } from "@/lib/data-scope";
import { createProfitDistribution, PartnerError, partnerOverview, postProfitDistribution, savePartner } from "@/lib/partners";
import { prisma } from "@/lib/prisma";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams;
    const data = await runWithDataScope(auth, () => prisma.$transaction(tx => partnerOverview(tx, params)));
    const format = params.get("format");
    if (format) {
      if (!["xlsx", "print"].includes(format)) throw new PartnerError("صيغة التصدير غير صحيحة");
      const partner = data.partners.find(row => row.id === Number(params.get("partnerId")));
      if (params.get("partnerId") && !partner) throw new PartnerError("الشريك المطلوب غير موجود", 404);
      const table: ReportTable = partner ? { title: `كشف جاري الشريك — ${partner.name}`, subtitle: `الرصيد الافتتاحي ${partner.openingBalance} — العملة ${data.currency}`, columns: ["التاريخ", "القيد", "البيان", "مدين", "دائن", "الرصيد"], rows: [...partner.movements.map(row => [row.date.toISOString().slice(0, 10), row.entryNumber, row.description, row.debit, row.credit, row.balance]), ["", "", "رصيد نهاية الفترة", null, null, partner.closingBalance]] }
        : params.get("mode") === "distributions" ? { title: "توزيع الأرباح", columns: ["القرار", "التاريخ", "المرجع", "الحالة", "الشريك", "النسبة", "المبلغ"], rows: data.distributions.flatMap(row => row.lines.map(line => [row.number, row.distributionDate.slice(0, 10), row.decisionNumber, row.status === "POSTED" ? "مرحّل" : "مسودة", line.partnerName, line.percent, Number(line.amount)])) }
        : { title: "جاري الشركاء", subtitle: `العملة ${data.currency}`, columns: ["الرمز", "الشريك", "الملكية %", "رأس المال", "أول الفترة", "أرباح موزعة", "آخر الفترة"], rows: data.partners.map(row => [row.code, row.name, row.ownershipPercent, row.capitalBalance, row.openingBalance, row.distributedProfits, row.closingBalance]) };
      if (format === "print") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-partners.xlsx"', "Cache-Control": "no-store" } });
    }
    return Response.json(data);
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const input = await request.json() as Record<string, unknown>;
    const action = String(input.action ?? "SAVE_PARTNER");
    if (!["SAVE_PARTNER", "CREATE_DISTRIBUTION", "POST_DISTRIBUTION"].includes(action)) throw new PartnerError("إجراء الشركاء غير معروف");
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "POST_DISTRIBUTION" ? "APPROVE" : action === "SAVE_PARTNER" ? "MANAGE" : "CREATE" });
    const data = await runWithDataScope(auth, () => prisma.$transaction(async tx => {
      if (action === "SAVE_PARTNER") return savePartner(tx, input, String(auth.userId));
      if (action === "CREATE_DISTRIBUTION") return createProfitDistribution(tx, input, String(auth.userId));
      const id = Number(input.id);
      if (!Number.isInteger(id) || id < 1) throw new PartnerError("رقم قرار التوزيع غير صحيح");
      return postProfitDistribution(tx, id, String(auth.userId));
    }));
    return Response.json(data, { status: action === "CREATE_DISTRIBUTION" ? 201 : 200 });
  } catch (error) { return failure(error); }
}
function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return Response.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof PartnerError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof AccountingError) return Response.json({ error: error.message }, { status: 400 });
  console.error(error);
  return Response.json({ error: "تعذر معالجة حسابات الشركاء" }, { status: 500 });
}
