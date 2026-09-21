import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { createXlsx, toReportTable } from "@/lib/financial-export";
import { loadFinancialReport } from "@/lib/financial-report-loader";
import { ReportInputError } from "@/lib/financial-reports";
import { buildPrintableReportHtml } from "@/lib/printable-report";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams, report = String(params.get("report") ?? "").toLowerCase(), format = String(params.get("format") ?? "xlsx").toLowerCase();
    if (!report || !["xlsx", "pdf", "print"].includes(format)) return Response.json({ error: "صيغة أو نوع التقرير غير صحيح" }, { status: 400 });
    const data = await runWithDataScope(auth, () => loadFinancialReport(report, params));
    const [company, branch, account, center] = await runWithDataScope(auth, () => Promise.all([
      prisma.company.findUniqueOrThrow({ where: { id: auth.companyId }, select: { legalNameAr: true, baseCurrencyCode: true } }),
      params.get("branchId") ? prisma.branch.findFirst({ where: { id: Number(params.get("branchId")), companyId: auth.companyId } }) : null,
      params.get("accountId") ? prisma.account.findUnique({ where: { id: Number(params.get("accountId")) } }) : null,
      params.get("costCenterId") ? prisma.costCenter.findUnique({ where: { id: Number(params.get("costCenterId")) } }) : null,
    ]));
    const period = report === "balance-sheet" || report.endsWith("-aging") ? `حتى ${params.get("to")?.slice(0, 10) || "اليوم"}` : report === "budget-vs-actual" ? "حسب فترات الميزانية المختارة" : `${params.get("from")?.slice(0, 10) || "من البداية"} — ${params.get("to")?.slice(0, 10) || "حتى اليوم"}`;
    const context = [company.legalNameAr, `العملة: ${company.baseCurrencyCode}`, period, branch ? `الفرع: ${branch.nameAr}` : "كل الفروع، ويشمل غير المعيّن", account ? `الحساب: ${account.code} — ${account.nameAr}${params.get("includeChildren") === "1" ? " والتابعة" : ""}` : "", center ? `مركز التكلفة: ${center.nameAr}` : "", params.get("level") ? `مستوى التجميع: ${params.get("level")}` : ""].filter(Boolean).join(" · ");
    const table = toReportTable(report, data, context);
    if (format === "print" || format === "pdf") {
      const reportTitles: Record<string, string> = { "trial-balance": "ميزان المراجعة", "profit-and-loss": "قائمة الدخل", "balance-sheet": "المركز المالي", "cash-flow": "قائمة التدفقات النقدية", "general-ledger": "دفتر الأستاذ", "account-statement": "كشف الحساب", "ar-aging": "أعمار ذمم العملاء", "ap-aging": "أعمار ذمم الموردين", "changes-in-equity": "التغيرات في حقوق الملكية", vat: "ضريبة القيمة المضافة", "budget-vs-actual": "الميزانية مقابل الفعلي" };
      const title = reportTitles[report] ?? table.title;
      return new Response(buildPrintableReportHtml({ ...table, title }), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    }
    const body = createXlsx(table);
    return new Response(new Uint8Array(body), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="netaj-${report}-${new Date().toISOString().slice(0, 10)}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return Response.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof ReportInputError) return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "UNKNOWN_REPORT") return Response.json({ error: "نوع التقرير غير معروف" }, { status: 400 });
    console.error(error); return Response.json({ error: error instanceof Error ? error.message : "تعذر تصدير التقرير" }, { status: 500 });
  }
}
