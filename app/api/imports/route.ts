import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { createImportPreview, DataImportError, importCatalog, serializeBatch } from "@/lib/data-import";
import { getImportTarget } from "@/lib/import-definitions";
import { prisma } from "@/lib/prisma";

function errorResponse(error: unknown) {
  if (error instanceof AuthError) {
    const value = authErrorResponse(error);
    return NextResponse.json({ error: value.message, code: value.code }, { status: value.status });
  }
  if (error instanceof DataImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error);
  return NextResponse.json({ error: "تعذر تنفيذ عملية الاستيراد" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "READ" });
    const [batches, templates, sourceSystems] = await Promise.all([
      prisma.importBatch.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
      prisma.importTemplate.findMany({ orderBy: [{ targetType: "asc" }, { name: "asc" }] }),
      prisma.legacySourceSystem.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ catalog: importCatalog(), batches: batches.map((batch) => serializeBatch(batch)), templates: templates.map((template) => ({ ...template, mapping: JSON.parse(template.mappingJson) })), sourceSystems });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "IMPORT", action: "UPLOAD" });
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "PREVIEW" });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DataImportError("اختر ملفًا صالحًا");
    const targetType = String(form.get("targetType") ?? "").toUpperCase();
    const target = getImportTarget(targetType);
    if (!target) throw new DataImportError("هدف الاستيراد غير مدعوم");
    if (target.accountingSensitive) await authorizeRequest(request, { moduleKey: "IMPORT", action: "ACCOUNTING_IMPORT" });
    let mapping: Record<string, string> | undefined;
    const mappingText = String(form.get("mapping") ?? "").trim();
    if (mappingText) {
      try { mapping = JSON.parse(mappingText) as Record<string, string>; }
      catch { throw new DataImportError("خريطة الأعمدة غير صالحة"); }
    }
    const sourceSystemId = Number(form.get("sourceSystemId") || 0) || null;
    const sourceSystem = sourceSystemId ? await prisma.legacySourceSystem.findFirst({ where: { id: sourceSystemId, isActive: true } }) : null;
    if (sourceSystemId && !sourceSystem) throw new DataImportError("نظام المصدر غير موجود", "SOURCE_NOT_FOUND", 404);
    const cutoverText = String(form.get("cutoverDate") ?? "").trim();
    const cutoverDate = cutoverText ? new Date(cutoverText) : null;
    if (cutoverDate && Number.isNaN(cutoverDate.getTime())) throw new DataImportError("تاريخ التحول غير صالح");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const result = await prisma.$transaction((tx) => createImportPreview(tx, {
      bytes, filename: file.name, targetType, importMode: String(form.get("importMode") ?? "FULL").toUpperCase(),
      duplicateStrategy: String(form.get("duplicateStrategy") ?? "SKIP").toUpperCase(), mapping, createdBy: String(auth.userId), sourceSystemId,
      legacySystem: sourceSystem?.code ?? "GENERIC", cutoverDate,
    }), { timeout: 120_000 });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
