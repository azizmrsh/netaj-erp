import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createFinalInvoiceFromNote, WorkflowError } from "@/lib/workflows";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new WorkflowError("INVALID_INPUT", "رقم السند غير صحيح");
    const note = await prisma.deliveryReceiptNote.findUnique({ where: { id }, select: { noteType: true } });
    if (!note) throw new WorkflowError("NOT_FOUND", "السند غير موجود");
    await authorizeRequest(request, { moduleKey: note.noteType === "DELIVERY" ? "SALES" : "PURCHASES", action: "POST" });
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await prisma.$transaction((tx) => createFinalInvoiceFromNote(tx, id, body));
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error(error);
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 400 });
    return NextResponse.json({ error: "تعذر إنشاء الفاتورة والقيد" }, { status: 500 });
  }
}
