import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyticsRange, AnalyticsError, loadExecutiveDashboard } from "@/lib/analytics";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "CORE", action: "READ" });
    const params = new URL(request.url).searchParams, range = analyticsRange(params), inactiveDays = Math.min(Math.max(Number(params.get("inactiveDays")) || 60, 1), 3650);
    const enabledModules = new Set([...context.companyModules.entries()].filter(([key, enabled]) => enabled && context.permissions.has(`${key}.READ`)).map(([key]) => key));
    return NextResponse.json(await prisma.$transaction((tx) => loadExecutiveDashboard(tx, range, enabledModules, inactiveDays)));
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    if (error instanceof AnalyticsError) return NextResponse.json({ error: error.message, code: "INVALID_ANALYTICS_RANGE" }, { status: 400 });
    const details = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error("[analytics] executive dashboard failed", error);
    return NextResponse.json({ error: "تعذر تحميل التحليلات", code: "ANALYTICS_INTERNAL_ERROR", ...(process.env.NODE_ENV !== "production" ? { details } : {}) }, { status: 500 });
  }
}
