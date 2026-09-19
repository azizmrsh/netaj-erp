import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { customReportCatalog, CustomReportError, runCustomReport, saveCustomReport } from "@/lib/custom-reports";
import { prisma } from "@/lib/prisma";

function failure(error: unknown) { if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); } if (error instanceof CustomReportError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error(error); return NextResponse.json({ error: "تعذر تشغيل منشئ التقارير" }, { status: 500 }); }
function visible(row: { visibility: string; ownerUserId: number | null; roleCodesJson: string }, userId: number, roleCodes: string[]) { if (row.visibility === "COMPANY") return true; if (row.visibility === "PRIVATE") return row.ownerUserId === userId; try { return (JSON.parse(row.roleCodesJson) as string[]).some((role) => roleCodes.includes(role)); } catch { return false; } }

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CONFIG", action: "READ" }), id = Number(new URL(request.url).searchParams.get("id"));
    if (Number.isInteger(id) && id > 0) {
      const definition = await prisma.customReportDefinition.findFirst({ where: { id, isActive: true } });
      if (!definition || !visible(definition, auth.userId, auth.roleCodes)) return NextResponse.json({ error: "التقرير غير موجود" }, { status: 404 });
      const result = await prisma.$transaction((tx) => runCustomReport(tx, definition)); return NextResponse.json({ definition, result });
    }
    const definitions = (await prisma.customReportDefinition.findMany({ where: { isActive: true }, orderBy: { updatedAt: "desc" } })).filter((row) => visible(row, auth.userId, auth.roleCodes));
    return NextResponse.json({ catalog: customReportCatalog(), definitions });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CONFIG", action: "CREATE" }), body = await request.json() as Record<string, unknown>;
    const definition = await prisma.$transaction((tx) => saveCustomReport(tx, { ...body, tenantId: auth.tenantId, companyId: auth.companyId }, auth.userId));
    const result = await prisma.$transaction((tx) => runCustomReport(tx, definition)); return NextResponse.json({ definition, result }, { status: 201 });
  } catch (error) { return failure(error); }
}

