import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getVerifiedDataScope, runWithDataScope } from "@/lib/data-scope";
import { CostCenterError, costCenterReport, costCenterWorkspace, saveCostCenter } from "@/lib/cost-centers";
import { createXlsx, type ReportTable } from "@/lib/financial-export";

export const runtime = "nodejs";
function fail(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof CostCenterError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "رمز مركز التكلفة مستخدم؛ اختر رمزًا آخر" }, { status: 409 });
  console.error(error);
  return NextResponse.json({ error: "تعذر معالجة مراكز التكلفة" }, { status: 500 });
}
const escape = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function exportTable(table: ReportTable, format: string) {
  if (format === "xlsx") return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-cost-centers.xlsx"', "Cache-Control": "no-store" } });
  // Browser typesetting preserves Arabic and selectable text when saving as PDF.
  return new Response(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escape(table.title)}</title><style>body{font-family:Tahoma,Arial,sans-serif;color:#172337;margin:28px}h1{color:#997126;font-size:22px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #dfd5c0;padding:7px;text-align:right}th{background:#f1e8d7}thead{display:table-header-group}tr{break-inside:avoid}button{padding:10px 20px;background:#c59a45;border:0;border-radius:8px;margin:12px 0}@media print{button{display:none}@page{size:A4 landscape;margin:12mm}}</style></head><body><h1>${escape(table.title)}</h1><p>${escape(table.subtitle)}</p><button onclick="window.print()">طباعة / حفظ PDF</button><table><thead><tr>${table.columns.map(value => `<th>${escape(value)}</th>`).join("")}</tr></thead><tbody>${table.rows.map(row => `<tr>${row.map(value => `<td>${escape(value)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, async () => {
      const params = new URL(request.url).searchParams, format = params.get("format");
      if (format && !["xlsx", "print"].includes(format)) throw new CostCenterError("صيغة التصدير غير مدعومة");
      if (params.has("entryId")) {
        const id = Number(params.get("entryId"));
        if (!Number.isSafeInteger(id) || id < 1) throw new CostCenterError("رقم القيد غير صحيح");
        const scope = await getVerifiedDataScope();
        const entry = await prisma.journalEntry.findFirst({ where: { ...scope, id, status: { in: ["POSTED", "REVERSED"] } }, include: { lines: true } });
        if (!entry) throw new CostCenterError("القيد غير موجود", 404);
        return NextResponse.json(entry);
      }
      if (params.get("view") === "detail") {
        const report = await prisma.$transaction(tx => costCenterReport(tx, params));
        if (format) return exportTable({ title: "مركز التكلفة التفصيلي", subtitle: `${report.company?.nameAr ?? "NETAJ"} • ${params.get("from") ?? "البداية"} — ${params.get("to") ?? "اليوم"} • ${report.company?.baseCurrencyCode ?? ""}`,
          columns: ["المركز", "الاسم", "التاريخ", "القيد", "الحساب", "اسم الحساب", "البيان", "مدين", "دائن", "الرصيد"],
          rows: [...report.rows.map(row => [row.centerCode, row.centerName, row.date, row.entryNumber, row.accountCode, row.accountName, row.description, row.debit, row.credit, row.balance]), ["الإجمالي", "", "", "", "", "", "", report.totals.debit, report.totals.credit, report.totals.closing]],
        }, format);
        return NextResponse.json(report);
      }
      const data = await prisma.$transaction(costCenterWorkspace);
      if (format) {
        const q = (params.get("q") ?? "").toLocaleLowerCase(), branch = params.get("branchId"), status = params.get("status");
        const rows = data.rows.filter(row => (!q || `${row.code} ${row.nameAr} ${row.nameEn ?? ""}`.toLocaleLowerCase().includes(q)) && (!branch || row.branchId === Number(branch)) && (!status || row.isActive === (status === "active")));
        return exportTable({ title: "مراكز التكلفة", subtitle: data.company?.nameAr ?? "NETAJ", columns: ["الرمز", "الاسم العربي", "الاسم الإنجليزي", "المركز الأب", "المستوى", "الفرع", "نوع المركز", "قيد مباشر", "الحالة"],
          rows: rows.map(row => [row.code, row.nameAr, row.nameEn, row.parentName, row.level, row.branchName ?? "كل الفروع", row.centerType, row.allowPosting ? "مسموح" : "ممنوع", row.isActive ? "نشط" : "موقوف"]) }, format);
      }
      return NextResponse.json(data);
    });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" });
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input) || input.id != null) throw new CostCenterError("بيانات المركز الجديد غير صحيحة");
    const row = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => saveCostCenter(tx, input, String(auth.userId))));
    return NextResponse.json(row, { status: 201 });
  } catch (error) { return fail(error); }
}
export async function PATCH(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "UPDATE" });
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input) || !Number.isSafeInteger(Number(input.id)) || Number(input.id) < 1) throw new CostCenterError("حدد مركز التكلفة لتعديله");
    const row = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => saveCostCenter(tx, input, String(auth.userId))));
    return NextResponse.json(row);
  } catch (error) { return fail(error); }
}
