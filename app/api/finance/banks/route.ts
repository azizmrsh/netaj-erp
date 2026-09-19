import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createBankAccount, ensureFinanceFoundation, financeErrorResponse } from "@/lib/finance";

export async function GET() {
  const rows = await prisma.bankAccount.findMany({ include: { ledgerAccount: true, transactions: { orderBy: [{ transactionDate: "desc" }, { id: "desc" }], take: 100 } }, orderBy: { name: "asc" } });
  return NextResponse.json(rows);
}
export async function POST(request: Request) {
  try { const body = await request.json(); const row = await prisma.$transaction(async (tx) => { await ensureFinanceFoundation(tx); return createBankAccount(tx, body); }); return NextResponse.json(row, { status: 201 }); }
  catch (error) { console.error(error); const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
}
