import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import * as XLSX from "@stackline/xlsx";
import { audit } from "@/lib/audit";
import { commerceTotals, parseCommerceLines } from "@/lib/commerce";
import {
  getImportTarget,
  importDuplicateKey,
  importTargets,
  mapImportRow,
  suggestImportMapping,
  type ImportTargetDefinition,
} from "@/lib/import-definitions";
import { applyStockMovement } from "@/lib/inventory";
import { cancelPostedNote, createNote, postNote } from "@/lib/notes";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const MAX_ROWS = 50_000;
const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);

export class DataImportError extends Error {
  constructor(message: string, public readonly code = "IMPORT_VALIDATION", public readonly status = 400) {
    super(message);
    this.name = "DataImportError";
  }
}

export type ParsedImportRow = {
  sourceSheet: string;
  sourceRow: number;
  raw: Record<string, unknown>;
};

export type ParsedImportWorkbook = {
  fileHash: string;
  sheets: { name: string; headers: string[]; rowCount: number }[];
  headers: string[];
  rows: ParsedImportRow[];
};

function nonEmptyRow(row: Record<string, unknown>) {
  return Object.values(row).some((value) => value !== null && value !== undefined && String(value).trim() !== "");
}

export function parseImportWorkbook(bytes: Uint8Array, filename: string): ParsedImportWorkbook {
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new DataImportError("نوع الملف غير مدعوم. استخدم XLSX أو XLS أو CSV", "FILE_TYPE");
  if (!bytes.length) throw new DataImportError("الملف فارغ", "EMPTY_FILE");
  if (bytes.length > MAX_FILE_BYTES) throw new DataImportError("حجم الملف يتجاوز 15 ميجابايت", "FILE_TOO_LARGE", 413);

  let workbook: XLSX.WorkBook;
  try {
    workbook = extension === "csv"
      ? XLSX.read(new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, ""), { type: "string", cellDates: true, raw: true, dense: true })
      : XLSX.read(Buffer.from(bytes), { type: "buffer", cellDates: true, raw: true, dense: true });
  } catch {
    throw new DataImportError("تعذر قراءة الملف أو أن بنيته تالفة", "INVALID_WORKBOOK");
  }
  const rows: ParsedImportRow[] = [];
  const sheets: ParsedImportWorkbook["sheets"] = [];
  const headerSet = new Set<string>();
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
    const meaningful = data.filter(nonEmptyRow);
    const headers = Array.from(new Set(meaningful.flatMap((row) => Object.keys(row).map((value) => String(value).trim()).filter(Boolean))));
    headers.forEach((header) => headerSet.add(header));
    meaningful.forEach((raw, index) => rows.push({ sourceSheet: sheetName, sourceRow: index + 2, raw }));
    sheets.push({ name: sheetName, headers, rowCount: meaningful.length });
    if (rows.length > MAX_ROWS) throw new DataImportError("عدد الصفوف يتجاوز الحد الآمن 50,000 صف", "TOO_MANY_ROWS", 413);
  }
  if (!rows.length) throw new DataImportError("لا توجد صفوف بيانات في الملف", "NO_ROWS");
  return { fileHash: createHash("sha256").update(bytes).digest("hex"), sheets, headers: [...headerSet], rows };
}

type ValidationContext = {
  partiesByKey: Map<string, { id: number; isCustomer: boolean; isSupplier: boolean }>;
  itemsByCode: Map<string, { id: number }>;
  unitsByCode: Map<string, { id: number }>;
  accountsByCode: Map<string, { id: number; nameAr: string }>;
  employeesByNumber: Map<string, { id: number }>;
  trucksByPlate: Map<string, { id: number }>;
  driversByKey: Map<string, { id: number }>;
  existingKeys: Set<string>;
};

const key = (value: unknown) => String(value ?? "").trim().toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();
const number = (value: unknown, fallback = 0) => value === null || value === "" ? fallback : Number(value);
const date = (value: unknown, fallback = new Date()) => value ? new Date(String(value)) : fallback;
const nullable = (value: unknown) => text(value) || null;

async function loadValidationContext(tx: Prisma.TransactionClient, target: ImportTargetDefinition): Promise<ValidationContext> {
  const [parties, items, units, accounts, employees, trucks, drivers] = await Promise.all([
    tx.party.findMany({ select: { id: true, nameAr: true, unifiedNumber: true, isCustomer: true, isSupplier: true } }),
    tx.item.findMany({ select: { id: true, code: true } }),
    tx.unit.findMany({ select: { id: true, code: true } }),
    tx.account.findMany({ select: { id: true, code: true, nameAr: true } }),
    tx.employee.findMany({ select: { id: true, employeeNumber: true } }),
    tx.truck.findMany({ select: { id: true, plateNumber: true } }),
    tx.driver.findMany({ select: { id: true, idNumber: true, name: true } }),
  ]);
  const existingKeys = new Set<string>();
  if (target.key === "PARTIES") parties.forEach((row) => { if (row.unifiedNumber) existingKeys.add(key(row.unifiedNumber)); existingKeys.add(`name:${key(row.nameAr)}`); });
  if (target.key === "ITEMS") items.forEach((row) => existingKeys.add(key(row.code)));
  if (target.key === "SALES") (await tx.sale.findMany({ select: { invoiceNumber: true } })).forEach((row) => existingKeys.add(key(row.invoiceNumber)));
  if (target.key === "PURCHASES") (await tx.purchase.findMany({ select: { purchaseNumber: true } })).forEach((row) => existingKeys.add(key(row.purchaseNumber)));
  if (target.key === "NOTES") (await tx.legacyRecordLink.findMany({ where: { entityType: "DELIVERY_RECEIPT_NOTE" }, select: { legacyDocumentNumber: true } })).forEach((row) => existingKeys.add(key(row.legacyDocumentNumber)));
  if (target.key === "EXPENSES") (await tx.expense.findMany({ select: { voucherNumber: true } })).forEach((row) => existingKeys.add(key(row.voucherNumber)));
  if (target.key === "REVENUES") (await tx.revenue.findMany({ select: { voucherNumber: true } })).forEach((row) => existingKeys.add(key(row.voucherNumber)));
  if (target.key === "EMPLOYEES") employees.forEach((row) => existingKeys.add(key(row.employeeNumber)));
  if (target.key === "TRANSPORT_TRIPS") (await tx.transportTrip.findMany({ select: { tripNumber: true } })).forEach((row) => existingKeys.add(key(row.tripNumber)));
  if (target.key === "OPENING_BALANCES") (await tx.journalEntry.findMany({ where: { referenceType: "IMPORT_OPENING" }, select: { referenceNumber: true } })).forEach((row) => existingKeys.add(key(row.referenceNumber)));

  const partiesByKey = new Map<string, { id: number; isCustomer: boolean; isSupplier: boolean }>();
  parties.forEach((row) => {
    const value = { id: row.id, isCustomer: row.isCustomer, isSupplier: row.isSupplier };
    partiesByKey.set(key(row.nameAr), value);
    if (row.unifiedNumber) partiesByKey.set(key(row.unifiedNumber), value);
  });
  const driversByKey = new Map<string, { id: number }>();
  drivers.forEach((row) => { driversByKey.set(key(row.name), { id: row.id }); if (row.idNumber) driversByKey.set(key(row.idNumber), { id: row.id }); });
  return {
    partiesByKey,
    itemsByCode: new Map(items.map((row) => [key(row.code), { id: row.id }])),
    unitsByCode: new Map(units.map((row) => [key(row.code), { id: row.id }])),
    accountsByCode: new Map(accounts.map((row) => [key(row.code), { id: row.id, nameAr: row.nameAr }])),
    employeesByNumber: new Map(employees.map((row) => [key(row.employeeNumber), { id: row.id }])),
    trucksByPlate: new Map(trucks.map((row) => [key(row.plateNumber), { id: row.id }])),
    driversByKey,
    existingKeys,
  };
}

