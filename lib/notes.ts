import type { Prisma } from "@prisma/client";
import {
  applyStockMovement,
  InventoryError,
  type StockOwnership,
} from "@/lib/inventory";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { audit } from "@/lib/audit";
import { postCogsForDeliveryNote, reverseCogsForDeliveryNote } from "@/lib/accounting";

export type NoteItemInput = {
  itemId: number;
  description?: string | null;
  materialGrade?: string | null;
  orderNumber?: string | null;
  quantity: number;
  weight?: number | null;
};

export type NoteInput = {
  noteType: "RECEIPT" | "DELIVERY";
  noteDate: Date;
  partyId: number;
  stockOwnership: StockOwnership;
  invoiceNumber?: string | null;
  orderNumber?: string | null;
  referenceNumber?: string | null;
  transportMethod?: "COMPANY" | "CUSTOMER" | "EXTERNAL" | null;
  truckId?: number | null;
  driverId?: number | null;
  carrierName?: string | null;
  vehiclePlate?: string | null;
  driverName?: string | null;
  driverIdNumber?: string | null;
  driverPhone?: string | null;
  source?: string | null;
  loadingPoint?: string | null;
  unloadingPoint?: string | null;
  notes?: string | null;
  recipientName?: string | null;
  recipientSignature?: string | null;
  recipientSignedAt?: Date | null;
  purchasingName?: string | null;
  purchasingSignature?: string | null;
  purchasingSignedAt?: Date | null;
  warehouseName?: string | null;
  warehouseSignature?: string | null;
  warehouseSignedAt?: Date | null;
  accountantName?: string | null;
  accountantSignature?: string | null;
  accountantSignedAt?: Date | null;
  items: NoteItemInput[];
};

export class NoteWorkflowError extends Error {
  public readonly code:
    | "INVALID_INPUT"
    | "NOT_FOUND"
    | "INVALID_STATUS"
    | "STOCK_ERROR";

  constructor(
    code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS" | "STOCK_ERROR",
    message: string
  ) {
    super(message);
    this.name = "NoteWorkflowError";
    this.code = code;
  }
}

function clean(value: string | null | undefined) {
  return value?.trim() || null;
}

function textFrom(value: unknown) {
  return clean(value === null || value === undefined ? null : String(value));
}

function optionalDate(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new NoteWorkflowError("INVALID_INPUT", "تاريخ التوقيع غير صحيح");
  }
  return parsed;
}

