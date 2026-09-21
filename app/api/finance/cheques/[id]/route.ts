import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { chequeAction, ChequeError } from "@/lib/cheques";
import { chequeError } from "../errors";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: raw } = await context.params, id = Number(raw), body = await request.json(), action = String(body.action ?? "").toUpperCase();
    if (!Number.isInteger(id) || id < 1) throw new ChequeError("رقم السجل غير صحيح");
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: body.kind === "BOOK" ? "UPDATE" : action === "ISSUE" ? "APPROVE" : ["CANCEL", "RETURN"].includes(action) ? "CANCEL" : "POST" });
    const result = await prisma.$transaction(async tx => {
      if (body.kind !== "BOOK") return chequeAction(tx, id, action, body, String(auth.userId));
      if (!["ACTIVATE", "PAUSE"].includes(action)) throw new ChequeError("إجراء الدفتر غير صحيح");
      const book = await tx.chequeBook.findUnique({ where: { id } });
      if (!book) throw new ChequeError("الدفتر غير موجود", 404);
      const result = await tx.chequeBook.update({ where: { id }, data: { status: action === "ACTIVATE" ? "ACTIVE" : "PAUSED" } });
      await audit(tx, { action, entityType: "CHEQUE_BOOK", entityId: id, userId: String(auth.userId) }); return result;
    });
    return NextResponse.json(result);
  } catch (error) { return chequeError(error); }
}
