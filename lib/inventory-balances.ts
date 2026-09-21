import { Prisma } from "@prisma/client";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
export class InventoryBalanceError extends Error { constructor(message: string) { super(message); this.name = "InventoryBalanceError"; } }
const id = (value: string | null) => { if (!value) return null; const parsed = Number(value); if (!Number.isSafeInteger(parsed) || parsed < 1) throw new InventoryBalanceError("رقم الصنف أو الطرف أو التصنيف غير صالح"); return parsed; };
const date = (value: string | null, end = false) => {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new InventoryBalanceError("صيغة التاريخ غير صحيحة");
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InventoryBalanceError("التاريخ غير صالح");
  return parsed;
};
const key = (ownership: string, partyId: number | null, itemId: number) => `${ownership}:${partyId ?? 0}:${itemId}`;
const zero = () => new Prisma.Decimal(0);

export async function inventoryBalances(tx: Tx, params: URLSearchParams) {
  const scope = await getVerifiedDataScope(), from = date(params.get("from")), requestedTo = date(params.get("to"), true), to = requestedTo ?? new Date();
  if (from && from > to) throw new InventoryBalanceError("بداية الفترة يجب أن تسبق نهايتها");
  const itemId = id(params.get("itemId")), categoryId = id(params.get("categoryId")), partyId = id(params.get("partyId"));
  const ownership = params.get("ownership") ?? "COMPANY";
  if (!["COMPANY", "PARTY", "ALL"].includes(ownership)) throw new InventoryBalanceError("نوع ملكية المخزون غير صحيح");
  if (partyId && ownership === "COMPANY") throw new InventoryBalanceError("فلتر الطرف متاح لمخزون الأطراف فقط");
  const q = (params.get("q") ?? "").trim().toLocaleLowerCase(), currentView = !requestedTo;
  const [allItems, parties, categories, company] = await Promise.all([
    tx.item.findMany({ where: scope, include: { unit: true, category: true }, orderBy: { code: "asc" } }),
    tx.party.findMany({ where: scope, select: { id: true, nameAr: true }, orderBy: { nameAr: "asc" } }),
    tx.itemCategory.findMany({ where: scope, select: { id: true, nameAr: true }, orderBy: { nameAr: "asc" } }),
    tx.company.findFirst({ where: { id: scope.companyId, tenantId: scope.tenantId }, select: { legalNameAr: true, baseCurrencyCode: true } }),
  ]);
  if (itemId && !allItems.some(row => row.id === itemId)) throw new InventoryBalanceError("الصنف غير موجود في الشركة الحالية");
  if (partyId && !parties.some(row => row.id === partyId)) throw new InventoryBalanceError("الطرف غير موجود في الشركة الحالية");
  if (categoryId && !categories.some(row => row.id === categoryId)) throw new InventoryBalanceError("التصنيف غير موجود في الشركة الحالية");
  const items = allItems.filter(row => (!itemId || row.id === itemId) && (!categoryId || row.categoryId === categoryId) && (!q || `${row.code} ${row.nameAr} ${row.nameEn ?? ""}`.toLocaleLowerCase().includes(q)));
  const itemIds = items.map(row => row.id), itemMap = new Map(items.map(row => [row.id, row])), partyMap = new Map(parties.map(row => [row.id, row.nameAr]));
  const [movements, companyStock, partyStock] = await Promise.all([
    tx.stockMovement.findMany({ where: { ...scope, itemId: { in: itemIds }, movementDate: { lte: to }, ...(ownership !== "ALL" ? { ownershipType: ownership } : {}), ...(partyId ? { partyId } : {}) }, orderBy: [{ movementDate: "asc" }, { id: "asc" }] }),
    currentView && ownership !== "PARTY" && !partyId ? tx.companyStock.findMany({ where: { ...scope, itemId: { in: itemIds } } }) : Promise.resolve([]),
    ownership !== "COMPANY" ? tx.partyStockAccount.findMany({ where: { ...scope, itemId: { in: itemIds }, ...(partyId ? { partyId } : {}) } }) : Promise.resolve([]),
  ]);
  type Accumulator = { itemId: number; partyId: number | null; ownership: string; opening: Prisma.Decimal; incoming: Prisma.Decimal; outgoing: Prisma.Decimal; openingValue: Prisma.Decimal; inValue: Prisma.Decimal; outValue: Prisma.Decimal; balance: Prisma.Decimal; value: Prisma.Decimal; movementCount: number; currentQuantity: Prisma.Decimal | null; currentAverage: Prisma.Decimal | null };
  const groups = new Map<string, Accumulator>();
  const ensure = (owner: string, party: number | null, item: number) => {
    const rowKey = key(owner, party, item);
    if (!groups.has(rowKey)) groups.set(rowKey, { itemId: item, partyId: party, ownership: owner, opening: zero(), incoming: zero(), outgoing: zero(), openingValue: zero(), inValue: zero(), outValue: zero(), balance: zero(), value: zero(), movementCount: 0, currentQuantity: null, currentAverage: null });
    return groups.get(rowKey)!;
  };
  if (ownership !== "PARTY" && !partyId) for (const item of items) ensure("COMPANY", null, item.id);
  for (const stock of companyStock) { const row = ensure("COMPANY", null, stock.itemId); row.currentQuantity = new Prisma.Decimal(stock.quantity); row.currentAverage = new Prisma.Decimal(stock.averageCost); }
  for (const stock of partyStock) { const row = ensure("PARTY", stock.partyId, stock.itemId); if (currentView) { row.currentQuantity = new Prisma.Decimal(stock.quantity); row.currentAverage = new Prisma.Decimal(stock.averageValue); } }
  const detailRows = [];
  for (const movement of movements) {
    const row = ensure(movement.ownershipType, movement.partyId, movement.itemId);
    const incoming = new Prisma.Decimal(movement.quantityIn), outgoing = new Prisma.Decimal(movement.quantityOut), value = new Prisma.Decimal(movement.totalValue);
    const signed = incoming.gt(0) ? value : outgoing.gt(0) ? value.negated() : zero();
    row.balance = row.balance.plus(incoming).minus(outgoing); row.value = row.value.plus(signed); row.movementCount++;
    if (from && movement.movementDate < from) { row.opening = row.opening.plus(incoming).minus(outgoing); row.openingValue = row.openingValue.plus(signed); }
    else {
      row.incoming = row.incoming.plus(incoming); row.outgoing = row.outgoing.plus(outgoing);
      if (incoming.gt(0)) row.inValue = row.inValue.plus(value);
      if (outgoing.gt(0)) row.outValue = row.outValue.plus(value);
      if (params.get("view") === "movements") detailRows.push({ id: movement.id, movementNumber: movement.movementNumber, date: movement.movementDate.toISOString().slice(0, 10), itemCode: itemMap.get(movement.itemId)?.code ?? "", itemName: itemMap.get(movement.itemId)?.nameAr ?? "", ownership: movement.ownershipType, partyName: movement.partyId ? partyMap.get(movement.partyId) ?? "" : "مخزون الشركة", movementType: movement.movementType, incoming: incoming.toNumber(), outgoing: outgoing.toNumber(), unitCost: Number(movement.unitCost), value: value.toNumber(), balance: row.balance.toNumber(), closingValue: row.value.toNumber(), referenceType: movement.referenceType, referenceNumber: movement.referenceNumber, referenceId: movement.referenceId, notes: movement.notes });
    }
  }
  const rows = [...groups.values()].map(row => {
    const item = itemMap.get(row.itemId)!;
    const currentQuantity = currentView ? row.currentQuantity ?? zero() : null;
    const currentAverage = currentView ? row.currentAverage ?? zero() : null;
    return { key: key(row.ownership, row.partyId, row.itemId), itemId: row.itemId, itemCode: item.code, itemName: item.nameAr, categoryName: item.category?.nameAr ?? "—", unit: item.unit.nameAr,
      ownership: row.ownership, partyId: row.partyId, partyName: row.partyId ? partyMap.get(row.partyId) ?? "—" : "مخزون الشركة",
      openingQuantity: row.opening.toNumber(), incoming: row.incoming.toNumber(), outgoing: row.outgoing.toNumber(), closingQuantity: row.balance.toNumber(),
      openingValue: row.openingValue.toNumber(), incomingValue: row.inValue.toNumber(), outgoingValue: row.outValue.toNumber(), closingValue: row.value.toNumber(),
      movementCount: row.movementCount, currentQuantity: currentQuantity?.toNumber() ?? null, currentAverageCost: currentAverage?.toNumber() ?? null,
      currentStockValue: currentQuantity && currentAverage ? currentQuantity.mul(currentAverage).toNumber() : null,
      quantityDifference: currentQuantity ? currentQuantity.minus(row.balance).toNumber() : null };
  }).filter(row => params.get("showZero") === "true" || row.closingQuantity !== 0 || (currentView && row.currentQuantity !== 0));
  rows.sort((a, b) => a.itemCode.localeCompare(b.itemCode, "ar", { numeric: true }) || a.partyName.localeCompare(b.partyName, "ar"));
  // Quantities from unlike units are never added into one misleading total.
  const quantitiesByUnit = new Map<string, Prisma.Decimal>();
  for (const row of rows) quantitiesByUnit.set(row.unit, (quantitiesByUnit.get(row.unit) ?? zero()).plus(row.closingQuantity));
  return { rows, movements: detailRows, currentView, asOf: to.toISOString(), from: from?.toISOString() ?? null, company,
    totals: { itemAccounts: rows.length, closingValue: rows.filter(row => row.ownership === "COMPANY").reduce((sum, row) => sum.plus(row.closingValue), zero()).toNumber(), partyValue: rows.filter(row => row.ownership === "PARTY").reduce((sum, row) => sum.plus(row.closingValue), zero()).toNumber(), currentStockValue: currentView ? rows.filter(row => row.ownership === "COMPANY").reduce((sum, row) => sum.plus(row.currentStockValue ?? 0), zero()).toNumber() : null, unmatchedAccounts: rows.filter(row => row.quantityDifference !== null && row.quantityDifference !== 0).length, quantitiesByUnit: [...quantitiesByUnit].map(([unit, quantity]) => ({ unit, quantity: quantity.toNumber() })) },
    options: { items: allItems.map(row => ({ id: row.id, code: row.code, nameAr: row.nameAr })), parties, categories },
    granularity: "الحركات الحالية معرفة على مستوى الشركة والملكية؛ لا تحمل فرعًا أو مستودعًا مستقلًا." };
}