export function parseNoteInput(value: unknown): NoteInput {
  if (!value || typeof value !== "object") {
    throw new NoteWorkflowError("INVALID_INPUT", "بيانات السند غير صحيحة");
  }
  const body = value as Record<string, unknown>;
  const noteType = String(body.noteType ?? "").toUpperCase();
  const stockOwnership = String(body.stockOwnership ?? "").toUpperCase();
  const transportMethodValue = textFrom(body.transportMethod)?.toUpperCase() ?? null;
  const noteDate = body.noteDate ? new Date(String(body.noteDate)) : new Date();

  if (noteType !== "RECEIPT" && noteType !== "DELIVERY") {
    throw new NoteWorkflowError("INVALID_INPUT", "نوع السند غير صحيح");
  }
  if (stockOwnership !== "COMPANY" && stockOwnership !== "PARTY") {
    throw new NoteWorkflowError("INVALID_INPUT", "ملكية المخزون غير صحيحة");
  }
  if (
    transportMethodValue !== null &&
    !["COMPANY", "CUSTOMER", "EXTERNAL"].includes(transportMethodValue)
  ) {
    throw new NoteWorkflowError("INVALID_INPUT", "وسيلة النقل غير صحيحة");
  }
  if (Number.isNaN(noteDate.getTime())) {
    throw new NoteWorkflowError("INVALID_INPUT", "تاريخ السند غير صحيح");
  }
  if (!Array.isArray(body.items)) {
    throw new NoteWorkflowError("INVALID_INPUT", "مواد السند غير صحيحة");
  }

  return {
    noteType,
    noteDate,
    partyId: Number(body.partyId),
    stockOwnership,
    invoiceNumber: textFrom(body.invoiceNumber),
    orderNumber: textFrom(body.orderNumber),
    referenceNumber: textFrom(body.referenceNumber),
    transportMethod: transportMethodValue as NoteInput["transportMethod"],
    truckId: body.truckId ? Number(body.truckId) : null,
    driverId: body.driverId ? Number(body.driverId) : null,
    carrierName: textFrom(body.carrierName),
    vehiclePlate: textFrom(body.vehiclePlate),
    driverName: textFrom(body.driverName),
    driverIdNumber: textFrom(body.driverIdNumber),
    driverPhone: textFrom(body.driverPhone),
    source: textFrom(body.source),
    loadingPoint: textFrom(body.loadingPoint),
    unloadingPoint: textFrom(body.unloadingPoint),
    notes: textFrom(body.notes),
    recipientName: textFrom(body.recipientName),
    recipientSignature: textFrom(body.recipientSignature),
    recipientSignedAt: optionalDate(body.recipientSignedAt),
    purchasingName: textFrom(body.purchasingName),
    purchasingSignature: textFrom(body.purchasingSignature),
    purchasingSignedAt: optionalDate(body.purchasingSignedAt),
    warehouseName: textFrom(body.warehouseName),
    warehouseSignature: textFrom(body.warehouseSignature),
    warehouseSignedAt: optionalDate(body.warehouseSignedAt),
    accountantName: textFrom(body.accountantName),
    accountantSignature: textFrom(body.accountantSignature),
    accountantSignedAt: optionalDate(body.accountantSignedAt),
    items: body.items.map((raw) => {
      if (!raw || typeof raw !== "object") {
        throw new NoteWorkflowError("INVALID_INPUT", "أحد بنود السند غير صحيح");
      }
      const row = raw as Record<string, unknown>;
      return {
        itemId: Number(row.itemId),
        description: textFrom(row.description),
        materialGrade: textFrom(row.materialGrade),
        orderNumber: textFrom(row.orderNumber),
        quantity: Number(row.quantity),
        weight:
          row.weight === null || row.weight === undefined || row.weight === ""
            ? null
            : Number(row.weight),
      };
    }),
  };
}

async function validateInput(tx: Prisma.TransactionClient, input: NoteInput) {
  if (!Number.isInteger(input.partyId) || input.partyId <= 0) {
    throw new NoteWorkflowError("INVALID_INPUT", "العميل أو المورد غير صحيح");
  }
  if (!input.items.length) {
    throw new NoteWorkflowError("INVALID_INPUT", "يجب إضافة مادة واحدة على الأقل");
  }
  if (
    input.items.some(
      (item) =>
        !Number.isInteger(item.itemId) ||
        item.itemId <= 0 ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        (item.weight !== null &&
          item.weight !== undefined &&
          (!Number.isFinite(item.weight) || item.weight < 0))
    )
  ) {
    throw new NoteWorkflowError("INVALID_INPUT", "بيانات مواد السند غير صحيحة");
  }

  const uniqueItemIds = [...new Set(input.items.map((item) => item.itemId))];
  const [party, itemCount, truck, driver] = await Promise.all([
    tx.party.findUnique({ where: { id: input.partyId }, select: { id: true } }),
    tx.item.count({ where: { id: { in: uniqueItemIds }, isActive: true } }),
    input.truckId
      ? tx.truck.findUnique({ where: { id: input.truckId } })
      : Promise.resolve(null),
    input.driverId
      ? tx.driver.findUnique({ where: { id: input.driverId } })
      : Promise.resolve(null),
  ]);

  if (!party) throw new NoteWorkflowError("NOT_FOUND", "العميل أو المورد غير موجود");
  if (itemCount !== uniqueItemIds.length) {
    throw new NoteWorkflowError("INVALID_INPUT", "توجد مادة غير موجودة أو غير نشطة");
  }
  if (input.truckId && !truck) {
    throw new NoteWorkflowError("INVALID_INPUT", "الشاحنة غير موجودة");
  }
  if (input.driverId && !driver) {
    throw new NoteWorkflowError("INVALID_INPUT", "السائق غير موجود");
  }
  return { truck, driver };
}

