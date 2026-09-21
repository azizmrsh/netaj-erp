import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { loadFinancialReport } from "@/lib/financial-report-loader";
import { ReportInputError } from "@/lib/financial-reports";
import { runWithDataScope } from "@/lib/data-scope";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams, report = params.get("report")?.toLowerCase();
    if (!report) return NextResponse.json({ error: "نوع التقرير مطلوب" }, { status: 400 });
    return NextResponse.json(await runWithDataScope(auth, () => loadFinancialReport(report, params)));
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof ReportInputError) return NextResponse.json({ error: error.message }, { status: 400 });
    if (error instanceof Error && error.message === "UNKNOWN_REPORT") return NextResponse.json({ error: "نوع التقرير غير معروف" }, { status: 400 });
    console.error(error); return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إعداد التقرير المالي" }, { status: 500 });
  }
}
