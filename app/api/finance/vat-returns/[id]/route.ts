import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { fileVatReturn, ReconciliationError, reconciliationErrorResponse, settleVatReturn } from "@/lib/financial-reconciliation";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, body = await request.json(), action = String(body.action ?? "").toUpperCase();
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "FILE" ? "APPROVE" : "POST" });
    if (!Number.isInteger(Number(id))) return NextResponse.json({ error: "رقم الإقرار غير صحيح" }, { status: 400 });
    const row = await prisma.$transaction((tx) => action === "FILE" ? fileVatReturn(tx, Number(id), auth.userId)
      : action === "SETTLE" ? settleVatReturn(tx, Number(id), Number(body.bankAccountId), body.settlementDate, auth.userId)
        : Promise.reject(new ReconciliationError("INVALID_INPUT", "الإجراء غير مدعوم")));
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); const response = reconciliationErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
