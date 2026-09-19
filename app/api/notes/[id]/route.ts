import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  cancelPostedNote,
  changeNoteStatus,
  NoteWorkflowError,
  noteInclude,
  parseNoteInput,
  postNote,
  updateDraftNote,
} from "@/lib/notes";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

function responseForError(error: unknown) {
  console.error(error);
  if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
  if (error instanceof NoteWorkflowError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "NOT_FOUND" ? 404 : 400 }
    );
  }
  return NextResponse.json({ error: "تعذر تنفيذ العملية على السند" }, { status: 500 });
}

function noteId(value: string) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new NoteWorkflowError("INVALID_INPUT", "رقم السند غير صحيح");
  }
  return id;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authorizeRequest(request, { moduleKey: "NOTES", action: "READ" });
    const { id } = await params;
    const note = await prisma.deliveryReceiptNote.findUnique({
      where: { id: noteId(id) },
      include: noteInclude,
    });
    if (!note) throw new NoteWorkflowError("NOT_FOUND", "السند غير موجود");
    return NextResponse.json(note);
  } catch (error) {
    return responseForError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const idNumber = noteId(id);
    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action ?? "UPDATE").toUpperCase();
    await authorizeRequest(request, { moduleKey: "NOTES", action: action === "POST" ? "POST" : action === "CANCEL" ? "CANCEL" : action === "APPROVE" ? "APPROVE" : "UPDATE" });

    if (action === "POST") {
      const result = await prisma.$transaction((tx) => postNote(tx, idNumber));
      return NextResponse.json(result);
    }
    if (action === "SUBMIT" || action === "APPROVE") {
      const note = await prisma.$transaction((tx) =>
        changeNoteStatus(tx, idNumber, action)
      );
      return NextResponse.json(note);
    }
    if (action === "CANCEL") {
      const note = await prisma.$transaction((tx) =>
        cancelPostedNote(tx, idNumber, String(body.reason ?? "").trim() || null)
      );
      return NextResponse.json(note);
    }
    const note = await prisma.$transaction((tx) =>
      updateDraftNote(tx, idNumber, parseNoteInput(body))
    );
    return NextResponse.json(note);
  } catch (error) {
    return responseForError(error);
  }
}
