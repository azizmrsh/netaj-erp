import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createFinalInvoiceFromNote, WorkflowError } from "@/lib/workflows";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) throw new WorkflowError("INVALID_INPUT", "رقم السند غير صحيح");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await prisma.$transaction((tx) => createFinalInvoiceFromNote(tx, id, body));
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error(error);
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 400 });
    return NextResponse.json({ error: "تعذر إنشاء الفاتورة والقيد" }, { status: 500 });
  }
}
