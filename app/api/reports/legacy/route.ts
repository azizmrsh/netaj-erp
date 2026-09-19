import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { analyticsRange, AnalyticsError, loadLegacyReport } from "@/lib/analytics";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

const modules: Record<string, string> = { "daily-production": "FACTORY", "material-profitability": "ACCOUNTING", "monthly-comparison": "ACCOUNTING", "customer-activity": "INVENTORY", "customer-raw-balances": "INVENTORY", reconciliation: "ACCOUNTING", payroll: "HR", "driver-advances": "TRANSPORT", "driver-expenses": "TRANSPORT", attendance: "HR", "customer-vehicle": "TRANSPORT", "equipment-readings": "FACTORY" };
export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams, report = params.get("report") ?? "daily-production"; await authorizeRequest(request, { moduleKey: modules[report] ?? "CORE", action: "READ" }); const [data,items,parties,drivers]=await Promise.all([prisma.$transaction((tx) => loadLegacyReport(tx, report, analyticsRange(params), params)),prisma.item.findMany({where:{isActive:true},select:{id:true,code:true,nameAr:true},orderBy:{nameAr:"asc"}}),prisma.party.findMany({where:{isActive:true,isCustomer:true},select:{id:true,nameAr:true},orderBy:{nameAr:"asc"}}),prisma.driver.findMany({where:{status:"ACTIVE"},select:{id:true,name:true},orderBy:{name:"asc"}})]); return NextResponse.json({...data,options:{items,parties,drivers}}); }
  catch (error) { if (error instanceof AuthError) { const r = authErrorResponse(error); return NextResponse.json({ error: r.message, code: r.code }, { status: r.status }); } return NextResponse.json({ error: error instanceof AnalyticsError ? error.message : "تعذر تحميل التقرير" }, { status: 400 }); }
}
