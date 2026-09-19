import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelVoucher, financeErrorResponse, postVoucher } from "@/lib/finance";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, voucherId = Number(id), body = await request.json(), action = String(body.action ?? "").toUpperCase();
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "POST" ? "POST" : action === "CANCEL" ? "CANCEL" : "UPDATE" });
    if (!Number.isInteger(voucherId)) return NextResponse.json({ error: "رقم السند غير صحيح" }, { status: 400 });
    const row = await prisma.$transaction((tx) => action === "POST" ? postVoucher(tx, voucherId) : action === "CANCEL" ? cancelVoucher(tx, voucherId, String(body.reason ?? "").trim() || null) : Promise.reject(new Error("INVALID_ACTION")));
    return NextResponse.json(row);
  } catch (error) { console.error(error); if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } if (error instanceof Error && error.message === "INVALID_ACTION") return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 }); const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
}
