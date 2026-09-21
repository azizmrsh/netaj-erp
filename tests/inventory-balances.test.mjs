import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { inventoryBalances } from "../lib/inventory-balances.ts";
import { applyStockMovement } from "../lib/inventory.ts";
import { runWithDataScope } from "../lib/data-scope.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-inventory-balances-"));
const database = join(directory, "test.db");
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
const suffix = Date.now().toString(36).toUpperCase();
const run = operation => runWithDataScope({ tenantId: 1, companyId: 1 }, () => prisma.$transaction(operation));
let item, party;
before(async () => {
  const unit = await prisma.unit.create({ data: { code: `IB-U-${suffix}`, nameAr: "قطعة تقرير", nameEn: "Report piece" } });
  item = await prisma.item.create({ data: { code: `IB-${suffix}`, nameAr: "صنف كشف تاريخي", unitId: unit.id } });
  party = await prisma.party.create({ data: { nameAr: "طرف مخزون للاختبار", isCustomer: true } });
  await run(tx => applyStockMovement(tx, { itemId: item.id, ownershipType: "COMPANY", movementType: "OPENING", movementDate: new Date("2025-08-01"), quantityIn: 10, unitCost: 2 }));
  await run(tx => applyStockMovement(tx, { itemId: item.id, ownershipType: "COMPANY", movementType: "PURCHASE", movementDate: new Date("2025-09-05"), quantityIn: 5, unitCost: 4 }));
  await run(tx => applyStockMovement(tx, { itemId: item.id, ownershipType: "COMPANY", movementType: "SALE", movementDate: new Date("2025-09-30T23:59:59.000Z"), quantityOut: 3, referenceType: "TEST_SALE", referenceId: 123, referenceNumber: "SOURCE-123" }));
  await run(tx => applyStockMovement(tx, { itemId: item.id, ownershipType: "COMPANY", movementType: "PURCHASE", movementDate: new Date("2025-10-01"), quantityIn: 5, unitCost: 10 }));
});
after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("الفترة التاريخية تحتسب افتتاحي ووارد ومنصرف وقيمة الحركات دون تكلفة اليوم", async () => {
  const report = await run(tx => inventoryBalances(tx, new URLSearchParams({ itemId: String(item.id), from: "2025-09-01", to: "2025-09-30" })));
  const row = report.rows[0];
  assert.equal(report.currentView, false);
  assert.equal(row.openingQuantity, 10);
  assert.equal(row.incoming, 5);
  assert.equal(row.outgoing, 3);
  assert.equal(row.closingQuantity, 12);
  assert.equal(row.openingValue, 20);
  assert.equal(row.incomingValue, 20);
  assert.equal(row.outgoingValue, 8);
  assert.equal(row.closingValue, 32);
  assert.equal(row.currentAverageCost, null);
  assert.equal(row.currentStockValue, null);
  assert.equal(report.totals.closingValue, 32);
});

test("العرض الحالي يعرض المتوسط الحالي صراحة وبطاقة الحركة تحافظ على مرجع المصدر", async () => {
  const report = await run(tx => inventoryBalances(tx, new URLSearchParams({ itemId: String(item.id), view: "movements" })));
  assert.equal(report.currentView, true);
  assert.equal(report.rows[0].currentQuantity, 17);
  assert.equal(report.rows[0].closingQuantity, 17);
  assert.equal(report.rows[0].closingValue, 82);
  assert.ok(Math.abs(report.rows[0].currentAverageCost - 82 / 17) < 1e-8);
  assert.equal(report.movements.length, 4);
  assert.equal(report.movements[2].referenceNumber, "SOURCE-123");
  assert.equal(report.movements[2].balance, 12);
  assert.equal(report.totals.unmatchedAccounts, 0);
});

test("مخزون الغير مستقل عن قيمة أصول الشركة والتقرير لا يكتب في المخزون", async () => {
  await run(tx => applyStockMovement(tx, { itemId: item.id, partyId: party.id, ownershipType: "PARTY", movementType: "RECEIPT", movementDate: new Date("2025-09-04"), quantityIn: 3, unitCost: 7 }));
  const before = await prisma.stockMovement.count({ where: { itemId: item.id } });
  const report = await run(tx => inventoryBalances(tx, new URLSearchParams({ itemId: String(item.id), ownership: "ALL", to: "2025-09-30" })));
  assert.equal(report.rows.length, 2);
  assert.equal(report.totals.closingValue, 32);
  assert.equal(report.totals.partyValue, 21);
  assert.equal(await prisma.stockMovement.count({ where: { itemId: item.id } }), before);
  assert.equal(report.rows.find(row => row.ownership === "PARTY").partyId, party.id);
});

test("المطابقة تكشف الرصيد بلا حركات ولا تستخدمه لتغيير الأرصدة التاريخية", async () => {
  await prisma.companyStock.update({ where: { itemId: item.id }, data: { quantity: 99 } });
  const current = await run(tx => inventoryBalances(tx, new URLSearchParams({ itemId: String(item.id) })));
  assert.equal(current.rows[0].currentQuantity, 99);
  assert.equal(current.rows[0].closingQuantity, 17);
  assert.equal(current.rows[0].quantityDifference, 82);
  assert.equal(current.totals.unmatchedAccounts, 1);
  const historical = await run(tx => inventoryBalances(tx, new URLSearchParams({ itemId: String(item.id), to: "2025-09-30" })));
  assert.equal(historical.rows[0].closingQuantity, 12);
  assert.equal(historical.rows[0].closingValue, 32);
  await assert.rejects(() => run(tx => inventoryBalances(tx, new URLSearchParams({ from: "2026-02-31" }))), /التاريخ/);
  await assert.rejects(() => run(tx => inventoryBalances(tx, new URLSearchParams({ ownership: "COMPANY", partyId: String(party.id) }))), /الأطراف فقط/);
});
