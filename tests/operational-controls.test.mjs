import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { applyStockMovement } from "../lib/inventory.ts";
import { createBankAccount, createAndPostExpense, ensureFinanceFoundation, FinanceError } from "../lib/finance.ts";
import { createInventoryCount, approveInventoryCount, customerFinancialExposure, setPartyStockValuationRate } from "../lib/operational-controls.ts";
import { createBlendedFactoryProduction, upsertFactoryProductSetting } from "../lib/factory.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-controls-test-"));
const databasePath = join(directory, "controls.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
let partyId, rawItemId, productItemId, fuelItemId, bankId, expenseCategoryId, adminId, factoryId;

before(async () => {
  const suffix = Date.now().toString(36).toUpperCase();
  await prisma.$transaction((tx) => ensureFinanceFoundation(tx));
  const unit = await prisma.unit.create({ data: { code: `OC${suffix}`, nameAr: "طن ضوابط", nameEn: "Control ton" } });
  const [party, raw, product, fuel] = await Promise.all([
    prisma.party.create({ data: { nameAr: `عميل ضوابط ${suffix}`, isCustomer: true } }),
    prisma.item.create({ data: { code: `OCR-${suffix}`, nameAr: "خام ضوابط", unitId: unit.id } }),
    prisma.item.create({ data: { code: `OCP-${suffix}`, nameAr: "منتج ضوابط", unitId: unit.id } }),
    prisma.item.create({ data: { code: `OCF-${suffix}`, nameAr: "وقود ضوابط", unitId: unit.id } }),
  ]);
  partyId = party.id; rawItemId = raw.id; productItemId = product.id; fuelItemId = fuel.id;
  bankId = (await prisma.$transaction((tx) => createBankAccount(tx, { name: `بنك ضوابط ${suffix}`, openingBalance: 10000 }))).id;
  expenseCategoryId = (await prisma.expenseCategory.findUniqueOrThrow({ where: { code: "ADMIN" } })).id;
  adminId = (await prisma.costCenter.findUniqueOrThrow({ where: { code: "ADMIN" } })).id;
  factoryId = (await prisma.costCenter.findUniqueOrThrow({ where: { code: "FACTORY" } })).id;
});

after(async () => { await prisma.$disconnect(); rmSync(directory, { recursive: true, force: true }); });

test("يرفض اعتماد مصروف لا يساوي توزيعه 100%", async () => {
  await assert.rejects(prisma.$transaction((tx) => createAndPostExpense(tx, { expenseDate: "2026-09-19", categoryId: expenseCategoryId, bankAccountId: bankId, amountBeforeVat: 100, vatAmount: 15, allocations: [{ costCenterId: adminId, percentage: 70 }] })), (error) => error instanceof FinanceError && /100/.test(error.message));
});

test("يوزع المصروف والقيد فعليًا على مراكز متعددة", async () => {
  const expense = await prisma.$transaction((tx) => createAndPostExpense(tx, { expenseDate: "2026-09-19", categoryId: expenseCategoryId, bankAccountId: bankId, amountBeforeVat: 100, vatAmount: 15, allocations: [{ costCenterId: adminId, percentage: 60 }, { costCenterId: factoryId, percentage: 40 }] }));
  assert.equal(expense.allocations.length, 2);
  assert.equal(expense.allocations.reduce((sum, row) => sum + Number(row.percentage), 0), 100);
  assert.equal(expense.allocations.reduce((sum, row) => sum + Number(row.totalAmount), 0), 115);
  assert.deepEqual(new Set(expense.journalEntry.lines.filter((row) => row.debit.gt(0)).map((row) => row.costCenterId)), new Set([adminId, factoryId]));
});

test("التقييم بتاريخ سريان يحسب التعرض ولا يعيد تقييم الحركة القديمة", async () => {
  const movement = await prisma.$transaction((tx) => applyStockMovement(tx, { itemId: rawItemId, partyId, ownershipType: "PARTY", movementType: "RECEIPT", quantityIn: 10, unitCost: 20 }));
  await prisma.$transaction((tx) => setPartyStockValuationRate(tx, { partyId, itemId: rawItemId, effectiveAt: "2026-09-01", unitValue: 50 }, 1001));
  await prisma.sale.create({ data: { invoiceNumber: `EXP-${Date.now()}`, invoiceDate: new Date("2026-09-10"), partyId, subtotal: 800, totalAmount: 800, functionalSubtotal: 800, functionalTotalAmount: 800, status: "COMPLETED" } });
  const exposure = await prisma.$transaction((tx) => customerFinancialExposure(tx, partyId, new Date("2026-09-19")));
  assert.equal(Number(exposure.inventoryValue), 500);
  assert.equal(Number(exposure.receivable), 800);
  assert.equal(Number(exposure.shortage), 300);
  assert.equal(exposure.status, "DEFICIT");
  assert.equal(Number((await prisma.stockMovement.findUniqueOrThrow({ where: { id: movement.movement.id } })).unitCost), 20);
});

test("اعتماد الجرد ينشئ تسوية ويربطها بسطر الجرد", async () => {
  await prisma.$transaction((tx) => applyStockMovement(tx, { itemId: productItemId, ownershipType: "COMPANY", movementType: "OPENING", quantityIn: 10, unitCost: 7 }));
  const count = await prisma.$transaction((tx) => createInventoryCount(tx, { countDate: "2026-09-19", frequency: "DAILY", ownershipType: "COMPANY", lines: [{ itemId: productItemId, countedQuantity: 7 }] }));
  const approved = await prisma.$transaction((tx) => approveInventoryCount(tx, count.id, 1002));
  assert.equal(approved.status, "APPROVED");
  assert.ok(approved.lines[0].adjustmentMovementId);
  assert.equal(Number((await prisma.companyStock.findUniqueOrThrow({ where: { itemId: productItemId } })).quantity), 7);
});

test("إنتاج بنسبة وقود يخصم الخام والوقود ويضيف المنتج دون خلط الملكية", async () => {
  await prisma.$transaction((tx) => applyStockMovement(tx, { itemId: rawItemId, partyId, ownershipType: "PARTY", movementType: "RECEIPT", quantityIn: 90, unitCost: 20 }));
  await prisma.$transaction((tx) => applyStockMovement(tx, { itemId: fuelItemId, ownershipType: "COMPANY", movementType: "RECEIPT", quantityIn: 20, unitCost: 3 }));
  await prisma.$transaction((tx) => upsertFactoryProductSetting(tx, { productItemId, rawItemId, fuelItemId, defaultFuelPercentage: 10 }));
  const result = await prisma.$transaction((tx) => createBlendedFactoryProduction(tx, { transactionDate: "2026-09-19", productItemId, partyId, ownershipType: "PARTY", quantity: 100 }));
  assert.equal(Number(result.transaction.rawQuantity), 90);
  assert.equal(Number(result.transaction.fuelQuantity), 10);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId: rawItemId } } })).quantity), 10);
  assert.equal(Number((await prisma.partyStockAccount.findUniqueOrThrow({ where: { partyId_itemId: { partyId, itemId: productItemId } } })).quantity), 100);
  assert.equal(Number((await prisma.companyStock.findUniqueOrThrow({ where: { itemId: fuelItemId } })).quantity), 10);
});