function referenceErrors(target: ImportTargetDefinition, row: Record<string, unknown>, context: ValidationContext) {
  const errors: string[] = [];
  const itemRequired = ["COMPANY_STOCK", "PARTY_STOCK", "SALES", "PURCHASES", "NOTES"].includes(target.key);
  if (itemRequired && !context.itemsByCode.has(key(row.itemCode))) errors.push("كود المادة غير موجود في الشركة الحالية");
  if (target.key === "ITEMS" && !context.unitsByCode.has(key(row.unitCode))) errors.push("كود الوحدة غير موجود");
  if (["PARTY_STOCK", "SALES", "PURCHASES", "NOTES"].includes(target.key)) {
    const party = context.partiesByKey.get(key(row.partyKey));
    if (!party) errors.push("العميل أو المورد غير موجود في الشركة الحالية");
    else if (target.key === "SALES" && !party.isCustomer) errors.push("الكيان ليس عميلًا");
    else if (target.key === "PURCHASES" && !party.isSupplier) errors.push("الكيان ليس موردًا");
  }
  if (target.key === "OPENING_BALANCES") {
    if (!context.accountsByCode.has(key(row.accountCode))) errors.push("كود الحساب غير موجود");
    const debit = number(row.debit), credit = number(row.credit);
    if ((debit <= 0 && credit <= 0) || (debit > 0 && credit > 0)) errors.push("يجب إدخال مدين أو دائن فقط");
    if (row.partyKey && !context.partiesByKey.has(key(row.partyKey))) errors.push("العميل أو المورد المرتبط غير موجود");
  }
  if (target.key === "ATTENDANCE" && !context.employeesByNumber.has(key(row.employeeNumber))) errors.push("رقم الموظف غير موجود");
  if (target.key === "TRANSPORT_TRIPS") {
    if (row.partyKey && !context.partiesByKey.has(key(row.partyKey))) errors.push("العميل غير موجود");
    if (row.itemCode && !context.itemsByCode.has(key(row.itemCode))) errors.push("المادة غير موجودة");
    if (row.plateNumber && !context.trucksByPlate.has(key(row.plateNumber))) errors.push("الشاحنة غير موجودة");
    if (row.driverKey && !context.driversByKey.has(key(row.driverKey))) errors.push("السائق غير موجود");
  }
  if (target.key === "NOTES") {
    if (!["RECEIPT", "DELIVERY", "استلام", "تسليم"].includes(text(row.noteType).toUpperCase())) errors.push("نوع السند يجب أن يكون RECEIPT/DELIVERY أو استلام/تسليم");
    if (!["COMPANY", "PARTY", "شركة", "عميل"].includes(text(row.stockOwnership).toUpperCase())) errors.push("ملكية المخزون يجب أن تكون COMPANY/PARTY أو شركة/عميل");
    if (row.plateNumber && !context.trucksByPlate.has(key(row.plateNumber))) errors.push("الشاحنة غير موجودة");
    if (row.driverKey && !context.driversByKey.has(key(row.driverKey))) errors.push("السائق غير موجود");
  }
  for (const numericField of target.fields.filter((field) => field.type === "number")) {
    const value = row[numericField.key];
    if (value !== null && (!Number.isFinite(Number(value)) || Number(value) < 0)) errors.push(`${numericField.labelAr} يجب أن يكون رقمًا موجبًا أو صفرًا`);
  }
  return errors;
}

function existingDuplicate(target: ImportTargetDefinition, row: Record<string, unknown>, context: ValidationContext) {
  if (target.key === "PARTIES") return row.unifiedNumber ? context.existingKeys.has(key(row.unifiedNumber)) : context.existingKeys.has(`name:${key(row.nameAr)}`);
  if (target.key === "SALES") return context.existingKeys.has(key(row.invoiceNumber));
  if (target.key === "PURCHASES") return context.existingKeys.has(key(row.purchaseNumber));
  if (target.key === "EXPENSES" || target.key === "REVENUES") return context.existingKeys.has(key(row.voucherNumber));
  if (target.key === "EMPLOYEES") return context.existingKeys.has(key(row.employeeNumber));
  if (target.key === "TRANSPORT_TRIPS") return context.existingKeys.has(key(row.tripNumber));
  if (target.key === "NOTES") return context.existingKeys.has(key(row.noteNumber));
  if (target.key === "ITEMS") return context.existingKeys.has(key(row.code));
  return false;
}

