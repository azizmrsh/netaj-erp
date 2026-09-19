import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { completeBankReconciliation, reconciliationErrorResponse } from "@/lib/financial-reconciliation";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "APPROVE" });
    const { id } = await context.params, body = await request.json();
    if (String(body.action ?? "").toUpperCase() !== "COMPLETE") return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 });
    const row = await prisma.$transaction((tx) => completeBankReconciliation(tx, Number(id), auth.userId));
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); const response = reconciliationErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status });
  }
}
