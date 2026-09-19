import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as XLSX from "@stackline/xlsx";
import { createImportPreview, executeImportBatch, parseImportWorkbook, rollbackImportBatch } from "../lib/data-import.ts";
import { getImportTarget, mapImportRow, suggestImportMapping } from "../lib/import-definitions.ts";
import { scopedModels, scopePrismaArgs } from "../lib/data-scope.ts";
import { enqueueBackgroundJob, runBackgroundJob } from "../lib/background-jobs.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-import-test-"));
const database = join(directory, "import.db");
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
let unitId, itemId, partyId;
let openingAccountCodes;

function workbookBytes(sheets) {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  return new Uint8Array(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

before(async () => {
  const unit = await prisma.unit.create({ data: { code: `IMP-${suffix}`, nameAr: "وحدة استيراد", nameEn: "Import Unit" } });
  unitId = unit.id;
  const item = await prisma.item.create({ data: { code: `IMP-ITEM-${suffix}`, nameAr: "مادة استيراد", unitId } });
  itemId = item.id;
  partyId = (await prisma.party.create({ data: { nameAr: `عميل سند استيراد ${suffix}`, unifiedNumber: `NOTE-P-${suffix}`, isCustomer: true } })).id;
  const debitAccount = await prisma.account.create({ data: { code: `IMP-DR-${suffix}`, nameAr: "حساب مدين للاستيراد", accountType: "ASSET" } });
  const creditAccount = await prisma.account.create({ data: { code: `IMP-CR-${suffix}`, nameAr: "حساب دائن للاستيراد", accountType: "EQUITY" } });
  openingAccountCodes = [debitAccount.code, creditAccount.code];
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("محلل الاستيراد يقرأ XLSX متعدد الأوراق وCSV ويحفظ رقم الورقة والصف", () => {
  const bytes = workbookBytes({ العملاء: [{ "الاسم العربي": "ألف" }], الموردون: [{ "الاسم العربي": "باء" }] });
  const parsed = parseImportWorkbook(bytes, "legacy.xlsx");
  assert.equal(parsed.sheets.length, 2); assert.equal(parsed.rows.length, 2); assert.equal(parsed.rows[0].sourceRow, 2); assert.equal(parsed.rows[1].sourceSheet, "الموردون");
  const csv = parseImportWorkbook(new TextEncoder().encode("Item Code,Quantity\nA,4\n"), "opening.csv");
  assert.equal(csv.rows.length, 1); assert.equal(csv.headers[0], "Item Code");
});

test("اقتراح ربط الأعمدة يفهم العربية والإنجليزية والتحويل يحافظ على القيم الرقمية والتواريخ", () => {
  const target = getImportTarget("COMPANY_STOCK");
  const mapping = suggestImportMapping(["Item Code", "الكمية", "Balance Date"], target);
  assert.equal(mapping.itemCode, "Item Code"); assert.equal(mapping.quantity, "الكمية");
  const result = mapImportRow({ "Item Code": "ABC", "الكمية": "1,250.5", "Balance Date": "2026-01-05" }, mapping, target);
  assert.equal(result.mapped.quantity, 1250.5); assert.match(result.mapped.movementDate, /^2026-01-05/); assert.equal(result.errors.length, 0);
});

test("المعاينة تعالج آلاف الصفوف دفعة واحدة دون إسقاط المصدر", async () => {
  const rows = Array.from({ length: 2000 }, (_, index) => ({ "الاسم العربي": `عميل تحميل ${suffix}-${index}`, "الرقم الموحد": `LOAD-${suffix}-${index}`, "عميل": "نعم" }));
  const bytes = workbookBytes({ Bulk: rows });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "bulk-2000.xlsx", targetType: "PARTIES", importMode: "HISTORICAL", duplicateStrategy: "SKIP", createdBy: "load-test" }), { timeout: 120_000 });
  assert.equal(preview.totalRows, 2000); assert.equal(preview.validRows, 2000); assert.equal(preview.rows.length, 200);
  assert.equal(await prisma.importRow.count({ where: { importBatchId: preview.id } }), 2000);
});

test("المعاينة تكشف الحقول المفقودة والتكرار قبل أي كتابة تشغيلية", async () => {
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": `عميل ${suffix}`, "الرقم الموحد": `U-${suffix}` }, { "الاسم العربي": "", "الهاتف": "0500000000" }] });
  const before = await prisma.party.count();
  const batch = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "parties.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(batch.totalRows, 2); assert.equal(batch.validRows, 1); assert.equal(batch.invalidRows, 1); assert.equal(await prisma.party.count(), before);
  await assert.rejects(prisma.$transaction((tx) => executeImportBatch(tx, batch.id, "test")), /الصفوف غير الصالحة/);
});

test("تنفيذ master data ينشئ السجل والتتبع والتراجع يحذفه عند عدم وجود اعتماديات", async () => {
  const unified = `ROLL-${suffix}`;
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل قابل للتراجع", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "party-rollback.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  const executed = await prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test"));
  assert.equal(executed.status, "COMPLETED"); assert.equal(executed.createdRows, 1);
  const party = await prisma.party.findUniqueOrThrow({ where: { unifiedNumber: unified } });
  const link = await prisma.legacyRecordLink.findFirstOrThrow({ where: { importBatchId: preview.id } });
  assert.equal(link.entityId, party.id); assert.equal(link.sourceFile, "party-rollback.xlsx"); assert.equal(link.sourceRow, 2);
  const rolledBack = await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(rolledBack.status, "ROLLED_BACK"); assert.equal(await prisma.party.count({ where: { id: party.id } }), 0);
});

test("التراجع عن تحديث سجل موجود لا يحذف بيانات NETAj الأصلية", async () => {
  const unified = `KEEP-${suffix}`;
  const existing = await prisma.party.create({ data: { nameAr: "اسم قبل التحديث", unifiedNumber: unified, isCustomer: true } });
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "اسم بعد التحديث", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "party-update.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "UPDATE", createdBy: "test" }));
  await prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test"));
  assert.equal((await prisma.party.findUniqueOrThrow({ where: { id: existing.id } })).nameAr, "اسم بعد التحديث");
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(await prisma.party.count({ where: { id: existing.id } }), 1);
});

test("الرصيد الافتتاحي للمخزون ينشئ حركة حقيقية ويعيد الحالة السابقة عند التراجع", async () => {
  const before = await prisma.companyStock.findUnique({ where: { itemId } });
  const quantityBefore = Number(before?.quantity ?? 0), averageBefore = Number(before?.averageCost ?? 0);
  const bytes = workbookBytes({ Stock: [{ "كود المادة": `IMP-ITEM-${suffix}`, "الكمية": 7, "تكلفة الوحدة": 11, "تاريخ الرصيد": "2026-01-01" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "stock.xlsx", targetType: "COMPANY_STOCK", importMode: "OPENING", duplicateStrategy: "SKIP", createdBy: "test" }));
  await prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test"));
  const afterImport = await prisma.companyStock.findUniqueOrThrow({ where: { itemId } });
  assert.equal(Number(afterImport.quantity), quantityBefore + 7);
  const movement = await prisma.stockMovement.findFirstOrThrow({ where: { referenceType: "IMPORT_BATCH", referenceId: preview.id } });
  assert.equal(Number(movement.balanceAfter), quantityBefore + 7);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  const afterRollback = await prisma.companyStock.findUniqueOrThrow({ where: { itemId } });
  assert.equal(Number(afterRollback.quantity), quantityBefore); assert.equal(Number(afterRollback.averageCost), averageBefore);
});

test("الأرصدة الافتتاحية المحاسبية تنشئ قيدًا متوازنًا قابلًا للتراجع دون قيد مكرر", async () => {
  const bytes = workbookBytes({ GL: [{ "كود الحساب": openingAccountCodes[0], "مدين": 100, "دائن": 0, "تاريخ القيد": "2026-01-01" }, { "كود الحساب": openingAccountCodes[1], "مدين": 0, "دائن": 100, "تاريخ القيد": "2026-01-01" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "opening-gl.xlsx", targetType: "OPENING_BALANCES", importMode: "OPENING", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(preview.invalidRows, 0);
  await prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test"));
  const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: "IMPORT_OPENING", referenceId: preview.id }, include: { lines: true } });
  assert.equal(Number(journal.totalDebit), 100); assert.equal(Number(journal.totalCredit), 100); assert.equal(journal.lines.length, 2);
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: "IMPORT_OPENING", referenceId: preview.id } }), 1);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal(await prisma.journalEntry.count({ where: { id: journal.id } }), 0);
});

