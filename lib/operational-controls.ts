import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { applyStockMovement, type StockOwnership } from "@/lib/inventory";

type Tx = Prisma.TransactionClient;

export class OperationalControlError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS", message: string) {
    super(message);
    this.name = "OperationalControlError";
  }
}

const decimal = (value: unknown, label: string, allowNegative = false) => {
  try {
    const result = new Prisma.Decimal(String(value ?? 0)).toDecimalPlaces(4);
    if (!allowNegative && result.isNegative()) throw new Error();
    return result;
  } catch {
    throw new OperationalControlError("INVALID_INPUT", `${label} غير صحيح`);
  }
};

const parsedDate = (value: unknown) => {
  const result = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(result.getTime())) throw new OperationalControlError("INVALID_INPUT", "التاريخ غير صحيح");
  return result;
};

export async function setPartyStockValuationRate(tx: Tx, input: Record<string, unknown>, userId?: string | number | null) {
  const partyId = Number(input.partyId), itemId = Number(input.itemId), effectiveAt = parsedDate(input.effectiveAt);
  const unitValue = decimal(input.unitValue, "القيمة التقديرية");
  const [party, item] = await Promise.all([tx.party.findUnique({ where: { id: partyId } }), tx.item.findUnique({ where: { id: itemId } })]);
  if (!party || !item) throw new OperationalControlError("NOT_FOUND", "العميل أو المادة غير موجود");
  const row = await tx.partyStockValuationRate.upsert({
    where: { partyId_itemId_effectiveAt: { partyId, itemId, effectiveAt } },
    create: { partyId, itemId, effectiveAt, unitValue, currency: String(input.currency ?? "SAR").toUpperCase(), notes: String(input.notes ?? "").trim() || null, createdBy: userId == null ? null : String(userId) },
    update: { unitValue, currency: String(input.currency ?? "SAR").toUpperCase(), notes: String(input.notes ?? "").trim() || null },
    include: { party: true, item: true },
  });
  await audit(tx, { action: "UPSERT", entityType: "PARTY_STOCK_VALUATION_RATE", entityId: row.id, userId: userId == null ? undefined : String(userId), metadata: { partyId, itemId, effectiveAt, unitValue: unitValue.toString() } });
  return row;
}

export async function customerFinancialExposure(tx: Tx, partyId: number, asOf = new Date()) {
  const party = await tx.party.findUnique({ where: { id: partyId } });
  if (!party) throw new OperationalControlError("NOT_FOUND", "العميل غير موجود");
  const [stocks, sales, config] = await Promise.all([
    tx.partyStockAccount.findMany({ where: { partyId }, include: { item: true } }),
    tx.sale.findMany({ where: { partyId, status: { not: "CANCELLED" }, invoiceDate: { lte: asOf } }, include: { allocations: true, creditDebitNotes: { where: { status: "POSTED" } } } }),
    tx.companyConfiguration.findFirst({ where: { category: "RISK", configKey: "CUSTOMER_EXPOSURE_THRESHOLDS", isActive: true } }),
  ]);
  let thresholds = { warning: 80, critical: 90 };
  try { thresholds = { ...thresholds, ...(config ? JSON.parse(config.valueJson) : {}) }; } catch { /* keep safe defaults */ }
  const lines = [];
  let inventoryValue = new Prisma.Decimal(0);
  for (const stock of stocks) {
    const rate = await tx.partyStockValuationRate.findFirst({ where: { partyId, itemId: stock.itemId, effectiveAt: { lte: asOf } }, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }] });
    const unitValue = new Prisma.Decimal(rate?.unitValue ?? stock.averageValue ?? 0);
    const positiveQuantity = Prisma.Decimal.max(new Prisma.Decimal(stock.quantity), 0);
    const value = positiveQuantity.mul(unitValue).toDecimalPlaces(2);
    inventoryValue = inventoryValue.plus(value);
    lines.push({ itemId: stock.itemId, itemCode: stock.item.code, itemName: stock.item.nameAr, quantity: stock.quantity, unitValue, value, effectiveAt: rate?.effectiveAt ?? null, negative: new Prisma.Decimal(stock.quantity).lt(0) });
  }
  const receivable = sales.reduce((sum, sale) => {
    const paid = sale.allocations.reduce((value, allocation) => value.plus(allocation.functionalAmount), new Prisma.Decimal(0));
    const adjustments = sale.creditDebitNotes.reduce((value, note) => value.plus(["CREDIT", "CREDIT_NOTE"].includes(note.noteType) ? note.functionalTotalAmount.negated() : note.functionalTotalAmount), new Prisma.Decimal(0));
    return sum.plus(sale.functionalTotalAmount).plus(adjustments).minus(paid);
  }, new Prisma.Decimal(0)).toDecimalPlaces(2);
  const ratio = inventoryValue.gt(0) ? receivable.div(inventoryValue).mul(100).toDecimalPlaces(2) : receivable.gt(0) ? new Prisma.Decimal(999.99) : new Prisma.Decimal(0);
  const shortage = Prisma.Decimal.max(receivable.minus(inventoryValue), 0).toDecimalPlaces(2);
  const status = shortage.gt(0) ? "DEFICIT" : ratio.gte(thresholds.critical) ? "CRITICAL" : ratio.gte(thresholds.warning) ? "WARNING" : "NORMAL";
  return { party: { id: party.id, nameAr: party.nameAr }, asOf, receivable, inventoryValue, exposureRatio: ratio, shortage, status, thresholds, lines };
}

