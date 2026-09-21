import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { AssetError, assetWorkspace, saveAsset } from "@/lib/assets";
import { AccountingError } from "@/lib/accounting";
import { CostCenterError } from "@/lib/cost-centers";
import { prisma } from "@/lib/prisma";
import { runWithDataScope } from "@/lib/data-scope";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";

const fail = (error: unknown) => {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof AssetError || error instanceof CostCenterError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof AccountingError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(error);
  return NextResponse.json({ error: "تعذر معالجة الأصول" }, { status: 500 });
};
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ASSETS", action: "READ" });
    const scope = { tenantId: auth.tenantId, companyId: auth.companyId }, params = new URL(request.url).searchParams;
    return await runWithDataScope(scope, async () => {
      if (params.get("view") !== "depreciation") return NextResponse.json(await prisma.$transaction(assetWorkspace));
      const [assets, company] = await Promise.all([
        prisma.asset.findMany({ where: scope, include: { category: true, depreciations: { orderBy: { periodDate: "desc" } } }, orderBy: { assetNumber: "asc" } }),
        prisma.company.findFirst({ where: { tenantId: auth.tenantId, id: auth.companyId }, select: { legalNameAr: true, baseCurrencyCode: true } }),
      ]);
      const format = params.get("format"), q = (params.get("q") ?? "").toLocaleLowerCase();
      if (format) {
        if (!["print", "xlsx"].includes(format)) throw new AssetError("صيغة التصدير غير مدعومة");
        const table: ReportTable = { title: "إهلاكات الأصول", subtitle: `${company?.legalNameAr ?? "NETAJ"} · ${company?.baseCurrencyCode ?? ""}`,
          columns: ["رقم الأصل", "الاسم", "تاريخ الاقتناء", "التكلفة", "القيمة التخريدية", "العمر بالأشهر", "مجمع الإهلاك", "القيمة الدفترية", "الحالة"],
          rows: assets.filter(row => !q || `${row.assetNumber} ${row.name}`.toLocaleLowerCase().includes(q)).map(row => [row.assetNumber, row.name, row.acquisitionDate.toISOString().slice(0, 10), Number(row.acquisitionCost), Number(row.residualValue), row.category.usefulLifeMonths, Number(row.accumulatedDepreciation), Number(row.acquisitionCost) - Number(row.accumulatedDepreciation), row.status]) };
        if (format === "print") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
        return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-depreciation.xlsx"', "Cache-Control": "no-store" } });
      }
      return NextResponse.json({ assets, company });
    });
  } catch (error) { return fail(error); }
}
async function mutate(request: Request, defaultAction: "CREATE" | "UPDATE") {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new AssetError("بيانات الطلب غير صحيحة");
    const auth = await authorizeRequest(request, { moduleKey: "ASSETS", action: String(body.action).toUpperCase() === "DEPRECIATE" ? "POST" : defaultAction });
    const scope = { tenantId: auth.tenantId, companyId: auth.companyId };
    const data = await runWithDataScope(scope, () => prisma.$transaction(tx => saveAsset(tx, { ...body, ...scope }, String(auth.userId))));
    return NextResponse.json(data, { status: defaultAction === "CREATE" ? 201 : 200 });
  } catch (error) { return fail(error); }
}
export async function POST(request: Request) { return mutate(request, "CREATE"); }
export async function PATCH(request: Request) { return mutate(request, "UPDATE"); }
