import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { accountDirectory, accountTypes, filterAccountDirectory } from "@/lib/account-directory";
import { createXlsx, type ReportTable } from "@/lib/financial-export";
import { buildPrintableReportHtml } from "@/lib/printable-report";

export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return await runWithDataScope(auth, async () => {
      const params = new URL(request.url).searchParams;
      const data = await prisma.$transaction(tx => accountDirectory(tx));
      const rows = filterAccountDirectory(data.rows, params);
      const table: ReportTable = {
        title: "الحسابات",
        subtitle: `${data.company.nameAr} — ${rows.length} حسابًا — الأرصدة المرحلة بعملة ${data.company.currency}`,
        columns: ["رقم الحساب", "اسم الحساب", "الاسم الإنجليزي", "الحساب الرئيسي", "التصنيف", "النوع", "الطبيعة", "الرصيد", "العملة", "الفرع", "الحالة"],
        rows: rows.map(row => [row.code, row.nameAr, row.nameEn ?? "", row.parentName ?? "—", accountTypes[row.accountType] ?? row.accountType, row.allowPosting ? "حساب حركة" : "حساب رئيسي", row.normalBalance === "DEBIT" ? "مدين" : "دائن", row.balance, row.currency, row.branchName, row.isActive ? "نشط" : "موقوف"]),
      };
      if (params.get("format") !== "xlsx") return new Response(buildPrintableReportHtml(table), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
      return new Response(new Uint8Array(createXlsx(table)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="netaj-accounts.xlsx"', "Cache-Control": "no-store" } });
    });
  } catch (error) {
    if (error instanceof AuthError) { const result = authErrorResponse(error); return Response.json({ error: result.message }, { status: result.status }); }
    return Response.json({ error: "تعذر تصدير الحسابات" }, { status: 500 });
  }
}
