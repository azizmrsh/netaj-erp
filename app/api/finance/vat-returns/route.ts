import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { createVatReturn, reconciliationErrorResponse } from "@/lib/financial-reconciliation";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const rows = await prisma.vatReturn.findMany({ include: { lines: true, filingJournal: true, settlementJournal: true, bankAccount: true }, orderBy: [{ periodEnd: "desc" }, { id: "desc" }], take: 100 });
    return NextResponse.json(rows);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); return NextResponse.json({ error: "تعذر تحميل إقرارات الضريبة" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" });
    const body = await request.json();
    const row = await prisma.$transaction((tx) => createVatReturn(tx, body, context.userId));
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); const response = reconciliationErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
