import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { FxRevaluationError, postFxRevaluation, reverseFxRevaluation } from "@/lib/fx-revaluation";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, body = await request.json(), action = String(body.action ?? "").toUpperCase();
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "POST" ? "POST" : "CANCEL" });
    const result = action === "POST" ? await prisma.$transaction((tx) => postFxRevaluation(tx, Number(id), auth.userId))
      : action === "REVERSE" ? await prisma.$transaction((tx) => reverseFxRevaluation(tx, Number(id), auth.userId)) : null;
    if (!result) return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof FxRevaluationError) return NextResponse.json({ error: error.message }, { status: 400 });
    console.error(error); return NextResponse.json({ error: "تعذر تنفيذ إجراء إعادة التقييم" }, { status: 500 });
  }
}
