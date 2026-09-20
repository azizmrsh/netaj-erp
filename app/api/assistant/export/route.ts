import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { createPdf, createXlsx, type ReportTable } from "@/lib/financial-export";

const dateParam = (value: string | null, fallback: Date) => {
  const parsed = value ? new Date(value) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const report = url.searchParams.get("report") === "purchases" ? "purchases" : "sales";
    const format = url.searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
    const moduleKey = report === "sales" ? "SALES" : "PURCHASES";
    const context = await authorizeRequest(request, { moduleKey, action: "READ" });
    const now = new Date();
    const from = dateParam(url.searchParams.get("from"), new Date(now.getFullYear(), now.getMonth(), 1));
    const to = dateParam(url.searchParams.get("to"), now);
    const table = await prisma.$transaction(async (tx) => {
      if (report === "sales") {
        const rows = await tx.sale.findMany({ where: { tenantId: context.tenantId, companyId: context.companyId, status: "POSTED", invoiceDate: { gte: from, lte: to } }, include: { party: true }, orderBy: { invoiceDate: "asc" } });
        return { title: "NETAJ ERP — Sales", subtitle: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, columns: ["Invoice", "Date", "Customer", "Total", "Status"], rows: rows.map((row) => [row.invoiceNumber, row.invoiceDate.toISOString().slice(0, 10), row.party.nameAr, Number(row.totalAmount), row.status]) } satisfies ReportTable;
      }
      const rows = await tx.purchase.findMany({ where: { tenantId: context.tenantId, companyId: context.companyId, status: "POSTED", purchaseDate: { gte: from, lte: to } }, include: { party: true }, orderBy: { purchaseDate: "asc" } });
      return { title: "NETAJ ERP — Purchases", subtitle: `${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`, columns: ["Purchase", "Date", "Supplier", "Total", "Status"], rows: rows.map((row) => [row.purchaseNumber, row.purchaseDate.toISOString().slice(0, 10), row.party.nameAr, Number(row.totalAmount), row.status]) } satisfies ReportTable;
    });
    const body = format === "pdf" ? createPdf(table) : createXlsx(table);
    return new Response(new Uint8Array(body), { headers: { "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="netaj-${report}.${format}"`, "cache-control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return Response.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
