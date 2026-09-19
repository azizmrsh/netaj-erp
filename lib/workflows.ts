import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { createNote, type NoteInput } from "@/lib/notes";
import { postSalesInvoiceJournal, postSupplierInvoiceJournal } from "@/lib/accounting";

export type WorkflowDocumentType =
  | "QUOTATION"
  | "PROFORMA_INVOICE"
  | "SALES_ORDER"
  | "PURCHASE_REQUEST"
  | "PURCHASE_ORDER";

const codes: Record<WorkflowDocumentType, string> = {
  QUOTATION: "QT",
  PROFORMA_INVOICE: "PI",
  SALES_ORDER: "SO",
  PURCHASE_REQUEST: "PR",
  PURCHASE_ORDER: "PO",
};

const conversionTarget: Partial<Record<WorkflowDocumentType, WorkflowDocumentType>> = {
  QUOTATION: "PROFORMA_INVOICE",
  PROFORMA_INVOICE: "SALES_ORDER",
  PURCHASE_REQUEST: "PURCHASE_ORDER",
};

export class WorkflowError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS" | "DUPLICATE", message: string) {
    super(message);
    this.name = "WorkflowError";
  }
}

type LineInput = {
  itemId: number | null;
  lineType: "ITEM" | "SERVICE";
  description: string | null;
  materialGrade: string | null;
  specifications: string | null;
  quantity: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
  discount: Prisma.Decimal;
  vatRate: Prisma.Decimal;
  vatAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
};

export type WorkflowInput = {
  documentType: WorkflowDocumentType;
  documentDate: Date;
  expiryDate: Date | null;
  neededDate: Date | null;
  partyId: number;
  referenceNumber: string | null;
  salesperson: string | null;
  requester: string | null;
  department: string | null;
  costCenter: string | null;
  priority: string | null;
  currency: string;
  bankDetails: string | null;
  paymentTerms: string | null;
  deliveryTime: string | null;
  deliveryPlace: string | null;
  deliveryTerms: string | null;
  notes: string | null;
  lines: LineInput[];
};

const clean = (value: unknown) => String(value ?? "").trim() || null;
const date = (value: unknown) => {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new WorkflowError("INVALID_INPUT", "التاريخ غير صحيح");
  return parsed;
};
const decimal = (value: unknown, label: string, positive = false) => {
  try {
    const parsed = new Prisma.Decimal(String(value ?? 0));
    if (parsed.isNegative() || (positive && parsed.isZero())) throw new Error();
    return parsed.toDecimalPlaces(2);
  } catch {
    throw new WorkflowError("INVALID_INPUT", `${label} غير صحيح`);
  }
};

export function parseWorkflowInput(value: unknown, forcedType?: WorkflowDocumentType): WorkflowInput {
  if (!value || typeof value !== "object") throw new WorkflowError("INVALID_INPUT", "بيانات المستند غير صحيحة");
  const body = value as Record<string, unknown>;
  const documentType = (forcedType ?? String(body.documentType ?? "").toUpperCase()) as WorkflowDocumentType;
  if (!Object.hasOwn(codes, documentType)) throw new WorkflowError("INVALID_INPUT", "نوع المستند غير صحيح");
  const partyId = Number(body.partyId);
  if (!Number.isInteger(partyId) || partyId <= 0) throw new WorkflowError("INVALID_INPUT", "العميل أو المورد غير صحيح");
  if (!Array.isArray(body.items) || !body.items.length) throw new WorkflowError("INVALID_INPUT", "يجب إضافة بند واحد على الأقل");
  const lines = body.items.map((raw, index): LineInput => {
    if (!raw || typeof raw !== "object") throw new WorkflowError("INVALID_INPUT", `البند ${index + 1} غير صحيح`);
    const row = raw as Record<string, unknown>;
    const lineType = String(row.lineType ?? "ITEM").toUpperCase() as "ITEM" | "SERVICE";
    const itemId = row.itemId ? Number(row.itemId) : null;
    if (!['ITEM','SERVICE'].includes(lineType) || (lineType === "ITEM" && (!Number.isInteger(itemId) || Number(itemId) <= 0))) {
      throw new WorkflowError("INVALID_INPUT", `مادة البند ${index + 1} غير صحيحة`);
    }
    const quantity = decimal(row.quantity, `كمية البند ${index + 1}`, true);
    const unitPrice = decimal(row.unitPrice, `سعر البند ${index + 1}`);
    const discount = decimal(row.discount, `خصم البند ${index + 1}`);
    const vatRate = decimal(row.vatRate ?? 15, `ضريبة البند ${index + 1}`);
    const beforeVat = Prisma.Decimal.max(quantity.mul(unitPrice).minus(discount), 0).toDecimalPlaces(2);
    const vatAmount = beforeVat.mul(vatRate).div(100).toDecimalPlaces(2);
    return {
      itemId, lineType, description: clean(row.description), materialGrade: clean(row.materialGrade),
      specifications: clean(row.specifications), quantity, unitPrice, discount, vatRate,
      vatAmount, totalAmount: beforeVat.plus(vatAmount).toDecimalPlaces(2),
    };
  });
  const documentDate = date(body.documentDate) ?? new Date();
  const currency = String(body.currency ?? "SAR").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new WorkflowError("INVALID_INPUT", "رمز العملة غير صحيح");
  return {
    documentType, documentDate, expiryDate: date(body.expiryDate), neededDate: date(body.neededDate), partyId,
    referenceNumber: clean(body.referenceNumber), salesperson: clean(body.salesperson), requester: clean(body.requester),
    department: clean(body.department), costCenter: clean(body.costCenter), priority: clean(body.priority), currency,
    bankDetails: clean(body.bankDetails), paymentTerms: clean(body.paymentTerms), deliveryTime: clean(body.deliveryTime),
    deliveryPlace: clean(body.deliveryPlace), deliveryTerms: clean(body.deliveryTerms), notes: clean(body.notes), lines,
  };
}