export async function createImportPreview(
  tx: Prisma.TransactionClient,
  input: {
    bytes: Uint8Array;
    filename: string;
    targetType: string;
    importMode: string;
    duplicateStrategy: string;
    mapping?: Record<string, string>;
    createdBy?: string | null;
  }
) {
  const target = getImportTarget(input.targetType);
  if (!target) throw new DataImportError("هدف الاستيراد غير مدعوم", "TARGET_NOT_SUPPORTED");
  if (!["HISTORICAL", "OPENING", "FULL"].includes(input.importMode)) throw new DataImportError("وضع الاستيراد غير صالح");
  if (!["SKIP", "UPDATE", "MERGE", "CREATE"].includes(input.duplicateStrategy)) throw new DataImportError("سياسة التكرار غير صالحة");
  const parsed = parseImportWorkbook(input.bytes, input.filename);
  const mapping = input.mapping && Object.keys(input.mapping).length ? input.mapping : suggestImportMapping(parsed.headers, target);
  const context = await loadValidationContext(tx, target);
  const seen = new Set<string>();
  let validRows = 0, invalidRows = 0, duplicateRows = 0;
  const prepared = parsed.rows.map((source) => {
    const mapped = mapImportRow(source.raw, mapping, target);
    const duplicateKey = importDuplicateKey(target, mapped.mapped);
    const errors = [...mapped.errors, ...referenceErrors(target, mapped.mapped, context)];
    const isDuplicate = seen.has(duplicateKey) || existingDuplicate(target, mapped.mapped, context);
    seen.add(duplicateKey);
    const warnings = isDuplicate ? ["سجل مكرر حسب مفتاح المطابقة"] : [];
    const status = errors.length ? "INVALID" : isDuplicate ? "DUPLICATE" : "VALID";
    if (status === "INVALID") invalidRows += 1;
    else if (status === "DUPLICATE") duplicateRows += 1;
    else validRows += 1;
    return { source, mapped: mapped.mapped, errors, warnings, duplicateKey, status };
  });
  if (target.key === "OPENING_BALANCES" && !invalidRows) {
    const debit = prepared.reduce((sum, row) => sum + number(row.mapped.debit), 0);
    const credit = prepared.reduce((sum, row) => sum + number(row.mapped.credit), 0);
    if (Math.abs(debit - credit) > 0.005) {
      prepared.forEach((row) => { row.errors.push(`القيد الافتتاحي غير متوازن: المدين ${debit} والدائن ${credit}`); row.status = "INVALID"; });
      invalidRows = prepared.length; validRows = 0; duplicateRows = 0;
    }
  }
  const batchNumber = `IMP-${new Date().toISOString().replace(/\D/g, "").slice(0, 14)}-${randomUUID().slice(0, 6).toUpperCase()}`;
  const batch = await tx.importBatch.create({
    data: {
      batchNumber, targetType: target.key, importMode: input.importMode, duplicateStrategy: input.duplicateStrategy,
      sourceFile: input.filename.slice(0, 255), fileHash: parsed.fileHash, mappingJson: JSON.stringify(mapping),
      sheetsJson: JSON.stringify(parsed.sheets), totalRows: prepared.length, validRows, invalidRows, duplicateRows,
      summaryJson: JSON.stringify({ headers: parsed.headers, target: target.labelAr }), createdBy: input.createdBy ?? null,
      rows: { create: prepared.map((row) => ({
        sourceSheet: row.source.sourceSheet, sourceRow: row.source.sourceRow, rawDataJson: JSON.stringify(row.source.raw),
        mappedDataJson: JSON.stringify(row.mapped), status: row.status, errorsJson: JSON.stringify(row.errors),
        warningsJson: JSON.stringify(row.warnings), duplicateKey: row.duplicateKey,
      })) },
    }, include: { rows: { orderBy: [{ sourceSheet: "asc" }, { sourceRow: "asc" }], take: 200 } },
  });
  await audit(tx, { action: "IMPORT_PREVIEW", entityType: "IMPORT_BATCH", entityId: batch.id, userId: input.createdBy, metadata: { batchNumber, targetType: target.key, totalRows: prepared.length, invalidRows, duplicateRows } });
  return serializeBatch(batch);
}

function serializeJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

export function serializeBatch<T extends { mappingJson: string; sheetsJson: string; summaryJson: string; rows?: { rawDataJson: string; mappedDataJson: string; errorsJson: string; warningsJson: string }[] }>(batch: T) {
  return {
    ...batch,
    mapping: serializeJson(batch.mappingJson), sheets: serializeJson(batch.sheetsJson), summary: serializeJson(batch.summaryJson),
    rows: batch.rows?.map((row) => ({ ...row, rawData: serializeJson(row.rawDataJson), mappedData: serializeJson(row.mappedDataJson), errors: serializeJson(row.errorsJson), warnings: serializeJson(row.warningsJson) })),
  };
}

function mergeData(existing: Record<string, unknown>, incoming: Record<string, unknown>, strategy: string) {
  if (strategy === "UPDATE") return incoming;
  const merged = { ...existing };
  for (const [field, value] of Object.entries(incoming)) if ((merged[field] === null || merged[field] === "") && value !== null && value !== "") merged[field] = value;
  return merged;
}

async function linkImportedRow(tx: Prisma.TransactionClient, batch: { id: number; sourceFile: string; createdBy: string | null }, row: { id: number; sourceSheet: string; sourceRow: number }, entityType: string, entityId: number, wasCreated: boolean, legacyNumber: string | null, beforeData?: unknown) {
  await tx.legacyRecordLink.create({ data: {
    importBatchId: batch.id, importRowId: row.id, entityType, entityId, legacySource: "DATA_IMPORT_CENTER",
    legacyDocumentNumber: legacyNumber, sourceFile: batch.sourceFile, sourceSheet: row.sourceSheet, sourceRow: row.sourceRow,
    importedBy: batch.createdBy, wasCreated, beforeDataJson: beforeData === undefined ? null : JSON.stringify(beforeData),
  } });
  await tx.importRow.update({ where: { id: row.id }, data: { status: "IMPORTED", entityType, entityId, operation: wasCreated ? "CREATE" : "UPDATE", importedAt: new Date() } });
}

