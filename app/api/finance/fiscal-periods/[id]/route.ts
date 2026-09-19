import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { closeFiscalPeriod, fiscalCloseErrorResponse, reopenFiscalPeriod } from "@/lib/fiscal-close";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, body = await request.json(), action = String(body.action ?? "").toUpperCase();
    if (!Number.isInteger(Number(id)) || !["CLOSE", "REOPEN"].includes(action)) return NextResponse.json({ error: "الطلب غير صحيح" }, { status: 400 });
    const overrideWarnings = body.overrideWarnings === true;
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "REOPEN" || overrideWarnings ? "MANAGE" : "APPROVE" });
    const row = await prisma.$transaction((tx) => action === "CLOSE" ? closeFiscalPeriod(tx, Number(id), auth.userId, { overrideWarnings, reason: body.reason }) : reopenFiscalPeriod(tx, Number(id), body.reason, auth.userId));
    return NextResponse.json(row);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); const response = fiscalCloseErrorResponse(error); return NextResponse.json({ error: response.message, blockers: response.blockers }, { status: response.status });
  }
}
