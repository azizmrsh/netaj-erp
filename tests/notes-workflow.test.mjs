import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { amendPostedNote, createNote, postNote, cancelPostedNote, changeNoteStatus, NoteWorkflowError } from "../lib/notes.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-notes-test-"));
const databasePath = join(directory, "notes.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
let partyId, itemId, truckId, driverId;

before(async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unit = await prisma.unit.create({ data: { code: `N${suffix}`, nameAr: "وحدة سند", nameEn: "Note unit" } });
  itemId = (await prisma.item.create({ data: { code: `NOTE-${suffix}`, nameAr: "مادة اختبار السند", unitId: unit.id } })).id;
  partyId = (await prisma.party.create({ data: { nameAr: "عميل اختبار السند", isCustomer: true, isSupplier: true } })).id;
  truckId = (await prisma.truck.create({ data: { plateNumber: `TEST-${suffix}` } })).id;
  driverId = (await prisma.driver.create({ data: { name: "سائق اختبار السند", idNumber: `ID-${suffix}` } })).id;
});
beforeEach(async () => {
  await prisma.transportTrip.deleteMany({ where: { partyId } });
  await prisma.deliveryReceiptNote.deleteMany({ where: { partyId } });
  await prisma.stockMovement.deleteMany({ where: { itemId } });
  await prisma.companyStock.deleteMany({ where: { itemId } });
  await prisma.partyStockAccount.deleteMany({ where: { itemId } });
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

function input(overrides = {}) {
  return { noteType: "RECEIPT", noteDate: new Date("2026-09-19"), partyId, stockOwnership: "PARTY", transportMethod: "CUSTOMER", items: [{ itemId, quantity: 10, weight: 9 }], ...overrides };
}

async function approveAndPost(noteId) {
  await prisma.$transaction((tx) => changeNoteStatus(tx, noteId, "SUBMIT", 1001));
  await prisma.$transaction((tx) => changeNoteStatus(tx, noteId, "APPROVE", 1002));
  return prisma.$transaction((tx) => postNote(tx, noteId));
}

test("السند غير المعتمد لا يؤثر على المخزون", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input()));
  await assert.rejects(prisma.$transaction((tx) => postNote(tx, note.id)), (error) => error instanceof NoteWorkflowError && error.code === "INVALID_STATUS");
  assert.equal(await prisma.stockMovement.count({ where: { referenceType: "DELIVERY_RECEIPT_NOTE", referenceId: note.id } }), 0);
});

test("ترحيل سند استلام عميل ينشئ حركة ورصيدًا صحيحًا", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input()));
  assert.match(note.noteNumber, /^GRN-2026-\d{6}$/);
  await approveAndPost(note.id);
  const [account, movement] = await Promise.all([
    prisma.partyStockAccount.findUnique({ where: { partyId_itemId: { partyId, itemId } } }),
    prisma.stockMovement.findFirst({ where: { referenceType: "DELIVERY_RECEIPT_NOTE", referenceId: note.id } }),
  ]);
  assert.equal(Number(account.quantity), 10);
  assert.equal(Number(movement.balanceAfter), 10);
  assert.equal(movement.referenceNumber, note.noteNumber);
});

test("سند تسليم عميل يسمح بالرصيد السالب ويظهر في كشفه", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input({ noteType: "DELIVERY", items: [{ itemId, quantity: 4 }] })));
  await approveAndPost(note.id);
  const account = await prisma.partyStockAccount.findUnique({ where: { partyId_itemId: { partyId, itemId } } });
  const statement = await prisma.stockMovement.findMany({ where: { partyId, itemId } });
  assert.equal(Number(account.quantity), -4);
  assert.equal(statement.length, 1);
  assert.equal(Number(statement[0].balanceAfter), -4);
});

test("سند تسليم الشركة يرفض العجز ويرجع المعاملة كاملة", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input({ noteType: "DELIVERY", stockOwnership: "COMPANY", items: [{ itemId, quantity: 2 }] })));
  await prisma.$transaction((tx) => changeNoteStatus(tx, note.id, "SUBMIT", 1001));
  await prisma.$transaction((tx) => changeNoteStatus(tx, note.id, "APPROVE", 1002));
  await assert.rejects(prisma.$transaction((tx) => postNote(tx, note.id)), (error) => error instanceof NoteWorkflowError && error.code === "STOCK_ERROR");
  assert.equal((await prisma.deliveryReceiptNote.findUnique({ where: { id: note.id } })).status, "APPROVED");
  assert.equal(await prisma.stockMovement.count({ where: { referenceType: "DELIVERY_RECEIPT_NOTE", referenceId: note.id } }), 0);
});

test("النقل بسيارات الشركة ينشئ رحلة واحدة تلقائيًا عند الترحيل", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input({ transportMethod: "COMPANY", truckId, driverId })));
  const result = await approveAndPost(note.id);
  assert.match(result.trip.tripNumber, /^TR-2026-\d{6}$/);
  assert.equal(result.trip.noteId, note.id);
  assert.equal(result.trip.truckId, truckId);
  const repeated = await prisma.$transaction((tx) => postNote(tx, note.id));
  assert.equal(repeated.note.status, "POSTED");
  assert.equal(await prisma.transportTrip.count({ where: { noteId: note.id } }), 1);
});

test("إلغاء السند يعكس المخزون ويلغي الرحلة المرتبطة", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input({ transportMethod: "COMPANY", truckId, driverId })));
  await approveAndPost(note.id);
  const cancelled = await prisma.$transaction((tx) => cancelPostedNote(tx, note.id, "اختبار العكس"));
  const account = await prisma.partyStockAccount.findUnique({ where: { partyId_itemId: { partyId, itemId } } });
  const trip = await prisma.transportTrip.findUnique({ where: { noteId: note.id } });
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(Number(account.quantity), 0);
  assert.equal(trip.status, "CANCELLED");
  assert.equal(await prisma.stockMovement.count({ where: { itemId, partyId } }), 2);
});

test("النقل الخارجي لا ينشئ رحلة للشركة", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input({ transportMethod: "EXTERNAL", carrierName: "ناقل خارجي" })));
  const result = await approveAndPost(note.id);
  assert.equal(result.trip, null);
  assert.equal(await prisma.transportTrip.count({ where: { noteId: note.id } }), 0);
});

test("تعديل السند المرحل يعكس أثره ويحفظ نسخة جديدة تحتاج إعادة اعتماد", async () => {
  const note = await prisma.$transaction((tx) => createNote(tx, input()));
  await approveAndPost(note.id);
  const amended = await prisma.$transaction((tx) => amendPostedNote(tx, note.id, input({ items: [{ itemId, quantity: 7 }] }), "تصحيح وزن معتمد", 1003));
  assert.equal(amended.status, "DRAFT");
  assert.equal(amended.revision, 2);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), 0);
  await approveAndPost(note.id);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId } } })).quantity), 7);
  assert.equal(await prisma.stockMovement.count({ where: { referenceType: "DELIVERY_RECEIPT_NOTE_R2", referenceId: note.id } }), 1);
  assert.equal(await prisma.auditLog.count({ where: { entityType: "DELIVERY_RECEIPT_NOTE", entityId: note.id, action: "AMEND" } }), 1);
});