async function executeParty(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>) {
  const existing = data.unifiedNumber
    ? await tx.party.findFirst({ where: { unifiedNumber: text(data.unifiedNumber) } })
    : await tx.party.findFirst({ where: { nameAr: text(data.nameAr) } });
  if (existing && batch.duplicateStrategy === "SKIP") return markSkipped(tx, row.id);
  if (existing && batch.duplicateStrategy === "CREATE") throw new DataImportError(`لا يمكن إنشاء كيان مكرر في الصف ${row.sourceRow}`);
  const payload = {
    nameAr: text(data.nameAr), nameEn: nullable(data.nameEn), unifiedNumber: nullable(data.unifiedNumber), vatNumber: nullable(data.vatNumber),
    telephone: nullable(data.telephone), email: nullable(data.email), isCustomer: Boolean(data.isCustomer), isSupplier: Boolean(data.isSupplier), notes: nullable(data.notes),
  };
  const party = existing
    ? await tx.party.update({ where: { id: existing.id }, data: mergeData(existing as unknown as Record<string, unknown>, payload, batch.duplicateStrategy) })
    : await tx.party.create({ data: { ...payload, isCustomer: payload.isCustomer || !payload.isSupplier } });
  if (data.city || data.district || data.street || data.postalCode) await tx.partyAddress.upsert({ where: { partyId: party.id }, create: { partyId: party.id, city: nullable(data.city), district: nullable(data.district), street: nullable(data.street), postalCode: nullable(data.postalCode) }, update: { city: nullable(data.city), district: nullable(data.district), street: nullable(data.street), postalCode: nullable(data.postalCode) } });
  await linkImportedRow(tx, batch, row, "PARTY", party.id, !existing, nullable(data.unifiedNumber));
  return !existing ? "created" : "updated";
}

async function executeItem(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>) {
  const existing = await tx.item.findFirst({ where: { code: text(data.code) } });
  if (existing && batch.duplicateStrategy === "SKIP") return markSkipped(tx, row.id);
  if (existing && batch.duplicateStrategy === "CREATE") throw new DataImportError(`كود المادة مكرر في الصف ${row.sourceRow}`);
  const unit = await tx.unit.findFirstOrThrow({ where: { code: text(data.unitCode) } });
  let categoryId: number | null = null;
  if (data.category) {
    const categoryName = text(data.category);
    const category = await tx.itemCategory.findFirst({ where: { nameAr: categoryName } }) ?? await tx.itemCategory.create({ data: { nameAr: categoryName } });
    categoryId = category.id;
  }
  const payload = { code: text(data.code), nameAr: text(data.nameAr), nameEn: nullable(data.nameEn), unitId: unit.id, categoryId, costPrice: number(data.costPrice), salePrice: number(data.salePrice), vatRate: number(data.vatRate, 15), minimumStock: number(data.minimumStock), specification: nullable(data.specification) };
  const item = existing ? await tx.item.update({ where: { id: existing.id }, data: mergeData(existing as unknown as Record<string, unknown>, payload, batch.duplicateStrategy) }) : await tx.item.create({ data: payload });
  await linkImportedRow(tx, batch, row, "ITEM", item.id, !existing, text(data.code));
  return !existing ? "created" : "updated";
}

async function executeStock(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>, ownershipType: "COMPANY" | "PARTY") {
  const item = await tx.item.findFirstOrThrow({ where: { code: text(data.itemCode) } });
  const party = ownershipType === "PARTY" ? await findParty(tx, data.partyKey) : null;
  const before = ownershipType === "COMPANY"
    ? await tx.companyStock.findFirst({ where: { itemId: item.id } })
    : await tx.partyStockAccount.findFirst({ where: { partyId: party!.id, itemId: item.id } });
  const quantity = number(data.quantity);
  const result = await applyStockMovement(tx, { itemId: item.id, partyId: party?.id, ownershipType, movementType: "OPENING", quantityIn: quantity >= 0 ? quantity : 0, quantityOut: quantity < 0 ? Math.abs(quantity) : 0, unitCost: number(data.unitCost), movementDate: date(data.movementDate), referenceType: "IMPORT_BATCH", referenceId: batch.id, referenceNumber: nullable(data.referenceNumber) ?? batch.batchNumber, notes: nullable(data.notes) });
  await linkImportedRow(tx, batch, row, "STOCK_MOVEMENT", result.movement.id, true, nullable(data.referenceNumber), before ? { quantity: Number(before.quantity), average: Number("averageCost" in before ? before.averageCost : before.averageValue), ownershipType, itemId: item.id, partyId: party?.id ?? null } : { quantity: 0, average: 0, ownershipType, itemId: item.id, partyId: party?.id ?? null });
  return "created";
}

async function findParty(tx: Prisma.TransactionClient, value: unknown) {
  const party = await tx.party.findFirst({ where: { OR: [{ unifiedNumber: text(value) }, { nameAr: text(value) }] } });
  if (!party) throw new DataImportError(`العميل أو المورد ${text(value)} غير موجود`);
  return party;
}

async function executeEmployee(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>) {
  const existing = await tx.employee.findFirst({ where: { employeeNumber: text(data.employeeNumber) } });
  if (existing && batch.duplicateStrategy === "SKIP") return markSkipped(tx, row.id);
  if (existing && batch.duplicateStrategy === "CREATE") throw new DataImportError(`رقم الموظف مكرر في الصف ${row.sourceRow}`);
  const payload = { employeeNumber: text(data.employeeNumber), nameAr: text(data.nameAr), idNumber: nullable(data.idNumber), department: nullable(data.department), jobTitle: nullable(data.jobTitle), phone: nullable(data.phone), hireDate: data.hireDate ? date(data.hireDate) : null, basicSalary: number(data.basicSalary), housingAllowance: number(data.housingAllowance), transportAllowance: number(data.transportAllowance), iban: nullable(data.iban), status: nullable(data.status) ?? "ACTIVE" };
  const employee = existing ? await tx.employee.update({ where: { id: existing.id }, data: mergeData(existing as unknown as Record<string, unknown>, payload, batch.duplicateStrategy) }) : await tx.employee.create({ data: payload });
  await linkImportedRow(tx, batch, row, "EMPLOYEE", employee.id, !existing, text(data.employeeNumber));
  return !existing ? "created" : "updated";
}

async function executeAttendance(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>) {
  const employee = await tx.employee.findFirstOrThrow({ where: { employeeNumber: text(data.employeeNumber) } });
  const attendanceDate = date(data.attendanceDate);
  const existing = await tx.attendanceRecord.findFirst({ where: { employeeId: employee.id, attendanceDate } });
  if (existing && batch.duplicateStrategy === "SKIP") return markSkipped(tx, row.id);
  const payload = { employeeId: employee.id, attendanceDate, status: text(data.status), workHours: number(data.workHours), overtimeHours: number(data.overtimeHours), checkIn: nullable(data.checkIn), checkOut: nullable(data.checkOut), notes: nullable(data.notes) };
  const record = existing ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: payload }) : await tx.attendanceRecord.create({ data: payload });
  await linkImportedRow(tx, batch, row, "ATTENDANCE", record.id, !existing, `${employee.employeeNumber}-${attendanceDate.toISOString().slice(0, 10)}`);
  return !existing ? "created" : "updated";
}

