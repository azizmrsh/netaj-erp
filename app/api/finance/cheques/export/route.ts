import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";
import { chequeWorkspace } from "@/lib/cheques";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";
import { chequeError } from "../errors";
export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams, direction = params.get("direction") || undefined, kind = params.get("kind"), format = params.get("format") === "pdf" ? "pdf" : "xlsx", q = params.get("q") || "", status = params.get("status") || "";
    const data = await prisma.$transaction(tx => chequeWorkspace(tx, direction));
    const date = (d: Date) => d.toISOString().slice(0, 10), bank = (id: number) => data.banks.find(row => row.id === id)?.name ?? String(id), party = (id: number) => data.parties.find(row => row.id === id)?.nameAr ?? String(id);
    const labels: Record<string, string> = { DRAFT: "مسودة", ISSUED: "صادر", RECEIVED: "مستلم", DEPOSITED: "تحت التحصيل", CLEARED: "تم الصرف/التحصيل", RETURNED: "مرتجع", CANCELLED: "ملغي", STOPPED: "موقوف" };
    const table: ReportTable = kind === "BOOK" ? { title: "إدارة دفاتر الشيكات", columns: ["الدفتر", "الحساب البنكي", "أول رقم", "آخر رقم", "الإجمالي", "المستخدم", "المحجوز", "الملغي", "المتبقي"], rows: data.books.filter(row => !q || `${row.code} ${bank(row.bankAccountId)}`.includes(q)).map(row => [row.code, bank(row.bankAccountId), row.firstNumber, row.lastNumber, row.total, row.used, row.reserved, row.cancelled, row.remaining]) } : { title: direction === "PAID" ? "الشيكات المدفوعة" : "الشيكات المستلمة", columns: ["الرقم الداخلي", "رقم الشيك", "الحساب البنكي", "الطرف", "التاريخ", "الاستحقاق", "المبلغ", "العملة", "الحالة"], rows: data.cheques.filter(row => (!q || `${row.chequeNumber} ${row.internalNumber} ${party(row.partyId)}`.includes(q)) && (!status || row.status === status)).map(row => [row.internalNumber, row.chequeNumber, bank(row.bankAccountId), party(row.partyId), date(row.issueDate), date(row.dueDate), Number(row.amount), row.currency, labels[row.status]]) };
    if (format === "pdf") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-cheques.xlsx"', "Cache-Control": "no-store" } });
  } catch (error) { return chequeError(error); }
}
