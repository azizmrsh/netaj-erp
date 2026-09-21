import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { paymentMethodsWorkspace } from "@/lib/payment-methods";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" }), params = new URL(request.url).searchParams;
    const data = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => paymentMethodsWorkspace(tx)));
    const q = (params.get("q") || "").toLowerCase(), type = params.get("type"), active = params.get("active");
    const types: Record<string, string> = { CASH: "نقد", BANK: "بنك", TRANSFER: "تحويل", CHEQUE: "شيك", CARD: "بطاقة", MADA: "مدى", VISA: "Visa", MASTERCARD: "Mastercard", OTHER: "أخرى" };
    const rows = data.methods.filter(row => (!q || `${row.code} ${row.nameAr} ${row.nameEn}`.toLowerCase().includes(q)) && (!type || row.type === type) && (!active || String(row.isActive) === active));
    const table: ReportTable = { title: "طرق الدفع", subtitle: `${rows.length} طريقة — الشركة ${auth.companyId}`, columns: ["الرمز", "الترتيب", "الاسم العربي", "الاسم الإنجليزي", "النوع", "الحساب", "البنك", "العملة", "الفرع", "الحالة"], rows: rows.map(row => [row.code, row.displayOrder, row.nameAr, row.nameEn, types[row.type] || row.type, data.accounts.find(account => account.id === row.accountId)?.nameAr || "حسب البنك", data.banks.find(bank => bank.id === row.bankAccountId)?.name || "—", row.currency || "حسب المستند", data.branches.find(branch => branch.id === row.branchId)?.nameAr || "جميع الفروع", row.isActive ? "نشطة" : "موقوفة"]) };
    if (params.get("format") === "pdf") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
    return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-payment-methods.xlsx"', "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message }, { status: value.status }); }
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تصدير طرق الدفع" }, { status: 400 });
  }
}
