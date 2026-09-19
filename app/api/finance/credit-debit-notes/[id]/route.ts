import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { cancelCreditDebitNote, financialAdjustmentErrorResponse, postCreditDebitNote } from "@/lib/financial-adjustments";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params, body = await request.json(), action = String(body.action ?? "").toUpperCase(); if (!Number.isInteger(Number(id)) || !["POST", "CANCEL"].includes(action)) return NextResponse.json({ error: "الطلب غير صحيح" }, { status: 400 });
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "POST" ? "POST" : "CANCEL" });
    return NextResponse.json(await prisma.$transaction((tx) => action === "POST" ? postCreditDebitNote(tx, Number(id), auth.userId) : cancelCreditDebitNote(tx, Number(id), body.reason, auth.userId))); }
  catch (error) { if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } console.error(error); const response = financialAdjustmentErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
}
