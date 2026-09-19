import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { convertBusinessDocument, WorkflowError } from "@/lib/workflows";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const body = (await request.json()) as Record<string, unknown>;
    if (!Number.isInteger(id) || id <= 0) throw new WorkflowError("INVALID_INPUT", "رقم المستند غير صحيح");
    const result = await prisma.$transaction((tx) => convertBusinessDocument(tx, id, String(body.targetType ?? ""), body));
    return NextResponse.json(result, { status: result.created ? 201 : 200 });
  } catch (error) {
    console.error(error);
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 400 });
    return NextResponse.json({ error: "تعذر تحويل المستند" }, { status: 500 });
  }
}
