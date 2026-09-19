import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { DataImportError } from "@/lib/data-import";
import { getImportTarget } from "@/lib/import-definitions";
import { prisma } from "@/lib/prisma";

function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof DataImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error); return NextResponse.json({ error: "تعذر حفظ قالب الربط" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "IMPORT", action: "MANAGE" });
    const body = await request.json() as { targetType?: unknown; name?: unknown; mapping?: unknown; isDefault?: unknown };
    const target = getImportTarget(String(body.targetType ?? "")), name = String(body.name ?? "").trim();
    if (!target || !name || !body.mapping || typeof body.mapping !== "object" || Array.isArray(body.mapping)) throw new DataImportError("بيانات القالب غير مكتملة");
    const result = await prisma.importTemplate.upsert({
      where: { tenantId_companyId_targetType_name: { tenantId: auth.tenantId, companyId: auth.companyId, targetType: target.key, name } },
      create: { targetType: target.key, name, mappingJson: JSON.stringify(body.mapping), isDefault: Boolean(body.isDefault), createdBy: String(auth.userId) },
      update: { mappingJson: JSON.stringify(body.mapping), isDefault: Boolean(body.isDefault) },
    });
    return NextResponse.json({ ...result, mapping: JSON.parse(result.mappingJson) }, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "MANAGE" });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) throw new DataImportError("معرف القالب غير صحيح");
    const deleted = await prisma.importTemplate.deleteMany({ where: { id } });
    if (!deleted.count) throw new DataImportError("القالب غير موجود", "NOT_FOUND", 404);
    return NextResponse.json({ deleted: true });
  } catch (error) { return failure(error); }
}