test("استيراد سند تشغيلي FULL يحدّث مخزون العميل مرة واحدة والتراجع يعكسه", async () => {
  const legacyNumber = `LEG-NOTE-${suffix}`;
  const bytes = workbookBytes({ Notes: [{ "رقم السند القديم": legacyNumber, "نوع السند": "استلام", "تاريخ السند": "2026-02-01", "العميل أو المورد": `NOTE-P-${suffix}`, "كود المادة": `IMP-ITEM-${suffix}`, "رقم السطر": 1, "الكمية": 3, "ملكية المخزون": "عميل" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "notes.xlsx", targetType: "NOTES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  assert.equal(preview.invalidRows, 0);
  await prisma.$transaction((tx) => executeImportBatch(tx, preview.id, "test"));
  const noteLink = await prisma.legacyRecordLink.findFirstOrThrow({ where: { importBatchId: preview.id, entityType: "DELIVERY_RECEIPT_NOTE" } });
  const note = await prisma.deliveryReceiptNote.findUniqueOrThrow({ where: { id: noteLink.entityId } });
  assert.equal(note.status, "POSTED"); assert.equal(noteLink.legacyDocumentNumber, legacyNumber);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), 3);
  await prisma.$transaction((tx) => rollbackImportBatch(tx, preview.id, "test"));
  assert.equal((await prisma.deliveryReceiptNote.findUniqueOrThrow({ where: { id: note.id } })).status, "CANCELLED");
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), 0);
});