async function executeTrip(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>) {
  const existing = await tx.transportTrip.findFirst({ where: { tripNumber: text(data.tripNumber) } });
  if (existing && batch.duplicateStrategy === "SKIP") return markSkipped(tx, row.id);
  if (existing && batch.duplicateStrategy === "CREATE") throw new DataImportError(`رقم الرحلة مكرر في الصف ${row.sourceRow}`);
  const party = data.partyKey ? await findParty(tx, data.partyKey) : null;
  const item = data.itemCode ? await tx.item.findFirstOrThrow({ where: { code: text(data.itemCode) } }) : null;
  const truck = data.plateNumber ? await tx.truck.findFirstOrThrow({ where: { plateNumber: text(data.plateNumber) } }) : null;
  const driver = data.driverKey ? await tx.driver.findFirst({ where: { OR: [{ idNumber: text(data.driverKey) }, { name: text(data.driverKey) }] } }) : null;
  const fuelCost = number(data.fuelCost), driverTripFee = number(data.driverTripFee), otherCost = number(data.otherCost), revenue = number(data.transportRevenue);
  const payload = { tripNumber: text(data.tripNumber), tripDate: date(data.tripDate), partyId: party?.id ?? null, itemId: item?.id ?? null, truckId: truck?.id ?? null, driverId: driver?.id ?? null, quantity: number(data.quantity), transportRevenue: revenue, fuelCost, driverTripFee, otherCost, totalCost: fuelCost + driverTripFee + otherCost, netProfit: revenue - fuelCost - driverTripFee - otherCost, loadingPoint: nullable(data.loadingPoint), unloadingPoint: nullable(data.unloadingPoint), status: nullable(data.status) ?? "CLOSED", notes: nullable(data.notes) };
  const trip = existing ? await tx.transportTrip.update({ where: { id: existing.id }, data: payload }) : await tx.transportTrip.create({ data: payload });
  await linkImportedRow(tx, batch, row, "TRANSPORT_TRIP", trip.id, !existing, trip.tripNumber);
  return !existing ? "created" : "updated";
}

async function executeExpenseRevenue(tx: Prisma.TransactionClient, batch: BatchForExecution, row: BatchRow, data: Record<string, unknown>, kind: "EXPENSE" | "REVENUE") {
  const isExpense = kind === "EXPENSE";
  const existing = isExpense ? await tx.expense.findFirst({ where: { voucherNumber: text(data.voucherNumber) } }) : await tx.revenue.findFirst({ where: { voucherNumber: text(data.voucherNumber) } });
  if (existing && batch.duplicateStrategy === "SKIP") return markSkipped(tx, row.id);
  if (existing && batch.duplicateStrategy === "CREATE") throw new DataImportError(`رقم السند مكرر في الصف ${row.sourceRow}`);
  const beforeVat = number(data.amountBeforeVat), vatAmount = number(data.vatAmount), exchangeRate = number(data.exchangeRate, 1), totalAmount = beforeVat + vatAmount;
  const common = { voucherNumber: text(data.voucherNumber), description: nullable(data.description), amountBeforeVat: beforeVat, vatAmount, totalAmount, currency: nullable(data.currency) ?? "SAR", exchangeRate, functionalAmountBeforeVat: beforeVat * exchangeRate, functionalVatAmount: vatAmount * exchangeRate, functionalTotalAmount: totalAmount * exchangeRate, referenceNumber: nullable(data.referenceNumber), notes: nullable(data.notes), status: "DRAFT" };
  if (isExpense) {
    const payload = { ...common, expenseDate: date(data.expenseDate), expenseType: text(data.expenseType) };
    const record = existing ? await tx.expense.update({ where: { id: existing.id }, data: payload }) : await tx.expense.create({ data: payload });
    await linkImportedRow(tx, batch, row, "EXPENSE", record.id, !existing, record.voucherNumber);
  } else {
    const payload = { ...common, revenueDate: date(data.revenueDate), revenueType: text(data.revenueType) };
    const record = existing ? await tx.revenue.update({ where: { id: existing.id }, data: payload }) : await tx.revenue.create({ data: payload });
    await linkImportedRow(tx, batch, row, "REVENUE", record.id, !existing, record.voucherNumber);
  }
  return !existing ? "created" : "updated";
}

type BatchRow = { id: number; sourceSheet: string; sourceRow: number; mappedDataJson: string; status: string };
type BatchForExecution = { id: number; batchNumber: string; targetType: string; importMode: string; duplicateStrategy: string; sourceFile: string; createdBy: string | null };

async function markSkipped(tx: Prisma.TransactionClient, rowId: number) {
  await tx.importRow.update({ where: { id: rowId }, data: { status: "SKIPPED", operation: "SKIP", importedAt: new Date() } });
  return "skipped";
}

