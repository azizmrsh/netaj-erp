import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { DataImportError } from "@/lib/data-import";
import { prisma } from "@/lib/prisma";

function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof DataImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error); return NextResponse.json({ error: "تعذر إدارة أنظمة المصدر" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "READ" });
    return NextResponse.json(await prisma.legacySourceSystem.findMany({ include: { _count: { select: { batches: true, templates: true } } }, orderBy: { name: "asc" } }));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "IMPORT", action: "MANAGE" });
    const body = await request.json() as { code?: unknown; name?: unknown; vendor?: unknown; version?: unknown; description?: unknown };
    const code = String(body.code ?? "").trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "_"), name = String(body.name ?? "").trim();
    if (!code || !name) throw new DataImportError("الكود والاسم مطلوبان");
    const result = await prisma.legacySourceSystem.create({ data: { code, name, vendor: String(body.vendor ?? "").trim() || null, version: String(body.version ?? "").trim() || null, description: String(body.description ?? "").trim() || null, createdBy: String(auth.userId) } });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function PATCH(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "MANAGE" });
    const body = await request.json() as { id?: unknown; name?: unknown; vendor?: unknown; version?: unknown; description?: unknown; isActive?: unknown };
    const id = Number(body.id), name = String(body.name ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !name) throw new DataImportError("بيانات نظام المصدر غير مكتملة");
    const updated = await prisma.legacySourceSystem.updateMany({ where: { id }, data: { name, vendor: String(body.vendor ?? "").trim() || null, version: String(body.version ?? "").trim() || null, description: String(body.description ?? "").trim() || null, isActive: body.isActive !== false } });
    if (!updated.count) throw new DataImportError("نظام المصدر غير موجود", "NOT_FOUND", 404);
    return NextResponse.json(await prisma.legacySourceSystem.findFirst({ where: { id } }));
  } catch (error) { return failure(error); }
}
