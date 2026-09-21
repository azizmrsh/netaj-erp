import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { inventoryBalances, InventoryBalanceError } from "@/lib/inventory-balances";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "INVENTORY", action: "READ" });
    const params = new URL(request.url).searchParams, format = params.get("format");
    if (format && !["xlsx", "print"].includes(format)) throw new InventoryBalanceError("صيغة التصدير غير مدعومة");
    const report = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => inventoryBalances(tx, params)));
    if (!format) return Response.json(report);
    const table: ReportTable = params.get("view") === "movements" ? {
      title: "بطاقة حركة الصنف", subtitle: `${report.company?.legalNameAr ?? "NETAJ"} · ${params.get("from") ?? "البداية"} — ${report.asOf.slice(0, 10)}`,
      columns: ["التاريخ", "الحركة", "الصنف", "الطرف", "النوع", "الوارد", "المنصرف", "الرصيد", "تكلفة الوحدة", "قيمة الحركة", "المرجع"],
      rows: report.movements.map(row => [row.date, row.movementNumber, `${row.itemCode} — ${row.itemName}`, row.partyName, row.movementType, row.incoming, row.outgoing, row.balance, row.unitCost, row.value, row.referenceNumber]),
    } : {
      title: "أرصدة الأصناف", subtitle: `${report.company?.legalNameAr ?? "NETAJ"} · ${params.get("from") ?? "البداية"} — ${report.asOf.slice(0, 10)} · القيم التاريخية من الحركات المسجلة`,
      columns: ["الكود", "الصنف", "التصنيف", "الوحدة", "الملكية", "رصيد أول المدة", "الوارد", "المنصرف", "رصيد نهاية المدة", "قيمة حسب الحركات", ...(report.currentView ? ["الرصيد الحالي", "متوسط التكلفة الحالي", "القيمة الحالية"] : [])],
      rows: report.rows.map(row => [row.itemCode, row.itemName, row.categoryName, row.unit, row.partyName, row.openingQuantity, row.incoming, row.outgoing, row.closingQuantity, row.closingValue, ...(report.currentView ? [row.currentQuantity, row.currentAverageCost, row.currentStockValue] : [])]),
    };
    if (format === "print") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="netaj-inventory-${params.get("view") === "movements" ? "movements" : "balances"}.xlsx"`, "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return Response.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof InventoryBalanceError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error); return Response.json({ error: "تعذر تحميل أرصدة الأصناف" }, { status: 500 });
  }
}