function noteData(
  input: NoteInput,
  related: {
    truck: { plateNumber: string } | null;
    driver: { name: string; idNumber: string | null; phone: string | null } | null;
  }
) {
  return {
    noteType: input.noteType,
    noteDate: input.noteDate,
    partyId: input.partyId,
    stockOwnership: input.stockOwnership,
    invoiceNumber: clean(input.invoiceNumber),
    orderNumber: clean(input.orderNumber),
    referenceNumber: clean(input.referenceNumber),
    transportMethod: input.transportMethod ?? null,
    truckId: input.truckId ?? null,
    driverId: input.driverId ?? null,
    carrierName: clean(input.carrierName),
    vehiclePlate: related.truck?.plateNumber ?? clean(input.vehiclePlate),
    driverName: related.driver?.name ?? clean(input.driverName),
    driverIdNumber: related.driver?.idNumber ?? clean(input.driverIdNumber),
    driverPhone: related.driver?.phone ?? clean(input.driverPhone),
    source: clean(input.source),
    loadingPoint: clean(input.loadingPoint),
    unloadingPoint: clean(input.unloadingPoint),
    notes: clean(input.notes),
    recipientName: clean(input.recipientName),
    recipientSignature: clean(input.recipientSignature),
    recipientSignedAt: input.recipientSignedAt ?? null,
    purchasingName: clean(input.purchasingName),
    purchasingSignature: clean(input.purchasingSignature),
    purchasingSignedAt: input.purchasingSignedAt ?? null,
    warehouseName: clean(input.warehouseName),
    warehouseSignature: clean(input.warehouseSignature),
    warehouseSignedAt: input.warehouseSignedAt ?? null,
    accountantName: clean(input.accountantName),
    accountantSignature: clean(input.accountantSignature),
    accountantSignedAt: input.accountantSignedAt ?? null,
  };
}

const noteInclude = {
  party: true,
  truck: true,
  driver: true,
  sourceDocument: { select: { id: true, documentNumber: true, documentType: true } },
  items: { include: { item: { include: { unit: true } } }, orderBy: { sequence: "asc" } },
  trip: { include: { truck: true, driver: true } },
  salesInvoices: { select: { id: true, invoiceNumber: true, status: true } },
  purchaseInvoices: { select: { id: true, purchaseNumber: true, status: true } },
} satisfies Prisma.DeliveryReceiptNoteInclude;

export async function createNote(tx: Prisma.TransactionClient, input: NoteInput) {
  const related = await validateInput(tx, input);
  const noteNumber = await nextDocumentNumber(
    tx,
    input.noteType === "RECEIPT" ? "GRN" : "DN",
    input.noteDate
  );
  const note = await tx.deliveryReceiptNote.create({
    data: {
      noteNumber,
      ...noteData(input, related),
      status: "DRAFT",
      items: {
        create: input.items.map((item, index) => ({
          sequence: index + 1,
          itemId: item.itemId,
          description: clean(item.description),
          materialGrade: clean(item.materialGrade),
          orderNumber: clean(item.orderNumber),
          quantity: item.quantity,
          weight: item.weight ?? null,
        })),
      },
    },
    include: noteInclude,
  });
  await audit(tx, { action: "CREATE", entityType: "DELIVERY_RECEIPT_NOTE", entityId: note.id, metadata: { noteNumber } });
  return note;
}