test("نماذج الاستيراد كلها ضمن tenant/company وID المباشر يُقيّد بالنطاق", () => {
  for (const model of ["ImportBatch", "ImportRow", "LegacyRecordLink", "ImportTemplate"]) assert.ok(scopedModels.has(model));
  const args = scopePrismaArgs("findUnique", { where: { id: 99 } }, { tenantId: 8, companyId: 12 });
  assert.deepEqual(args.where, { id: 99, tenantId: 8, companyId: 12 });
});

test("دفعة الاستيراد الثقيلة تنفذ مرة واحدة عبر الطابور الخلفي", async () => {
  const unified = `QUEUE-${suffix}`;
  const bytes = workbookBytes({ Data: [{ "الاسم العربي": "عميل طابور", "الرقم الموحد": unified, "عميل": "نعم" }] });
  const preview = await prisma.$transaction((tx) => createImportPreview(tx, { bytes, filename: "queued-party.xlsx", targetType: "PARTIES", importMode: "FULL", duplicateStrategy: "SKIP", createdBy: "test" }));
  await prisma.importBatch.update({ where: { id: preview.id }, data: { status: "QUEUED" } });
  const queued = await prisma.$transaction((tx) => enqueueBackgroundJob(tx, { jobType: "IMPORT_EXECUTE", payload: { batchId: preview.id }, idempotencyKey: `import:${preview.id}` }, "test"));
  await prisma.$transaction((tx) => runBackgroundJob(tx, queued.job.id, "test"));
  assert.equal((await prisma.importBatch.findUniqueOrThrow({ where: { id: preview.id } })).status, "COMPLETED");
  assert.equal(await prisma.party.count({ where: { unifiedNumber: unified } }), 1);
  const duplicate = await prisma.$transaction((tx) => enqueueBackgroundJob(tx, { jobType: "IMPORT_EXECUTE", payload: { batchId: preview.id }, idempotencyKey: `import:${preview.id}` }, "test"));
  assert.equal(duplicate.created, false);
});
