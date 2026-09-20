import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBankAccount, ensureFinanceFoundation, financeErrorResponse } from "@/lib/finance";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams;
    const bankAccountId = Number(params.get("bankAccountId"));
    const from = params.get("from") ? new Date(`${params.get("from")}T00:00:00.000`) : undefined;
    const to = params.get("to") ? new Date(`${params.get("to")}T23:59:59.999`) : undefined;
    const transactionType = params.get("transactionType")?.trim().toUpperCase();
    const query = params.get("q")?.trim();
    const rows = await prisma.bankAccount.findMany({
      where: Number.isInteger(bankAccountId) && bankAccountId > 0 ? { id: bankAccountId } : {},
      include: { ledgerAccount: true, transactions: {
        where: {
          ...(from || to ? { transactionDate: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
          ...(transactionType ? { transactionType } : {}),
          ...(query ? { OR: [{ referenceNumber: { contains: query } }, { description: { contains: query } }] } : {}),
        },
        orderBy: [{ transactionDate: "desc" }, { id: "desc" }], take: 2000,
      } }, orderBy: { name: "asc" },
    });
    if (params.get("format") === "csv") {
      const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
      const lines = [["Bank", "Date", "Type", "Reference", "Description", "Amount In", "Amount Out", "Balance"],
        ...rows.flatMap((bank) => bank.transactions.map((row) => [bank.name, row.transactionDate.toISOString().slice(0, 10), row.transactionType, row.referenceNumber, row.description, row.amountIn, row.amountOut, row.balanceAfter]))];
      return new Response(`\uFEFF${lines.map((line) => line.map(escape).join(",")).join("\n")}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="netaj-bank-ledger-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" } });
    }
    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); return NextResponse.json({ error: "تعذر تحميل الحركات البنكية" }, { status: 500 });
  }
}
export async function POST(request: Request) {
  try { await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" }); const body = await request.json(); const row = await prisma.$transaction(async (tx) => { await ensureFinanceFoundation(tx); return createBankAccount(tx, body); }); return NextResponse.json(row, { status: 201 }); }
  catch (error) { if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } console.error(error); const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
}