function totals(lines: LineInput[]) {
  const subtotal = lines.reduce((sum, row) => sum.plus(row.quantity.mul(row.unitPrice)), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const discount = lines.reduce((sum, row) => sum.plus(row.discount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const vatAmount = lines.reduce((sum, row) => sum.plus(row.vatAmount), new Prisma.Decimal(0)).toDecimalPlaces(2);
  return { subtotal, discount, vatAmount, totalAmount: subtotal.minus(discount).plus(vatAmount).toDecimalPlaces(2) };
}

export const workflowInclude = {
  party: true,
  sourceDocument: { select: { id: true, documentNumber: true, documentType: true } },
  convertedDocuments: { select: { id: true, documentNumber: true, documentType: true, status: true } },
  lines: { include: { item: { include: { unit: true } } }, orderBy: { sequence: "asc" as const } },
  deliveryNotes: { select: { id: true, noteNumber: true, noteType: true, status: true, trip: { select: { id: true, tripNumber: true } } } },
  salesInvoices: { select: { id: true, invoiceNumber: true, status: true } },
  supplierInvoices: { select: { id: true, purchaseNumber: true, status: true } },
} satisfies Prisma.BusinessDocumentInclude;

async function validatePartyAndItems(tx: Prisma.TransactionClient, input: WorkflowInput) {
  const party = await tx.party.findUnique({ where: { id: input.partyId } });
  const sales = ["QUOTATION", "PROFORMA_INVOICE", "SALES_ORDER"].includes(input.documentType);
  if (!party?.isActive || (sales ? !party.isCustomer : !party.isSupplier)) {
    throw new WorkflowError("INVALID_INPUT", sales ? "يجب اختيار عميل نشط" : "يجب اختيار مورد نشط");
  }
  const ids = [...new Set(input.lines.flatMap((line) => line.itemId ? [line.itemId] : []))];
  if (ids.length && await tx.item.count({ where: { id: { in: ids }, isActive: true } }) !== ids.length) {
    throw new WorkflowError("INVALID_INPUT", "توجد مادة غير موجودة أو غير نشطة");
  }
  const currency = await tx.currency.findUnique({ where: { code: input.currency } });
  if (!currency?.isActive) throw new WorkflowError("INVALID_INPUT", "العملة غير معرفة أو غير نشطة");
}

export async function createBusinessDocument(tx: Prisma.TransactionClient, input: WorkflowInput, sourceDocumentId?: number | null) {
  await validatePartyAndItems(tx, input);
  const number = await nextDocumentNumber(tx, codes[input.documentType], input.documentDate);
  const document = await tx.businessDocument.create({
    data: {
      documentNumber: number, documentType: input.documentType,
      direction: ["QUOTATION", "PROFORMA_INVOICE", "SALES_ORDER"].includes(input.documentType) ? "SALES" : "PURCHASE",
      documentDate: input.documentDate, expiryDate: input.expiryDate, neededDate: input.neededDate,
      partyId: input.partyId, sourceDocumentId: sourceDocumentId ?? null, referenceNumber: input.referenceNumber,
      salesperson: input.salesperson, requester: input.requester, department: input.department, costCenter: input.costCenter,
      priority: input.priority, currency: input.currency, bankDetails: input.bankDetails, paymentTerms: input.paymentTerms,
      deliveryTime: input.deliveryTime, deliveryPlace: input.deliveryPlace, deliveryTerms: input.deliveryTerms,
      notes: input.notes, ...totals(input.lines), status: "DRAFT",
      lines: { create: input.lines.map((line, index) => ({ sequence: index + 1, ...line })) },
    },
    include: workflowInclude,
  });
  await audit(tx, { action: "CREATE", entityType: input.documentType, entityId: document.id, metadata: { documentNumber: number, sourceDocumentId } });
  return document;
}

export async function updateBusinessDocument(tx: Prisma.TransactionClient, id: number, input: WorkflowInput) {
  const existing = await tx.businessDocument.findUnique({ where: { id } });
  if (!existing) throw new WorkflowError("NOT_FOUND", "المستند غير موجود");
  if (existing.status !== "DRAFT") throw new WorkflowError("INVALID_STATUS", "يسمح بتعديل المستند وهو مسودة فقط");
  if (existing.documentType !== input.documentType) throw new WorkflowError("INVALID_INPUT", "لا يمكن تغيير نوع المستند بعد إنشائه");
  await validatePartyAndItems(tx, input);
  const document = await tx.businessDocument.update({ where: { id }, data: {
    documentDate: input.documentDate, expiryDate: input.expiryDate, neededDate: input.neededDate, partyId: input.partyId,
    referenceNumber: input.referenceNumber, salesperson: input.salesperson, requester: input.requester, department: input.department,
    costCenter: input.costCenter, priority: input.priority, currency: input.currency, bankDetails: input.bankDetails,
    paymentTerms: input.paymentTerms, deliveryTime: input.deliveryTime, deliveryPlace: input.deliveryPlace,
    deliveryTerms: input.deliveryTerms, notes: input.notes, ...totals(input.lines),
    lines: { deleteMany: {}, create: input.lines.map((line, index) => ({ sequence: index + 1, ...line })) },
  }, include: workflowInclude });
  await audit(tx, { action: "UPDATE", entityType: existing.documentType, entityId: id, metadata: { documentNumber: existing.documentNumber, lineCount: input.lines.length } });
  return document;
}

function inputFromDocument(source: Prisma.BusinessDocumentGetPayload<{ include: { lines: true } }>, target: WorkflowDocumentType): WorkflowInput {
  return {
    documentType: target, documentDate: new Date(), expiryDate: source.expiryDate, neededDate: source.neededDate,
    partyId: source.partyId, referenceNumber: source.documentNumber, salesperson: source.salesperson,
    requester: source.requester, department: source.department, costCenter: source.costCenter, priority: source.priority,
    currency: source.currency, bankDetails: source.bankDetails, paymentTerms: source.paymentTerms,
    deliveryTime: source.deliveryTime, deliveryPlace: source.deliveryPlace, deliveryTerms: source.deliveryTerms,
    notes: source.notes, lines: source.lines.map((line) => ({ itemId: line.itemId, lineType: line.lineType as "ITEM" | "SERVICE",
      description: line.description, materialGrade: line.materialGrade, specifications: line.specifications,
      quantity: line.quantity, unitPrice: line.unitPrice, discount: line.discount, vatRate: line.vatRate,
      vatAmount: line.vatAmount, totalAmount: line.totalAmount })),
  };
}

export async function changeWorkflowStatus(tx: Prisma.TransactionClient, id: number, action: string) {
  const document = await tx.businessDocument.findUnique({ where: { id } });
  if (!document) throw new WorkflowError("NOT_FOUND", "المستند غير موجود");
  const normalized = action.toUpperCase();
  const rules: Record<string, { from: string[]; to: string }> = {
    SUBMIT: { from: ["DRAFT"], to: "PENDING" }, APPROVE: { from: ["DRAFT", "PENDING"], to: "APPROVED" },
    REJECT: { from: ["PENDING"], to: "REJECTED" }, COMPLETE: { from: ["APPROVED"], to: "COMPLETED" },
    CANCEL: { from: ["DRAFT", "PENDING", "APPROVED"], to: "CANCELLED" },
  };
  const rule = rules[normalized];
  if (!rule || !rule.from.includes(document.status)) throw new WorkflowError("INVALID_STATUS", "لا يسمح وضع المستند الحالي بهذه العملية");
  const updated = await tx.businessDocument.update({
    where: { id }, data: { status: rule.to, ...(normalized === "APPROVE" ? { approvedAt: new Date() } : {}),
      ...(normalized === "COMPLETE" ? { completedAt: new Date() } : {}), ...(normalized === "CANCEL" ? { cancelledAt: new Date() } : {}) },
    include: workflowInclude,
  });
  await audit(tx, { action: normalized, entityType: document.documentType, entityId: id, metadata: { from: document.status, to: rule.to } });
  return updated;
}

export async function convertBusinessDocument(tx: Prisma.TransactionClient, id: number, target: string, options: Record<string, unknown> = {}) {
  const source = await tx.businessDocument.findUnique({ where: { id }, include: { lines: true, deliveryNotes: true } });
  if (!source) throw new WorkflowError("NOT_FOUND", "المستند المصدر غير موجود");
  if (!["APPROVED", "COMPLETED"].includes(source.status)) throw new WorkflowError("INVALID_STATUS", "يجب اعتماد المستند قبل التحويل");
  const normalizedTarget = target.toUpperCase();
  if (conversionTarget[source.documentType as WorkflowDocumentType] === normalizedTarget) {
    const existing = await tx.businessDocument.findFirst({ where: { sourceDocumentId: source.id, documentType: normalizedTarget }, include: workflowInclude });
    if (existing) return { document: existing, created: false };
    const document = await createBusinessDocument(tx, inputFromDocument(source, normalizedTarget as WorkflowDocumentType), source.id);
    await tx.businessDocument.update({ where: { id: source.id }, data: { status: "COMPLETED", completedAt: new Date() } });
    await audit(tx, { action: "CONVERT", entityType: source.documentType, entityId: source.id, metadata: { target: normalizedTarget, targetId: document.id } });
    return { document, created: true };
  }
  const noteType = normalizedTarget === "DELIVERY_NOTE" ? "DELIVERY" : normalizedTarget === "RECEIPT_NOTE" ? "RECEIPT" : null;
  const allowed = (source.documentType === "SALES_ORDER" && noteType === "DELIVERY") || (source.documentType === "PURCHASE_ORDER" && noteType === "RECEIPT");
  if (!allowed || !noteType) throw new WorkflowError("INVALID_INPUT", "مسار التحويل غير مسموح");
  const existing = source.deliveryNotes.find((note) => note.noteType === noteType);
  if (existing) return { note: existing, created: false };
  const itemLines = source.lines.filter((line) => line.itemId !== null);
  if (!itemLines.length) throw new WorkflowError("INVALID_INPUT", "لا يمكن إنشاء سند بلا مواد مخزنية");
  const noteInput: NoteInput = {
    noteType, noteDate: new Date(), partyId: source.partyId, stockOwnership: "COMPANY",
    orderNumber: source.documentNumber, referenceNumber: source.referenceNumber,
    transportMethod: String(options.transportMethod ?? "CUSTOMER").toUpperCase() as NoteInput["transportMethod"],
    truckId: options.truckId ? Number(options.truckId) : null, driverId: options.driverId ? Number(options.driverId) : null,
    carrierName: clean(options.carrierName), vehiclePlate: clean(options.vehiclePlate), driverName: clean(options.driverName),
    source: clean(options.source), loadingPoint: clean(options.loadingPoint), unloadingPoint: clean(options.unloadingPoint),
    notes: clean(options.notes) ?? `من ${source.documentNumber}`,
    items: itemLines.map((line) => ({ itemId: Number(line.itemId), description: line.description,
      materialGrade: line.materialGrade, orderNumber: source.documentNumber, quantity: Number(line.quantity) })),
  };
  const note = await createNote(tx, noteInput);
  const linked = await tx.deliveryReceiptNote.update({ where: { id: note.id }, data: { sourceDocumentId: source.id } });
  await audit(tx, { action: "CONVERT", entityType: source.documentType, entityId: source.id, metadata: { target: normalizedTarget, noteId: note.id } });
  return { note: linked, created: true };
}

export async function createFinalInvoiceFromNote(tx: Prisma.TransactionClient, noteId: number, options: Record<string, unknown> = {}) {
  const note = await tx.deliveryReceiptNote.findUnique({
    where: { id: noteId }, include: { sourceDocument: { include: { lines: true } } },
  });
  if (!note) throw new WorkflowError("NOT_FOUND", "السند غير موجود");
  if (note.status !== "POSTED") throw new WorkflowError("INVALID_STATUS", "يجب ترحيل السند للمخزون قبل إنشاء الفاتورة");
  const order = note.sourceDocument;
  if (!order || !["SALES_ORDER", "PURCHASE_ORDER"].includes(order.documentType)) {
    throw new WorkflowError("INVALID_INPUT", "السند غير مرتبط بأمر صالح للفوترة");
  }
  const invoiceLines = order.lines.filter((line) => line.itemId !== null);
  const calculated = totals(invoiceLines.map((line) => ({ ...line, lineType: line.lineType as "ITEM" | "SERVICE" })));
  if (order.documentType === "SALES_ORDER") {
    const existing = await tx.sale.findUnique({ where: { deliveryNoteId: note.id }, include: { items: true } });
    if (existing) return { invoice: existing, journal: await postSalesInvoiceJournal(tx, existing.id), created: false };
    const invoiceNumber = await nextDocumentNumber(tx, "INV");
    const invoice = await tx.sale.create({ data: {
      invoiceNumber, invoiceDate: new Date(), partyId: note.partyId, sourceOrderId: order.id, deliveryNoteId: note.id,
      currency: order.currency,
      referenceNumber: note.referenceNumber, purchaseOrderNumber: order.referenceNumber, paymentMethod: clean(options.paymentMethod),
      dueDate: date(options.dueDate), ...calculated, status: "COMPLETED", notes: clean(options.notes) ?? order.notes,
      items: { create: invoiceLines.map((line) => ({ itemId: Number(line.itemId), description: line.description, materialGrade: line.materialGrade, quantity: line.quantity, unitPrice: line.unitPrice,
        discount: line.discount, vatRate: line.vatRate, vatAmount: line.vatAmount, totalAmount: line.totalAmount })) },
    }, include: { party: true, items: { include: { item: true } } } });
    const journal = await postSalesInvoiceJournal(tx, invoice.id);
    await audit(tx, { action: "CREATE_INVOICE", entityType: "SALES_INVOICE", entityId: invoice.id, metadata: { noteId, orderId: order.id } });
    return { invoice, journal, created: true };
  }
  const existing = await tx.purchase.findUnique({ where: { receiptNoteId: note.id }, include: { items: true } });
  if (existing) return { invoice: existing, journal: await postSupplierInvoiceJournal(tx, existing.id), created: false };
  const purchaseNumber = await nextDocumentNumber(tx, "INV");
  const invoice = await tx.purchase.create({ data: {
    purchaseNumber, purchaseDate: new Date(), partyId: note.partyId, sourceOrderId: order.id, receiptNoteId: note.id,
    currency: order.currency,
    supplierInvoiceNumber: clean(options.supplierInvoiceNumber), referenceNumber: note.referenceNumber,
    dueDate: date(options.dueDate), paymentMethod: clean(options.paymentMethod), ...calculated,
    status: "COMPLETED", notes: clean(options.notes) ?? order.notes,
    items: { create: invoiceLines.map((line) => ({ itemId: Number(line.itemId), description: line.description, materialGrade: line.materialGrade, specifications: line.specifications, quantity: line.quantity, unitPrice: line.unitPrice,
      discount: line.discount, vatRate: line.vatRate, vatAmount: line.vatAmount, totalAmount: line.totalAmount })) },
  }, include: { party: true, items: { include: { item: true } } } });
  const journal = await postSupplierInvoiceJournal(tx, invoice.id);
  await audit(tx, { action: "CREATE_INVOICE", entityType: "SUPPLIER_INVOICE", entityId: invoice.id, metadata: { noteId, orderId: order.id } });
  return { invoice, journal, created: true };
}
