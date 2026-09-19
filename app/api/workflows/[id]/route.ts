import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { changeWorkflowStatus, WorkflowError, workflowInclude } from "@/lib/workflows";

const idFrom = (value: string) => { const id = Number(value); if (!Number.isInteger(id) || id <= 0) throw new WorkflowError("INVALID_INPUT", "رقم المستند غير صحيح"); return id; };
const respond = (error: unknown) => error instanceof WorkflowError ? NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 400 }) : NextResponse.json({ error: "تعذر تنفيذ العملية" }, { status: 500 });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const document = await prisma.businessDocument.findUnique({ where: { id: idFrom((await params).id) }, include: workflowInclude });
    if (!document) throw new WorkflowError("NOT_FOUND", "المستند غير موجود");
    const attachments = await prisma.attachment.findMany({ where: { entityType: "BUSINESS_DOCUMENT", entityId: document.id }, orderBy: { uploadedAt: "desc" } });
    return NextResponse.json({ ...document, attachments });
  } catch (error) { return respond(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const body = await request.json();
    const id = idFrom((await params).id);
    const document = await prisma.$transaction((tx) => changeWorkflowStatus(tx, id, String(body.action ?? "")));
    return NextResponse.json(document);
  } catch (error) { return respond(error); }
}