async function executeCommerce(tx: Prisma.TransactionClient, batch: BatchForExecution, rows: BatchRow[], type: "SALE" | "PURCHASE") {
  const groups = new Map<string, { rows: BatchRow[]; data: Record<string, unknown>[] }>();
  for (const row of rows) {
    const data = JSON.parse(row.mappedDataJson) as Record<string, unknown>;
    const documentNumber = text(type === "SALE" ? data.invoiceNumber : data.purchaseNumber);
    const group = groups.get(documentNumber) ?? { rows: [], data: [] };
    group.rows.push(row); group.data.push(data); groups.set(documentNumber, group);
  }
  let created = 0, updated = 0, skipped = 0;
  for (const [documentNumber, group] of groups) {
    const existing = type === "SALE" ? await tx.sale.findFirst({ where: { invoiceNumber: documentNumber } }) : await tx.purchase.findFirst({ where: { purchaseNumber: documentNumber } });
    if (existing && batch.duplicateStrategy === "SKIP") { for (const row of group.rows) await markSkipped(tx, row.id); skipped += group.rows.length; continue; }
    if (existing && batch.duplicateStrategy === "CREATE") throw new DataImportError(`رقم المستند ${documentNumber} مكرر`);
    if (existing && existing.status !== "DRAFT") throw new DataImportError(`لا يمكن تحديث المستند ${documentNumber} لأنه ليس مسودة`);
    const first = group.data[0], party = await findParty(tx, first.partyKey);
    const lines = parseCommerceLines(await Promise.all(group.data.map(async (data) => ({ itemId: (await tx.item.findFirstOrThrow({ where: { code: text(data.itemCode) } })).id, quantity: number(data.quantity), unitPrice: number(data.unitPrice), discount: number(data.discount), vatRate: number(data.vatRate, 15) }))));
    const totals = commerceTotals(lines), exchangeRate = number(first.exchangeRate, 1), currency = nullable(first.currency) ?? "SAR";
    if (type === "SALE") {
      const payload = { invoiceNumber: documentNumber, invoiceDate: date(first.invoiceDate), partyId: party.id, referenceNumber: nullable(first.referenceNumber), dueDate: first.dueDate ? date(first.dueDate) : null, currency, exchangeRate, ...totals, functionalSubtotal: totals.subtotal * exchangeRate, functionalDiscount: totals.discount * exchangeRate, functionalVatAmount: totals.vatAmount * exchangeRate, functionalTotalAmount: totals.totalAmount * exchangeRate, status: "DRAFT", notes: nullable(first.notes) };
      const record = existing ? await tx.sale.update({ where: { id: existing.id }, data: { ...payload, items: { deleteMany: {}, create: lines } } }) : await tx.sale.create({ data: { ...payload, items: { create: lines } } });
      for (const row of group.rows) await linkImportedRow(tx, batch, row, "SALE", record.id, !existing, documentNumber);
    } else {
      const payload = { purchaseNumber: documentNumber, purchaseDate: date(first.purchaseDate), partyId: party.id, referenceNumber: nullable(first.referenceNumber), dueDate: first.dueDate ? date(first.dueDate) : null, currency, exchangeRate, ...totals, functionalSubtotal: totals.subtotal * exchangeRate, functionalDiscount: totals.discount * exchangeRate, functionalVatAmount: totals.vatAmount * exchangeRate, functionalTotalAmount: totals.totalAmount * exchangeRate, status: "DRAFT", notes: nullable(first.notes) };
      const record = existing ? await tx.purchase.update({ where: { id: existing.id }, data: { ...payload, items: { deleteMany: {}, create: lines } } }) : await tx.purchase.create({ data: { ...payload, items: { create: lines } } });
      for (const row of group.rows) await linkImportedRow(tx, batch, row, "PURCHASE", record.id, !existing, documentNumber);
    }
    if (existing) updated += group.rows.length; else created += group.rows.length;
  }
  return { created, updated, skipped };
}

function normalizedNoteType(value: unknown): "RECEIPT" | "DELIVERY" {
  const normalized = text(value).toUpperCase();
  return normalized === "RECEIPT" || normalized === "استلام" ? "RECEIPT" : "DELIVERY";
}

function normalizedOwnership(value: unknown): "COMPANY" | "PARTY" {
  const normalized = text(value).toUpperCase();
  return normalized === "COMPANY" || normalized === "شركة" ? "COMPANY" : "PARTY";
}

async function executeNotes(tx: Prisma.TransactionClient, batch: BatchForExecution, rows: BatchRow[]) {
  const groups = new Map<string, { rows: BatchRow[]; data: Record<string, unknown>[] }>();
  for (const row of rows) {
    const data = JSON.parse(row.mappedDataJson) as Record<string, unknown>, legacyNumber = text(data.noteNumber);
    const group = groups.get(legacyNumber) ?? { rows: [], data: [] };
    group.rows.push(row); group.data.push(data); groups.set(legacyNumber, group);
  }
  let created = 0, skipped = 0;
  for (const [legacyNumber, group] of groups) {
    const alreadyImported = await tx.legacyRecordLink.findFirst({ where: { entityType: "DELIVERY_RECEIPT_NOTE", legacyDocumentNumber: legacyNumber } });
    if (alreadyImported) {
      if (batch.duplicateStrategy === "SKIP") { for (const row of group.rows) await markSkipped(tx, row.id); skipped += group.rows.length; continue; }
      throw new DataImportError(`السند القديم ${legacyNumber} مستورد مسبقًا؛ تحديث السندات المرحلة غير مسموح`);
    }
    const first = group.data[0], party = await findParty(tx, first.partyKey);
    const truck = first.plateNumber ? await tx.truck.findFirstOrThrow({ where: { plateNumber: text(first.plateNumber) } }) : null;
    const driver = first.driverKey ? await tx.driver.findFirst({ where: { OR: [{ idNumber: text(first.driverKey) }, { name: text(first.driverKey) }] } }) : null;
    const items = await Promise.all(group.data.map(async (data) => ({
      itemId: (await tx.item.findFirstOrThrow({ where: { code: text(data.itemCode) } })).id,
      quantity: number(data.quantity), weight: data.weight === null ? null : number(data.weight),
      orderNumber: String(data.lineNumber ?? ""), description: `مرحل من ${batch.sourceFile}`,
    })));
    const transportMethod = nullable(first.transportMethod)?.toUpperCase();
    const createdNote = await createNote(tx, {
      noteType: normalizedNoteType(first.noteType), noteDate: date(first.noteDate), partyId: party.id,
      stockOwnership: normalizedOwnership(first.stockOwnership), referenceNumber: nullable(first.referenceNumber) ?? legacyNumber,
      transportMethod: transportMethod === "COMPANY" || transportMethod === "CUSTOMER" || transportMethod === "EXTERNAL" ? transportMethod : null,
      truckId: truck?.id ?? null, driverId: driver?.id ?? null, loadingPoint: nullable(first.loadingPoint), unloadingPoint: nullable(first.unloadingPoint),
      notes: [nullable(first.notes), `رقم السند القديم: ${legacyNumber}`].filter(Boolean).join(" · "), items,
    });
    const finalNote = batch.importMode === "FULL" ? (await postNote(tx, createdNote.id)).note : createdNote;
    for (const row of group.rows) await linkImportedRow(tx, batch, row, "DELIVERY_RECEIPT_NOTE", finalNote.id, true, legacyNumber);
    created += group.rows.length;
  }
  return { created, updated: 0, skipped };
}

