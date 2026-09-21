import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";
import { recurringError } from "../errors";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams, q = params.get("q")?.trim(), status = params.get("status");
    const format = params.get("format") === "pdf" ? "pdf" : "xlsx";
    const rows = await prisma.recurringJournal.findMany({ where: { ...(status ? { status } : {}), ...(q ? { OR: [{ code: { contains: q } }, { name: { contains: q } }] } : {}) }, include: { lines: true }, orderBy: { id: "desc" } });
    const labels: Record<string, string> = { DAILY: "يومي", WEEKLY: "أسبوعي", MONTHLY: "شهري", QUARTERLY: "ربع سنوي", YEARLY: "سنوي", DRAFT: "مسودة", ACTIVE: "نشط", PAUSED: "متوقف", COMPLETED: "مكتمل" };
    const table: ReportTable = { title: "القيود الدورية", subtitle: `${rows.length} قيد دوري`, columns: ["الرقم", "الاسم", "التكرار", "البداية", "النهاية", "التنفيذ القادم", "عدد التنفيذ", "العملة", "مبلغ القيد", "الحالة"], rows: rows.map(row => [row.code, row.name, labels[row.frequency], row.startDate.toISOString().slice(0, 10), row.endDate?.toISOString().slice(0, 10) ?? "—", row.nextRunAt?.toISOString().slice(0, 10) ?? "—", row.executionCount, row.currency, row.lines.reduce((sum, line) => sum + Number(line.debit), 0), labels[row.status] ?? row.status]) };
    if (format === "pdf") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-recurring-journals.xlsx"', "Cache-Control": "no-store" } });
  } catch (error) { return recurringError(error); }
}
