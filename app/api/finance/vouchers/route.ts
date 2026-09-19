import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createVoucher, ensureFinanceFoundation, financeErrorResponse } from "@/lib/finance";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams, status = params.get("status")?.toUpperCase(), partyId = Number(params.get("partyId"));
  const where: Prisma.FinancialVoucherWhereInput = { ...(status ? { status } : {}), ...(Number.isInteger(partyId) && partyId > 0 ? { partyId } : {}) };
  return NextResponse.json(await prisma.financialVoucher.findMany({ where, include: { party: true, bankAccount: true, allocations: { include: { sale: true, purchase: true } }, journalEntry: { include: { lines: true } } }, orderBy: [{ voucherDate: "desc" }, { id: "desc" }] }));
}
export async function POST(request: Request) {
  try { const body = await request.json(); const row = await prisma.$transaction(async (tx) => { await ensureFinanceFoundation(tx); return createVoucher(tx, body); }); return NextResponse.json(row, { status: 201 }); }
  catch (error) { console.error(error); const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
}