async function executeOpeningBalances(tx: Prisma.TransactionClient, batch: BatchForExecution, rows: BatchRow[]) {
  const existing = await tx.journalEntry.findFirst({ where: { referenceType: "IMPORT_OPENING", referenceId: batch.id } });
  if (existing) throw new DataImportError("تم إنشاء القيد الافتتاحي لهذه الدفعة مسبقًا");
  const mapped = rows.map((row) => ({ row, data: JSON.parse(row.mappedDataJson) as Record<string, unknown> }));
  const lines = await Promise.all(mapped.map(async ({ data }) => {
    const account = await tx.account.findFirstOrThrow({ where: { code: text(data.accountCode) } });
    const party = data.partyKey ? await findParty(tx, data.partyKey) : null;
    const exchangeRate = number(data.exchangeRate, 1), transactionDebit = number(data.debit), transactionCredit = number(data.credit);
    return { accountId: account.id, accountCode: account.code, accountName: account.nameAr, debit: transactionDebit * exchangeRate, credit: transactionCredit * exchangeRate, transactionDebit, transactionCredit, transactionCurrencyCode: nullable(data.currency) ?? "SAR", exchangeRate, partyId: party?.id ?? null, description: nullable(data.description) };
  }));
  const totalDebit = lines.reduce((sum, line) => sum + number(line.debit), 0), totalCredit = lines.reduce((sum, line) => sum + number(line.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.005) throw new DataImportError("القيد الافتتاحي غير متوازن بعد تحويل العملة");
  const record = await tx.journalEntry.create({ data: { entryNumber: `OPEN-${batch.batchNumber}`, entryDate: date(mapped[0]?.data.entryDate), description: `أرصدة افتتاحية مستوردة - ${batch.sourceFile}`, referenceType: "IMPORT_OPENING", referenceId: batch.id, referenceNumber: batch.batchNumber, status: "POSTED", totalDebit, totalCredit, totalTransactionDebit: lines.reduce((sum, line) => sum + number(line.transactionDebit), 0), totalTransactionCredit: lines.reduce((sum, line) => sum + number(line.transactionCredit), 0), postedAt: new Date(), lines: { create: lines } } });
  for (const { row } of mapped) await linkImportedRow(tx, batch, row, "JOURNAL_ENTRY", record.id, true, batch.batchNumber);
  return { created: rows.length, updated: 0, skipped: 0 };
}

export async function executeImportBatch(tx: Prisma.TransactionClient, batchId: number, userId?: string | null) {
  const batch = await tx.importBatch.findFirst({ where: { id: batchId }, include: { rows: { orderBy: { id: "asc" } } } });
  if (!batch) throw new DataImportError("دفعة الاستيراد غير موجودة", "NOT_FOUND", 404);
  if (batch.status !== "PREVIEW" && batch.status !== "FAILED") throw new DataImportError("حالة الدفعة لا تسمح بالتنفيذ", "INVALID_STATUS", 409);
  if (batch.invalidRows > 0) throw new DataImportError("يجب معالجة الصفوف غير الصالحة قبل التنفيذ", "INVALID_ROWS", 409);
  const executable = batch.rows.filter((row) => row.status === "VALID" || row.status === "DUPLICATE");
  await tx.importBatch.update({ where: { id: batch.id }, data: { status: "RUNNING", failureReason: null } });
  let created = 0, updated = 0, skipped = 0;
  if (batch.targetType === "SALES" || batch.targetType === "PURCHASES") {
    const result = await executeCommerce(tx, batch, executable, batch.targetType === "SALES" ? "SALE" : "PURCHASE");
    created += result.created; updated += result.updated; skipped += result.skipped;
  } else if (batch.targetType === "NOTES") {
    const result = await executeNotes(tx, batch, executable); created += result.created; skipped += result.skipped;
  } else if (batch.targetType === "OPENING_BALANCES") {
    const result = await executeOpeningBalances(tx, batch, executable); created += result.created;
  } else {
    for (const row of executable) {
      if (row.status === "DUPLICATE" && batch.duplicateStrategy === "SKIP") { await markSkipped(tx, row.id); skipped += 1; continue; }
      const data = JSON.parse(row.mappedDataJson) as Record<string, unknown>;
      let outcome: string | undefined;
      if (batch.targetType === "PARTIES") outcome = await executeParty(tx, batch, row, data);
      else if (batch.targetType === "ITEMS") outcome = await executeItem(tx, batch, row, data);
      else if (batch.targetType === "COMPANY_STOCK") outcome = await executeStock(tx, batch, row, data, "COMPANY");
      else if (batch.targetType === "PARTY_STOCK") outcome = await executeStock(tx, batch, row, data, "PARTY");
      else if (batch.targetType === "EMPLOYEES") outcome = await executeEmployee(tx, batch, row, data);
      else if (batch.targetType === "ATTENDANCE") outcome = await executeAttendance(tx, batch, row, data);
      else if (batch.targetType === "TRANSPORT_TRIPS") outcome = await executeTrip(tx, batch, row, data);
      else if (batch.targetType === "EXPENSES") outcome = await executeExpenseRevenue(tx, batch, row, data, "EXPENSE");
      else if (batch.targetType === "REVENUES") outcome = await executeExpenseRevenue(tx, batch, row, data, "REVENUE");
      else throw new DataImportError("هدف التنفيذ غير مدعوم");
      if (outcome === "created") created += 1; else if (outcome === "updated") updated += 1; else skipped += 1;
    }
  }
  const completed = await tx.importBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED", createdRows: created, updatedRows: updated, skippedRows: skipped, executedAt: new Date() }, include: { rows: { orderBy: { id: "asc" }, take: 200 } } });
  await audit(tx, { action: "IMPORT_EXECUTE", entityType: "IMPORT_BATCH", entityId: batch.id, userId, metadata: { targetType: batch.targetType, created, updated, skipped } });
  return serializeBatch(completed);
}

export async function rollbackImportBatch(tx: Prisma.TransactionClient, batchId: number, userId?: string | null) {
  const batch = await tx.importBatch.findFirst({ where: { id: batchId }, include: { links: { orderBy: { id: "desc" } } } });
  if (!batch) throw new DataImportError("دفعة الاستيراد غير موجودة", "NOT_FOUND", 404);
  if (batch.status !== "COMPLETED") throw new DataImportError("يمكن التراجع عن دفعة مكتملة فقط", "INVALID_STATUS", 409);
  const processed = new Set<string>();
  for (const link of batch.links) {
    if (!link.wasCreated) continue;
    const identity = `${link.entityType}:${link.entityId}`;
    if (processed.has(identity)) continue;
    processed.add(identity);
    if (link.entityType === "STOCK_MOVEMENT") {
      const movement = await tx.stockMovement.findFirstOrThrow({ where: { id: link.entityId } });
      const later = await tx.stockMovement.count({ where: { id: { gt: movement.id }, itemId: movement.itemId, ownershipType: movement.ownershipType, partyId: movement.partyId } });
      if (later) throw new DataImportError(`لا يمكن التراجع: توجد حركات مخزون لاحقة للمادة ${movement.itemId}`, "ROLLBACK_DEPENDENCY", 409);
      const before = link.beforeDataJson ? JSON.parse(link.beforeDataJson) as { quantity: number; average: number; ownershipType: string; itemId: number; partyId: number | null } : null;
      if (!before) throw new DataImportError("لا توجد حالة سابقة محفوظة لحركة المخزون", "ROLLBACK_STATE", 409);
      if (before.ownershipType === "COMPANY") await tx.companyStock.update({ where: { itemId: before.itemId }, data: { quantity: before.quantity, averageCost: before.average } });
      else await tx.partyStockAccount.update({ where: { partyId_itemId: { partyId: Number(before.partyId), itemId: before.itemId } }, data: { quantity: before.quantity, averageValue: before.average } });
      await tx.stockMovement.delete({ where: { id: movement.id } });
    } else if (link.entityType === "SALE") {
      const record = await tx.sale.findFirstOrThrow({ where: { id: link.entityId } });
      if (record.status !== "DRAFT" || record.deliveryNoteId) throw new DataImportError(`فاتورة ${record.invoiceNumber} أصبحت مرتبطة ولا يمكن حذفها`, "ROLLBACK_DEPENDENCY", 409);
      await tx.sale.delete({ where: { id: record.id } });
    } else if (link.entityType === "PURCHASE") {
      const record = await tx.purchase.findFirstOrThrow({ where: { id: link.entityId } });
      if (record.status !== "DRAFT" || record.receiptNoteId) throw new DataImportError(`شراء ${record.purchaseNumber} أصبح مرتبطًا ولا يمكن حذفه`, "ROLLBACK_DEPENDENCY", 409);
      await tx.purchase.delete({ where: { id: record.id } });
    } else if (link.entityType === "JOURNAL_ENTRY") {
      const record = await tx.journalEntry.findFirstOrThrow({ where: { id: link.entityId } });
      if (record.referenceType !== "IMPORT_OPENING" || record.referenceId !== batch.id) throw new DataImportError("القيد لم يعد قيد افتتاح الدفعة", "ROLLBACK_DEPENDENCY", 409);
      await tx.journalEntry.delete({ where: { id: record.id } });
    } else if (link.entityType === "ATTENDANCE") await tx.attendanceRecord.delete({ where: { id: link.entityId } });
    else if (link.entityType === "TRANSPORT_TRIP") {
      if (await tx.transportTripExpense.count({ where: { tripId: link.entityId } })) throw new DataImportError("توجد مصروفات مرتبطة بالرحلة", "ROLLBACK_DEPENDENCY", 409);
      await tx.transportTrip.delete({ where: { id: link.entityId } });
    } else if (link.entityType === "DELIVERY_RECEIPT_NOTE") {
      const note = await tx.deliveryReceiptNote.findFirstOrThrow({ where: { id: link.entityId } });
      if (note.status === "POSTED") await cancelPostedNote(tx, note.id, `تراجع دفعة الاستيراد ${batch.batchNumber}`);
      else if (note.status === "DRAFT") await tx.deliveryReceiptNote.delete({ where: { id: note.id } });
      else if (note.status !== "CANCELLED") throw new DataImportError("حالة السند لا تسمح بالتراجع", "ROLLBACK_DEPENDENCY", 409);
    } else if (link.entityType === "EXPENSE") {
      const record = await tx.expense.findFirstOrThrow({ where: { id: link.entityId } });
      if (record.journalEntryId) throw new DataImportError("تم ترحيل المصروف ولا يمكن حذفه", "ROLLBACK_DEPENDENCY", 409);
      await tx.expense.delete({ where: { id: record.id } });
    } else if (link.entityType === "REVENUE") {
      const record = await tx.revenue.findFirstOrThrow({ where: { id: link.entityId } });
      if (record.journalEntryId) throw new DataImportError("تم ترحيل الإيراد ولا يمكن حذفه", "ROLLBACK_DEPENDENCY", 409);
      await tx.revenue.delete({ where: { id: record.id } });
    } else if (link.entityType === "EMPLOYEE") {
      if (await tx.attendanceRecord.count({ where: { employeeId: link.entityId } }) || await tx.payrollLine.count({ where: { employeeId: link.entityId } })) throw new DataImportError("الموظف لديه حركات لاحقة", "ROLLBACK_DEPENDENCY", 409);
      await tx.employee.delete({ where: { id: link.entityId } });
    } else if (link.entityType === "PARTY") {
      if (await tx.sale.count({ where: { partyId: link.entityId } }) || await tx.purchase.count({ where: { partyId: link.entityId } }) || await tx.partyStockAccount.count({ where: { partyId: link.entityId } })) throw new DataImportError("الكيان لديه معاملات لاحقة", "ROLLBACK_DEPENDENCY", 409);
      await tx.party.delete({ where: { id: link.entityId } });
    } else if (link.entityType === "ITEM") {
      if (await tx.stockMovement.count({ where: { itemId: link.entityId } }) || await tx.saleItem.count({ where: { itemId: link.entityId } }) || await tx.purchaseItem.count({ where: { itemId: link.entityId } })) throw new DataImportError("المادة لديها معاملات لاحقة", "ROLLBACK_DEPENDENCY", 409);
      await tx.item.delete({ where: { id: link.entityId } });
    }
  }
  await tx.importRow.updateMany({ where: { importBatchId: batch.id, operation: "CREATE" }, data: { status: "ROLLED_BACK" } });
  const result = await tx.importBatch.update({ where: { id: batch.id }, data: { status: "ROLLED_BACK", rolledBackAt: new Date() }, include: { rows: { orderBy: { id: "asc" }, take: 200 } } });
  await audit(tx, { action: "IMPORT_ROLLBACK", entityType: "IMPORT_BATCH", entityId: batch.id, userId, metadata: { deletedEntities: processed.size } });
  return serializeBatch(result);
}

export function importCatalog() {
  return importTargets.map((target) => ({ ...target, sampleHeaders: target.fields.map((field) => field.labelAr) }));
}