export async function createInventoryCount(tx: Tx, input: Record<string, unknown>) {
  const countDate = parsedDate(input.countDate), frequency = String(input.frequency ?? "AD_HOC").toUpperCase();
  const ownershipType = String(input.ownershipType ?? "COMPANY").toUpperCase() as StockOwnership;
  const partyId = input.partyId ? Number(input.partyId) : null;
  if (!['COMPANY', 'PARTY'].includes(ownershipType) || (ownershipType === "PARTY" && !partyId)) throw new OperationalControlError("INVALID_INPUT", "ملكية الجرد غير صحيحة");
  const requested = Array.isArray(input.lines) ? input.lines as Array<Record<string, unknown>> : [];
  if (!requested.length) throw new OperationalControlError("INVALID_INPUT", "يجب إدخال نتائج الجرد");
  const ids = requested.map((row) => Number(row.itemId));
  if (new Set(ids).size !== ids.length || ids.some((id) => !Number.isInteger(id) || id < 1)) throw new OperationalControlError("INVALID_INPUT", "مواد الجرد غير صحيحة أو مكررة");
  const balances = ownershipType === "COMPANY"
    ? await tx.companyStock.findMany({ where: { itemId: { in: ids } } })
    : await tx.partyStockAccount.findMany({ where: { partyId: Number(partyId), itemId: { in: ids } } });
  const byItem = new Map(balances.map((row) => [row.itemId, row]));
  const countNumber = await nextDocumentNumber(tx, "IC", countDate);
  const count = await tx.inventoryCount.create({ data: { countNumber, countDate, frequency, ownershipType, partyId, notes: String(input.notes ?? "").trim() || null,
    lines: { create: requested.map((row) => {
      const current = byItem.get(Number(row.itemId));
      const systemQuantity = new Prisma.Decimal(current?.quantity ?? 0), countedQuantity = decimal(row.countedQuantity, "الكمية الفعلية", true);
      const unitCost = new Prisma.Decimal(current && "averageCost" in current ? current.averageCost : current && "averageValue" in current ? current.averageValue : 0);
      return { itemId: Number(row.itemId), systemQuantity, countedQuantity, variance: countedQuantity.minus(systemQuantity), unitCost, notes: String(row.notes ?? "").trim() || null };
    }) } }, include: { lines: { include: { item: true } } } });
  await audit(tx, { action: "CREATE", entityType: "INVENTORY_COUNT", entityId: count.id, metadata: { countNumber, ownershipType, partyId } });
  return count;
}

export async function approveInventoryCount(tx: Tx, countId: number, userId?: string | number | null) {
  const count = await tx.inventoryCount.findUnique({ where: { id: countId }, include: { lines: true } });
  if (!count) throw new OperationalControlError("NOT_FOUND", "محضر الجرد غير موجود");
  if (count.status !== "DRAFT") throw new OperationalControlError("INVALID_STATUS", "محضر الجرد معتمد مسبقًا");
  for (const line of count.lines) {
    if (line.variance.isZero()) continue;
    const movement = await applyStockMovement(tx, { itemId: line.itemId, partyId: count.partyId, ownershipType: count.ownershipType as StockOwnership, movementType: "COUNT_ADJUSTMENT", ...(line.variance.gt(0) ? { quantityIn: Number(line.variance), unitCost: Number(line.unitCost) } : { quantityOut: Number(line.variance.abs()) }), movementDate: count.countDate, referenceType: "INVENTORY_COUNT", referenceId: count.id, referenceNumber: count.countNumber, notes: line.notes });
    await tx.inventoryCountLine.update({ where: { id: line.id }, data: { adjustmentMovementId: movement.movement.id } });
  }
  const approved = await tx.inventoryCount.update({ where: { id: count.id }, data: { status: "APPROVED", approvedAt: new Date(), approvedBy: userId == null ? "system" : String(userId) }, include: { lines: { include: { item: true } } } });
  await audit(tx, { action: "APPROVE", entityType: "INVENTORY_COUNT", entityId: count.id, userId: userId == null ? undefined : String(userId), metadata: { countNumber: count.countNumber } });
  return approved;
}

export function operationalControlErrorResponse(error: unknown) {
  if (error instanceof OperationalControlError) return { status: error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_STATUS" ? 409 : 400, message: error.message };
  return { status: 500, message: "تعذر تنفيذ الضابط التشغيلي" };
}
