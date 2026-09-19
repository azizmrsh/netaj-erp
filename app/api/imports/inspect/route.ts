import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { DataImportError, parseImportWorkbook } from "@/lib/data-import";
import { getImportTarget, suggestImportMapping } from "@/lib/import-definitions";

export async function POST(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "UPLOAD" });
    const form = await request.formData(), file = form.get("file"), target = getImportTarget(String(form.get("targetType") ?? ""));
    if (!(file instanceof File) || !target) throw new DataImportError("الملف أو هدف الاستيراد غير صحيح");
    const parsed = parseImportWorkbook(new Uint8Array(await file.arrayBuffer()), file.name);
    return NextResponse.json({ filename: file.name, headers: parsed.headers, sheets: parsed.sheets, mapping: suggestImportMapping(parsed.headers, target), fields: target.fields, sampleRows: parsed.rows.slice(0, 5) });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof DataImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error(error); return NextResponse.json({ error: "تعذر تحليل الملف" }, { status: 500 });
  }
}

