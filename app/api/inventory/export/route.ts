import type { Prisma } from "@prisma/client";
import { authorizeRequest } from "@/lib/api-auth";
import { runWithDataScope } from "@/lib/data-scope";
import { createPdf, createXlsx, type ReportTable } from "@/lib/financial-export";
import { prisma } from "@/lib/prisma";

const ids = (value: string | null) => (value ?? "").split(",").map(Number).filter((id) => Number.isInteger(id) && id > 0);
const boundary = (value: string | null, end = false) => value ? new Date(`${value}${end ? "T23:59:59.999" : "T00:00:00.000"}`) : null;
const csvCell = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "INVENTORY", action: "READ" });
    const params = new URL(request.url).searchParams;
    const view = params.get("view") ?? "movements";
    const format = params.get("format") ?? "xlsx";
    const itemIds = ids(params.get("itemIds")), partyIds = ids(params.get("partyIds"));
    const from = boundary(params.get("from")), to = boundary(params.get("to"), true);
    const movementWhere: Prisma.StockMovementWhereInput = {
      ...(itemIds.length ? { itemId: { in: itemIds } } : {}),
      ...(partyIds.length ? { partyId: { in: partyIds } } : {}),
      ...(from || to ? { movementDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    };
    const table = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, async (): Promise<ReportTable> => {
      const subtitle = `${params.get("from") ?? "البداية"} — ${params.get("to") ?? "اليوم"}`;
      if (view === "company") {
        const rows = await prisma.companyStock.findMany({ where: itemIds.length ? { itemId: { in: itemIds } } : undefined, include: { item: { include: { unit: true, category: true } } }, orderBy: { itemId: "asc" } });
        return { title: "ملخص مخزون الشركة", subtitle, columns: ["الكود", "المادة", "التصنيف", "الوحدة", "الكمية", "متوسط التكلفة", "القيمة"], rows: rows.map((row) => [row.item.code, row.item.nameAr, row.item.category?.nameAr ?? "", row.item.unit.nameAr, Number(row.quantity), Number(row.averageCost), Number(row.quantity) * Number(row.averageCost)]) };
      }
      if (view === "customers") {
        const rows = await prisma.partyStockAccount.findMany({ where: { ...(itemIds.length ? { itemId: { in: itemIds } } : {}), ...(partyIds.length ? { partyId: { in: partyIds } } : {}) }, include: { party: true, item: { include: { unit: true } } }, orderBy: [{ partyId: "asc" }, { itemId: "asc" }] });
        return { title: "مخزون العملاء", subtitle, columns: ["العميل", "الكود", "المادة", "الوحدة", "الكمية", "القيمة التقديرية للوحدة", "القيمة", "الحالة"], rows: rows.map((row) => [row.party.nameAr, row.item.code, row.item.nameAr, row.item.unit.nameAr, Number(row.quantity), Number(row.averageValue), Number(row.quantity) * Number(row.averageValue), Number(row.quantity) < 0 ? "رصيد سالب" : "طبيعي"]) };
      }
      const rows = await prisma.stockMovement.findMany({ where: movementWhere, include: { party: true, item: { include: { unit: true } } }, orderBy: [{ movementDate: "asc" }, { id: "asc" }] });
      if (view === "statement") {
        const openingRows = from ? await prisma.stockMovement.findMany({ where: { ...movementWhere, movementDate: { lt: from } }, include: { party: true, item: { include: { unit: true } } }, orderBy: [{ movementDate: "asc" }, { id: "asc" }] }) : [];
        type Summary = { owner: string; code: string; item: string; unit: string; opening: number; incoming: number; outgoing: number; inValue: number; outValue: number };
        const summary = new Map<string, Summary>();
        const add = (row: typeof rows[number], opening: boolean) => { const key = `${row.ownershipType}:${row.partyId ?? "company"}:${row.itemId}`, current = summary.get(key) ?? { owner: row.party?.nameAr ?? "مخزون الشركة", code: row.item.code, item: row.item.nameAr, unit: row.item.unit.nameAr, opening: 0, incoming: 0, outgoing: 0, inValue: 0, outValue: 0 }; if (opening) current.opening += Number(row.quantityIn) - Number(row.quantityOut); else { current.incoming += Number(row.quantityIn); current.outgoing += Number(row.quantityOut); current.inValue += Number(row.quantityIn) * Number(row.unitCost); current.outValue += Number(row.quantityOut) * Number(row.unitCost); } summary.set(key, current); };
        openingRows.forEach((row) => add(row, true)); rows.forEach((row) => add(row, false));
        return { title: "كشف حركة المخزون للفترة", subtitle, columns: ["الملكية", "الكود", "المادة", "الوحدة", "أول المدة", "الوارد", "الصادر", "آخر المدة", "قيمة الوارد", "قيمة الصادر"], rows: [...summary.values()].map((row) => [row.owner, row.code, row.item, row.unit, row.opening, row.incoming, row.outgoing, row.opening + row.incoming - row.outgoing, row.inValue, row.outValue]) };
      }
      return { title: "سجل حركات المخزون", subtitle, columns: ["رقم الحركة", "التاريخ", "الملكية", "الجهة", "الكود", "المادة", "النوع", "وارد", "صادر", "تكلفة الوحدة", "القيمة", "الرصيد بعد الحركة", "نوع المرجع", "المرجع", "الملاحظات"], rows: rows.map((row) => [row.movementNumber, row.movementDate.toISOString().slice(0, 10), row.ownershipType, row.party?.nameAr ?? "مخزون الشركة", row.item.code, row.item.nameAr, row.movementType, Number(row.quantityIn), Number(row.quantityOut), Number(row.unitCost), Number(row.totalValue), row.balanceAfter == null ? null : Number(row.balanceAfter), row.referenceType ?? "", row.referenceNumber ?? "", row.notes ?? ""]) };
    });
    if (format === "csv") {
      const csv = "\uFEFF" + [table.columns, ...table.rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
      return new Response(csv, { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="inventory-${view}.csv"`, "cache-control": "no-store" } });
    }
    const body = format === "pdf" ? createPdf(table) : createXlsx(table);
    return new Response(new Uint8Array(body), { headers: { "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="inventory-${view}.${format === "pdf" ? "pdf" : "xlsx"}"`, "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "تعذر تصدير المخزون" }, { status: 403 });
  }
}
