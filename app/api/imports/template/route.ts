import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { createXlsx } from "@/lib/financial-export";
import { getImportTarget } from "@/lib/import-definitions";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "READ" });
    const target = getImportTarget(new URL(request.url).searchParams.get("target") ?? "");
    if (!target) return NextResponse.json({ error: "هدف القالب غير مدعوم" }, { status: 400 });
    const body = createXlsx({
      title: `قالب استيراد ${target.labelAr}`,
      subtitle: "لا تغيّر عناوين الأعمدة. الحقول التي تحمل علامة * مطلوبة.",
      columns: target.fields.map((field) => `${field.labelAr}${field.required ? " *" : ""}`),
      rows: [target.fields.map((field) => field.type === "date" ? "2026-01-31" : field.type === "number" ? 0 : field.type === "boolean" ? "نعم" : "")],
    });
    return new Response(new Uint8Array(body), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="netaj-import-${target.key.toLowerCase()}.xlsx"`,
      "cache-control": "no-store",
    } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر إنشاء قالب الاستيراد" }, { status: 500 });
  }
}