export async function updateDraftNote(
  tx: Prisma.TransactionClient,
  noteId: number,
  input: NoteInput
) {
  const current = await tx.deliveryReceiptNote.findUnique({ where: { id: noteId } });
  if (!current) throw new NoteWorkflowError("NOT_FOUND", "السند غير موجود");
  if (current.status !== "DRAFT") {
    throw new NoteWorkflowError("INVALID_STATUS", "لا يمكن تعديل سند مرحّل أو ملغى");
  }
  const related = await validateInput(tx, input);
  await tx.deliveryReceiptNoteItem.deleteMany({ where: { noteId } });
  const updated = await tx.deliveryReceiptNote.update({
    where: { id: noteId },
    data: {
      ...noteData(input, related),
      items: {
        create: input.items.map((item, index) => ({
          sequence: index + 1,
          itemId: item.itemId,
          description: clean(item.description),
          materialGrade: clean(item.materialGrade),
          orderNumber: clean(item.orderNumber),
          quantity: item.quantity,
          weight: item.weight ?? null,
        })),
      },
    },
    include: noteInclude,
  });
  await audit(tx, { action: "UPDATE", entityType: "DELIVERY_RECEIPT_NOTE", entityId: noteId, metadata: { noteNumber: current.noteNumber } });
  return updated;
}

export async function postNote(tx: Prisma.TransactionClient, noteId: number) {
  const note = await tx.deliveryReceiptNote.findUnique({
    where: { id: noteId },
    include: { items: { include: { item: true } }, trip: true },
  });
  if (!note) throw new NoteWorkflowError("NOT_FOUND", "السند غير موجود");
  if (note.status === "POSTED") {
    return { note: await tx.deliveryReceiptNote.findUniqueOrThrow({ where: { id: note.id }, include: noteInclude }), trip: note.trip };
  }
  if (!["DRAFT", "PENDING", "APPROVED"].includes(note.status)) {
    throw new NoteWorkflowError("INVALID_STATUS", "السند ليس في حالة مسودة");
  }
  if (!note.items.length) {
    throw new NoteWorkflowError("INVALID_INPUT", "لا يمكن ترحيل سند بلا مواد");
  }

  try {
    for (const row of note.items) {
      await applyStockMovement(tx, {
        itemId: row.itemId,
        partyId: note.stockOwnership === "PARTY" ? note.partyId : null,
        ownershipType: note.stockOwnership as StockOwnership,
        movementType: note.noteType,
        quantityIn: note.noteType === "RECEIPT" ? Number(row.quantity) : 0,
        quantityOut: note.noteType === "DELIVERY" ? Number(row.quantity) : 0,
        movementDate: note.noteDate,
        referenceType: "DELIVERY_RECEIPT_NOTE",
        referenceId: note.id,
        referenceNumber: note.noteNumber,
        notes: note.notes,
      });
    }
  } catch (error) {
    if (error instanceof InventoryError) {
      throw new NoteWorkflowError("STOCK_ERROR", error.message);
    }
    throw error;
  }

  let trip = note.trip;
  if (note.transportMethod === "COMPANY" && !trip) {
    const tripNumber = await nextDocumentNumber(tx, "TR", note.noteDate);
    const totalQuantity = note.items.reduce(
      (sum, item) => sum + Number(item.quantity),
      0
    );
    const weights = note.items.filter((item) => item.weight !== null);
    const totalWeight = weights.length
      ? weights.reduce((sum, item) => sum + Number(item.weight), 0)
      : null;
    const uniqueItems = [...new Set(note.items.map((item) => item.itemId))];
    trip = await tx.transportTrip.create({
      data: {
        tripNumber,
        tripDate: note.noteDate,
        noteId: note.id,
        partyId: note.partyId,
        itemId: uniqueItems.length === 1 ? uniqueItems[0] : null,
        truckId: note.truckId,
        driverId: note.driverId,
        quantity: totalQuantity,
        weight: totalWeight,
        source: note.source,
        loadingPoint: note.loadingPoint,
        unloadingPoint: note.unloadingPoint,
        status: "OPEN",
        notes: `أُنشئت تلقائيًا من السند ${note.noteNumber}`,
      },
    });
  }

  await postCogsForDeliveryNote(tx, note.id);

  const updatedNote = await tx.deliveryReceiptNote.update({
    where: { id: note.id },
    data: { status: "POSTED", stockPostedAt: new Date() },
    include: noteInclude,
  });
  await audit(tx, { action: "POST", entityType: "DELIVERY_RECEIPT_NOTE", entityId: note.id, metadata: { noteNumber: note.noteNumber, tripId: trip?.id ?? null } });
  return { note: updatedNote, trip };
}

