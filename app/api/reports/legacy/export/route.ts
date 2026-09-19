import { createPdf, createXlsx } from "@/lib/financial-export";
import { legacyReportTable } from "@/lib/legacy-report-export";
import { analyticsRange, loadLegacyReport } from "@/lib/analytics";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
const modules: Record<string, string> = { "daily-production": "FACTORY", "material-profitability": "ACCOUNTING", "monthly-comparison": "ACCOUNTING", "customer-activity": "INVENTORY", "customer-raw-balances": "INVENTORY", reconciliation: "ACCOUNTING", payroll: "HR", "driver-advances": "TRANSPORT", "driver-expenses": "TRANSPORT", attendance: "HR", "customer-vehicle": "TRANSPORT", "equipment-readings": "FACTORY" };
export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams, report = params.get("report") ?? "daily-production", format = params.get("format") === "pdf" ? "pdf" : "xlsx", range = analyticsRange(params); await authorizeRequest(request, { moduleKey: modules[report] ?? "CORE", action: "READ" }); const data = await prisma.$transaction((tx) => loadLegacyReport(tx, report, range, params)), table = legacyReportTable(report, data, `${range.from.toISOString().slice(0, 10)} to ${range.to.toISOString().slice(0, 10)}`), body = format === "pdf" ? createPdf(table) : createXlsx(table); return new Response(new Uint8Array(body), { headers: { "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="netaj-${report}.${format}"`, "cache-control": "no-store" } }); }
  catch (error) { if (error instanceof AuthError) { const r = authErrorResponse(error); return Response.json({ error: r.message, code: r.code }, { status: r.status }); } return Response.json({ error: error instanceof Error ? error.message : "تعذر تصدير التقرير" }, { status: 400 }); }
}
