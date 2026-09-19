import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  createNote,
  NoteWorkflowError,
  noteInclude,
  parseNoteInput,
} from "@/lib/notes";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

function workflowError(error: unknown) {
  console.error(error);
  if (error instanceof AuthError) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
  if (error instanceof NoteWorkflowError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.code === "NOT_FOUND" ? 404 : 400 }
    );
  }
  return NextResponse.json({ error: "تعذر حفظ السند" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "NOTES", action: "READ" });
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.toUpperCase();
    const noteType = searchParams.get("noteType")?.toUpperCase();
    const partyId = Number(searchParams.get("partyId"));
    const itemId = Number(searchParams.get("itemId"));
    const query = searchParams.get("q")?.trim();
    const reference = searchParams.get("reference")?.trim();
    const page = Math.max(Number(searchParams.get("page")) || 1, 1);
    const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize")) || 50, 1), 100);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const where: Prisma.DeliveryReceiptNoteWhereInput = {
      ...(status ? { status } : {}),
      ...(noteType === "RECEIPT" || noteType === "DELIVERY" ? { noteType } : {}),
      ...(Number.isInteger(partyId) && partyId > 0 ? { partyId } : {}),
      ...(Number.isInteger(itemId) && itemId > 0 ? { items: { some: { itemId } } } : {}),
      AND: [
        ...(reference ? [{ OR: [{ referenceNumber: { contains: reference } }, { orderNumber: { contains: reference } }, { invoiceNumber: { contains: reference } }] }] : []),
        ...(query ? [{ OR: [{ noteNumber: { contains: query } }, { party: { nameAr: { contains: query } } }, { referenceNumber: { contains: query } }] }] : []),
      ],
      ...(from || to
        ? {
            noteDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
            },
          }
        : {}),
    };
    const [notes, total, parties, items, trucks, drivers] = await Promise.all([
      prisma.deliveryReceiptNote.findMany({
        where,
        include: noteInclude,
        orderBy: [{ noteDate: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.deliveryReceiptNote.count({ where }),
      prisma.party.findMany({
        where: { isActive: true },
        select: { id: true, nameAr: true, isCustomer: true, isSupplier: true },
        orderBy: { nameAr: "asc" },
      }),
      prisma.item.findMany({
        where: { isActive: true },
        select: { id: true, code: true, nameAr: true, unit: true },
        orderBy: { nameAr: "asc" },
      }),
      prisma.truck.findMany({
        where: { status: "ACTIVE" },
        orderBy: { plateNumber: "asc" },
      }),
      prisma.driver.findMany({
        where: { status: "ACTIVE" },
        orderBy: { name: "asc" },
      }),
    ]);
    return NextResponse.json({ notes, options: { parties, items, trucks, drivers }, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تحميل السندات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "NOTES", action: "CREATE" });
    const input = parseNoteInput(await request.json());
    const note = await prisma.$transaction((tx) => createNote(tx, input));
    return NextResponse.json(note, { status: 201 });
  } catch (error) {
    return workflowError(error);
  }
}