export async function cancelPostedNote(
  tx: Prisma.TransactionClient,
  noteId: number,
  reason?: string | null
) {
  const note = await tx.deliveryReceiptNote.findUnique({
    where: { id: noteId },
    include: { trip: true },
  });
  if (!note) throw new NoteWorkflowError("NOT_FOUND", "السند غير موجود");
  if (note.status !== "POSTED") {
    if (note.status === "CANCELLED") {
      return tx.deliveryReceiptNote.findUniqueOrThrow({ where: { id: note.id }, include: noteInclude });
    }
    throw new NoteWorkflowError("INVALID_STATUS", "يمكن إلغاء السند المرحّل فقط");
  }

  const movements = await tx.stockMovement.findMany({
    where: { referenceType: "DELIVERY_RECEIPT_NOTE", referenceId: note.id },
    orderBy: { id: "desc" },
  });
  try {
    for (const movement of movements) {
      await applyStockMovement(tx, {
        itemId: movement.itemId,
        partyId: movement.partyId,
        ownershipType: movement.ownershipType as StockOwnership,
        movementType: "REVERSAL",
        quantityIn: Number(movement.quantityOut),
        quantityOut: Number(movement.quantityIn),
        unitCost: Number(movement.unitCost),
        referenceType: "NOTE_REVERSAL",
        referenceId: note.id,
        referenceNumber: note.noteNumber,
        notes: clean(reason) ?? `عكس السند ${note.noteNumber}`,
      });
    }
  } catch (error) {
    if (error instanceof InventoryError) {
      throw new NoteWorkflowError("STOCK_ERROR", error.message);
    }
    throw error;
  }

  if (note.trip) {
    await tx.transportTrip.update({
      where: { id: note.trip.id },
      data: { status: "CANCELLED" },
    });
  }
  await reverseCogsForDeliveryNote(tx, note.id);
  const cancelled = await tx.deliveryReceiptNote.update({
    where: { id: note.id },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      notes: clean(reason) ? `${note.notes ?? ""}\nسبب الإلغاء: ${clean(reason)}`.trim() : note.notes,
    },
    include: noteInclude,
  });
  await audit(tx, { action: "CANCEL", entityType: "DELIVERY_RECEIPT_NOTE", entityId: note.id, metadata: { reason: clean(reason) } });
  return cancelled;
}

export async function changeNoteStatus(tx: Prisma.TransactionClient, noteId: number, action: "SUBMIT" | "APPROVE") {
  const note = await tx.deliveryReceiptNote.findUnique({ where: { id: noteId } });
  if (!note) throw new NoteWorkflowError("NOT_FOUND", "السند غير موجود");
  const allowed = action === "SUBMIT" ? note.status === "DRAFT" : ["DRAFT", "PENDING"].includes(note.status);
  if (!allowed) throw new NoteWorkflowError("INVALID_STATUS", "حالة السند لا تسمح بهذه العملية");
  const status = action === "SUBMIT" ? "PENDING" : "APPROVED";
  const updated = await tx.deliveryReceiptNote.update({ where: { id: noteId }, data: { status }, include: noteInclude });
  await audit(tx, { action, entityType: "DELIVERY_RECEIPT_NOTE", entityId: noteId, metadata: { from: note.status, to: status } });
  return updated;
}

export { noteInclude };
