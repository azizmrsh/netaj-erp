import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { DataImportError, parseImportWorkbook } from "@/lib/data-import";
import { getImportTarget, importHeaderFingerprint, suggestImportMapping } from "@/lib/import-definitions";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "UPLOAD" });
    const form = await request.formData(), file = form.get("file"), target = getImportTarget(String(form.get("targetType") ?? ""));
    if (!(file instanceof File) || !target) throw new DataImportError("الملف أو هدف الاستيراد غير صحيح");
    const parsed = parseImportWorkbook(new Uint8Array(await file.arrayBuffer()), file.name), sourceSystemId = Number(form.get("sourceSystemId") || 0) || null;
    const fingerprint = importHeaderFingerprint(parsed.headers);
    const profile = await prisma.importTemplate.findFirst({ where: { targetType: target.key, OR: [{ sourceSystemId, headerFingerprint: fingerprint }, { sourceSystemId, isDefault: true }] }, orderBy: [{ headerFingerprint: "desc" }, { isDefault: "desc" }] });
    const automatic = suggestImportMapping(parsed.headers, target), saved = profile ? JSON.parse(profile.mappingJson) as Record<string, string> : {};
    const mapping = Object.fromEntries(Object.entries({ ...automatic, ...saved }).filter(([, header]) => parsed.headers.includes(header)));
    return NextResponse.json({ filename: file.name, headers: parsed.headers, sheets: parsed.sheets, mapping, fields: target.fields, sampleRows: parsed.rows.slice(0, 5), headerFingerprint: fingerprint, detectedProfile: profile ? { id: profile.id, name: profile.name } : null });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof DataImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error(error); return NextResponse.json({ error: "تعذر تحليل الملف" }, { status: 500 });
  }
}
