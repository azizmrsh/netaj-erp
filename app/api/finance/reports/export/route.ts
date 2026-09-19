import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { createPdf, createXlsx, toReportTable } from "@/lib/financial-export";
import { loadFinancialReport } from "@/lib/financial-report-loader";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams, report = String(params.get("report") ?? "").toLowerCase(), format = String(params.get("format") ?? "xlsx").toLowerCase();
    if (!report || !["xlsx", "pdf"].includes(format)) return Response.json({ error: "صيغة أو نوع التقرير غير صحيح" }, { status: 400 });
    const data = await loadFinancialReport(report, params);
    const period = [params.get("from"), params.get("to")].filter(Boolean).join(" - ");
    const table = toReportTable(report, data, period || undefined);
    const body = format === "xlsx" ? createXlsx(table) : createPdf(table);
    return new Response(body, { headers: { "Content-Type": format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "application/pdf",
      "Content-Disposition": `attachment; filename="netaj-${report}-${new Date().toISOString().slice(0, 10)}.${format}"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return Response.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof Error && error.message === "UNKNOWN_REPORT") return Response.json({ error: "نوع التقرير غير معروف" }, { status: 400 });
    console.error(error); return Response.json({ error: error instanceof Error ? error.message : "تعذر تصدير التقرير" }, { status: 500 });
  }
}
