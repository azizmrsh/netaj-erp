import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, periodId = Number(id), body = await request.json(), action = String(body.action ?? "").toUpperCase();
    if (!Number.isInteger(periodId) || !["CLOSE", "REOPEN"].includes(action)) return NextResponse.json({ error: "الطلب غير صحيح" }, { status: 400 });
    const period = await prisma.$transaction(async (tx) => {
      const existing = await tx.accountingPeriod.findUnique({ where: { id: periodId } });
      if (!existing) throw new Error("NOT_FOUND");
      const row = await tx.accountingPeriod.update({ where: { id: periodId }, data: action === "CLOSE" ? { status: "CLOSED", closedAt: new Date() } : { status: "OPEN", closedAt: null } });
      await audit(tx, { action: action === "CLOSE" ? "ACCOUNTING_PERIOD_CLOSE" : "ACCOUNTING_PERIOD_REOPEN", entityType: "ACCOUNTING_PERIOD", entityId: periodId, metadata: { reason: String(body.reason ?? "") } });
      return row;
    });
    return NextResponse.json(period);
  } catch (error) { console.error(error); return NextResponse.json({ error: error instanceof Error && error.message === "NOT_FOUND" ? "الفترة غير موجودة" : "تعذر تحديث الفترة" }, { status: error instanceof Error && error.message === "NOT_FOUND" ? 404 : 500 }); }
}
