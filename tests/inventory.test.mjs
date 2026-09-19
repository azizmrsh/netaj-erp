import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  applyStockMovement,
  InventoryError,
  transferStockOwnership,
} from "../lib/inventory.ts";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "netaj-inventory-test-"));
const databasePath = join(temporaryDirectory, "inventory.test.db");
copyFileSync("prisma/netaj.db", databasePath);

const adapter = new PrismaBetterSqlite3({ url: `file:${databasePath}` });
const prisma = new PrismaClient({ adapter });
let itemId;
let partyId;

async function record(input) {
  return prisma.$transaction((tx) => applyStockMovement(tx, input));
}

before(async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  const unit = await prisma.unit.create({
    data: { code: `T${suffix}`, nameAr: "وحدة اختبار", nameEn: "Test" },
  });
  const item = await prisma.item.create({
    data: {
      code: `TEST-${suffix}`,
      nameAr: "مادة اختبار المخزون",
      unitId: unit.id,
    },
  });
  const party = await prisma.party.create({
    data: { nameAr: "عميل اختبار المخزون", isCustomer: true },
  });
  itemId = item.id;
  partyId = party.id;
});

beforeEach(async () => {
  await prisma.stockMovement.deleteMany({ where: { itemId } });
  await prisma.companyStock.deleteMany({ where: { itemId } });
  await prisma.partyStockAccount.deleteMany({ where: { itemId } });
});

after(async () => {
  await prisma.$disconnect();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("إضافة كمية لمخزون الشركة وتحسب متوسط التكلفة", async () => {
  const result = await record({
    itemId,
    ownershipType: "COMPANY",
    movementType: "RECEIPT",
    quantityIn: 10,
    unitCost: 5,
  });
  assert.equal(result.newQuantity, 10);
  assert.equal(result.averageValue, 5);
  assert.equal(Number(result.movement.balanceAfter), 10);
});

test("سحب كمية متاحة من مخزون الشركة", async () => {
  await record({
    itemId,
    ownershipType: "COMPANY",
    movementType: "OPENING",
    quantityIn: 10,
    unitCost: 4,
  });
  const result = await record({
    itemId,
    ownershipType: "COMPANY",
    movementType: "DELIVERY",
    quantityOut: 3,
  });
  assert.equal(result.newQuantity, 7);
  assert.equal(Number(result.movement.unitCost), 4);
  assert.equal(Number(result.movement.balanceAfter), 7);
});

test("يرفض سحب كمية أكبر من رصيد الشركة دون تسجيل حركة", async () => {
  await record({
    itemId,
    ownershipType: "COMPANY",
    movementType: "OPENING",
    quantityIn: 2,
    unitCost: 8,
  });
  await assert.rejects(
    record({
      itemId,
      ownershipType: "COMPANY",
      movementType: "DELIVERY",
      quantityOut: 3,
    }),
    (error) =>
      error instanceof InventoryError &&
      error.code === "INSUFFICIENT_COMPANY_STOCK"
  );
  assert.equal(await prisma.stockMovement.count({ where: { itemId } }), 1);
});

test("إضافة كمية لمخزون عميل", async () => {
  const result = await record({
    itemId,
    partyId,
    ownershipType: "PARTY",
    movementType: "RECEIPT",
    quantityIn: 6,
    unitCost: 11,
  });
  assert.equal(result.newQuantity, 6);
  assert.equal(result.warning, null);
});

test("يسمح بسحب أكبر من رصيد العميل ويظهر الرصيد السالب", async () => {
  await record({
    itemId,
    partyId,
    ownershipType: "PARTY",
    movementType: "OPENING",
    quantityIn: 2,
    unitCost: 9,
  });
  const result = await record({
    itemId,
    partyId,
    ownershipType: "PARTY",
    movementType: "DELIVERY",
    quantityOut: 5,
  });
  assert.equal(result.newQuantity, -3);
  assert.match(result.warning, /سالب/);
  assert.equal(Number(result.movement.balanceAfter), -3);
});

test("balanceAfter يتتابع بصورة صحيحة عبر الحركات", async () => {
  const first = await record({
    itemId,
    partyId,
    ownershipType: "PARTY",
    movementType: "RECEIPT",
    quantityIn: 12,
    unitCost: 3,
  });
  const second = await record({
    itemId,
    partyId,
    ownershipType: "PARTY",
    movementType: "DELIVERY",
    quantityOut: 4,
  });
  assert.equal(Number(first.movement.balanceAfter), 12);
  assert.equal(Number(second.movement.balanceAfter), 8);
});

test("الحركة المسجلة تظهر في كشف العميل مع المادة", async () => {
  await record({
    itemId,
    partyId,
    ownershipType: "PARTY",
    movementType: "RECEIPT",
    quantityIn: 7,
    unitCost: 2,
    referenceNumber: "TEST-REF-1",
  });
  const movements = await prisma.stockMovement.findMany({
    where: { partyId },
    include: { item: true },
  });
  assert.equal(movements.length, 1);
  assert.equal(movements[0].item.id, itemId);
  assert.equal(movements[0].referenceNumber, "TEST-REF-1");
  assert.equal(Number(movements[0].balanceAfter), 7);
});

test("تحويل الملكية من الشركة للعميل يسجل حركتين مترابطتين", async () => {
  await record({
    itemId,
    ownershipType: "COMPANY",
    movementType: "OPENING",
    quantityIn: 10,
    unitCost: 6,
  });
  const result = await prisma.$transaction((tx) =>
    transferStockOwnership(tx, {
      direction: "COMPANY_TO_PARTY",
      itemId,
      partyId,
      quantity: 4,
    })
  );
  assert.equal(result.source.newQuantity, 6);
  assert.equal(result.destination.newQuantity, 4);
  assert.equal(
    result.source.movement.referenceNumber,
    result.destination.movement.referenceNumber
  );
  assert.equal(result.source.movement.movementType, "TRANSFER_OUT");
  assert.equal(result.destination.movement.movementType, "TRANSFER_IN");
});

test("تحويل ملكية العميل للشركة يسمح بتسوية رصيد عميل سالب", async () => {
  const result = await prisma.$transaction((tx) =>
    transferStockOwnership(tx, {
      direction: "PARTY_TO_COMPANY",
      itemId,
      partyId,
      quantity: 3,
      unitCost: 7,
    })
  );
  assert.equal(result.source.newQuantity, -3);
  assert.equal(result.destination.newQuantity, 3);
  assert.match(result.source.warning, /سالب/);
});
