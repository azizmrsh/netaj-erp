import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { closeFiscalYear, fiscalCloseErrorResponse, reopenFiscalYear } from "@/lib/fiscal-close";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, body = await request.json(), action = String(body.action ?? "").toUpperCase();
    if (!Number.isInteger(Number(id)) || !["CLOSE", "REOPEN"].includes(action)) return NextResponse.json({ error: "الطلب غير صحيح" }, { status: 400 });
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "REOPEN" ? "MANAGE" : "APPROVE" });
    const row = await prisma.$transaction((tx) => action === "CLOSE" ? closeFiscalYear(tx, Number(id), auth.userId) : reopenFiscalYear(tx, Number(id), body.reason, auth.userId));
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); const response = fiscalCloseErrorResponse(error); return NextResponse.json({ error: response.message, blockers: response.blockers }, { status: response.status });
  }
}
