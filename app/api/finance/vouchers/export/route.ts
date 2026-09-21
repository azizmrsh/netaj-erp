import { NextResponse } from "next/server";
import { GET as workspace } from "../route";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";
type Row = Record<string, unknown>;
export async function GET(request: Request) {
  const url = new URL(request.url), p = url.searchParams;
  const internal = new URL(request.url); internal.searchParams.set("workspace", "1");
  const result = await workspace(new Request(internal, { headers: request.headers }));
  if (!result.ok) return result;
  const data = await result.json();
  const rows: Row[] = [...data.vouchers.map((v: Row) => ({ ...v, number: v.voucherNumber, date: String(v.voucherDate).slice(0, 10), kind: v.voucherType, partyName: (v.party as Row | null)?.nameAr ?? v.beneficiaryName ?? "—", bankName: (v.bankAccount as Row).name })), ...data.transfers.map((t: Row) => ({ ...t, number: t.transferNumber, date: String(t.transferDate).slice(0, 10), kind: "TRANSFER", partyName: `${String((t.fromBankAccount as Row).name)} ← ${String((t.toBankAccount as Row).name)}`, bankName: (t.fromBankAccount as Row).name, currency: (t.fromBankAccount as Row).currency }))].filter((row: Row) => (!p.get("q") || `${row.number} ${row.partyName} ${row.referenceNumber}`.includes(p.get("q")!)) && (!p.get("status") || row.status === p.get("status")) && (!p.get("type") || row.kind === p.get("type")) && (!p.get("from") || String(row.date) >= p.get("from")!) && (!p.get("to") || String(row.date) <= p.get("to")!));
  const names: Record<string, string> = { CUSTOMER_RECEIPT: "قبض", SUPPLIER_PAYMENT: "صرف", TRANSFER: "تحويل" };
  const table: ReportTable = { title: "سجل السندات", subtitle: "السندات المطابقة للفلاتر • التحويل الداخلي لا يمثل إيرادًا أو مصروفًا", columns: ["رقم السند", "النوع", "التاريخ", "الطرف", "الحساب", "المبلغ", "العملة", "طريقة الدفع", "الحالة", "المرجع"], rows: rows.map(r => [String(r.number), names[String(r.kind)] ?? String(r.kind), String(r.date), String(r.partyName), String(r.bankName), Number(r.amount), String(r.currency), String(r.paymentMethod ?? "تحويل"), String(r.status), String(r.referenceNumber ?? "")]) };
  if (p.get("format") === "xlsx") return new NextResponse(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="vouchers.xlsx"' } });
  return new NextResponse(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
