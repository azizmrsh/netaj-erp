import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { BudgetError, approveBudget } from "@/lib/budgeting";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, body = await request.json();
    if (String(body.action ?? "").toUpperCase() !== "APPROVE") return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 });
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "APPROVE" });
    return NextResponse.json(await prisma.$transaction((tx) => approveBudget(tx, Number(id), auth.userId)));
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof BudgetError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "تعذر اعتماد الميزانية" }, { status: 500 });
  }
}
