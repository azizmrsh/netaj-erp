import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { createPdf, createXlsx } from "@/lib/financial-export";
import { customReportTable, runCustomReport } from "@/lib/custom-reports";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CONFIG", action: "READ" });
    const { id } = await context.params, definition = await prisma.customReportDefinition.findFirst({ where: { id: Number(id), isActive: true } });
    if (!definition) return NextResponse.json({ error: "التقرير غير موجود" }, { status: 404 });
    const roles = (() => { try { return JSON.parse(definition.roleCodesJson) as string[]; } catch { return []; } })();
    if (definition.visibility === "PRIVATE" && definition.ownerUserId !== auth.userId || definition.visibility === "ROLES" && !roles.some((role) => auth.roleCodes.includes(role))) return NextResponse.json({ error: "التقرير غير موجود" }, { status: 404 });
    const result = await prisma.$transaction((tx) => runCustomReport(tx, definition)), table = customReportTable(definition.name, result), format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx", body = format === "pdf" ? createPdf(table) : createXlsx(table);
    return new Response(new Uint8Array(body), { headers: { "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="custom-${definition.code}.${format}"`, "cache-control": "no-store" } });
  } catch (error) { console.error(error); return NextResponse.json({ error: "تعذر تصدير التقرير" }, { status: 500 }); }
}
