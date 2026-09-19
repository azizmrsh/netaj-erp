import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { createAccountingAdjustment, financialAdjustmentErrorResponse } from "@/lib/financial-adjustments";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try { await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" }); return NextResponse.json(await prisma.accountingAdjustment.findMany({ include: { lines: { include: { account: true } }, journalEntry: true }, orderBy: [{ adjustmentDate: "desc" }, { id: "desc" }], take: 100 })); }
  catch (error) { if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } console.error(error); return NextResponse.json({ error: "تعذر تحميل قيود التسوية" }, { status: 500 }); }
}
export async function POST(request: Request) {
  try { const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" }); const body = await request.json(); return NextResponse.json(await prisma.$transaction((tx) => createAccountingAdjustment(tx, body, auth.userId)), { status: 201 }); }
  catch (error) { if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } console.error(error); const response = financialAdjustmentErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
}
