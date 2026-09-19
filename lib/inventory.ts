import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

export type StockOwnership = "COMPANY" | "PARTY";

export type StockMovementInput = {
  itemId: number;
  partyId?: number | null;
  ownershipType: StockOwnership;
  movementType: string;
  quantityIn?: number;
  quantityOut?: number;
  unitCost?: number;
  movementDate?: Date;
  referenceType?: string | null;
  referenceId?: number | null;
  referenceNumber?: string | null;
  notes?: string | null;
};

export type OwnershipTransferInput = {
  direction: "COMPANY_TO_PARTY" | "PARTY_TO_COMPANY";
  itemId: number;
  partyId: number;
  quantity: number;
  unitCost?: number;
  movementDate?: Date;
  referenceNumber?: string | null;
  notes?: string | null;
};

export class InventoryError extends Error {
  public readonly code:
    | "INVALID_INPUT"
    | "ITEM_NOT_FOUND"
    | "PARTY_NOT_FOUND"
    | "INSUFFICIENT_COMPANY_STOCK";

  constructor(
    code:
      | "INVALID_INPUT"
      | "ITEM_NOT_FOUND"
      | "PARTY_NOT_FOUND"
      | "INSUFFICIENT_COMPANY_STOCK",
    message: string
  ) {
    super(message);
    this.name = "InventoryError";
    this.code = code;
  }
}

function finiteNonNegative(value: number | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) && number >= 0 ? number : Number.NaN;
}

function movementNumber() {
  const timestamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17);
  return `STK-${timestamp}-${randomUUID().slice(0, 8).toUpperCase()}`;
}

export async function applyStockMovement(
  tx: Prisma.TransactionClient,
  input: StockMovementInput
) {
  const quantityIn = finiteNonNegative(input.quantityIn);
  const quantityOut = finiteNonNegative(input.quantityOut);
  const requestedUnitCost = finiteNonNegative(input.unitCost);

  if (!Number.isInteger(input.itemId) || input.itemId <= 0) {
    throw new InventoryError("INVALID_INPUT", "المادة غير صحيحة");
  }

  if (
    Number.isNaN(quantityIn) ||
    Number.isNaN(quantityOut) ||
    Number.isNaN(requestedUnitCost) ||
    (quantityIn <= 0 && quantityOut <= 0) ||
    (quantityIn > 0 && quantityOut > 0)
  ) {
    throw new InventoryError(
      "INVALID_INPUT",
      "يجب إدخال كمية واردة أو صادرة واحدة بقيمة صحيحة"
    );
  }

  if (
    input.ownershipType === "PARTY" &&
    (!Number.isInteger(input.partyId) || Number(input.partyId) <= 0)
  ) {
    throw new InventoryError(
      "INVALID_INPUT",
      "يجب تحديد العميل أو المورد"
    );
  }

  const item = await tx.item.findUnique({ where: { id: input.itemId } });
  if (!item) {
    throw new InventoryError("ITEM_NOT_FOUND", "المادة غير موجودة");
  }

  if (input.ownershipType === "PARTY") {
    const party = await tx.party.findUnique({
      where: { id: Number(input.partyId) },
      select: { id: true },
    });
    if (!party) {
      throw new InventoryError(
        "PARTY_NOT_FOUND",
        "العميل أو المورد غير موجود"
      );
    }
  }

  let oldQuantity = 0;
  let oldAverage = 0;

  if (input.ownershipType === "COMPANY") {
    const stock = await tx.companyStock.findUnique({
      where: { itemId: input.itemId },
    });
    oldQuantity = Number(stock?.quantity ?? 0);
    oldAverage = Number(stock?.averageCost ?? 0);
  } else {
    const stock = await tx.partyStockAccount.findUnique({
      where: {
        partyId_itemId: {
          partyId: Number(input.partyId),
          itemId: input.itemId,
        },
      },
    });
    oldQuantity = Number(stock?.quantity ?? 0);
    oldAverage = Number(stock?.averageValue ?? 0);
  }

  const newQuantity = oldQuantity + quantityIn - quantityOut;
  if (input.ownershipType === "COMPANY" && newQuantity < 0) {
    throw new InventoryError(
      "INSUFFICIENT_COMPANY_STOCK",
      "رصيد مخزون الشركة غير كافٍ"
    );
  }

  let newAverage = oldAverage;
  let effectiveUnitCost = requestedUnitCost;

  if (quantityIn > 0) {
    // Operational receipt notes intentionally contain no prices. When cost is
    // not known yet, preserve the existing average instead of diluting it with
    // a zero value. A later invoice/cost adjustment can supply the actual cost.
    effectiveUnitCost = requestedUnitCost || oldAverage;
    if (oldQuantity >= 0) {
      const newPositiveQuantity = oldQuantity + quantityIn;
      newAverage =
        newPositiveQuantity > 0
          ? (oldQuantity * oldAverage + quantityIn * effectiveUnitCost) /
            newPositiveQuantity
          : effectiveUnitCost;
    } else if (newQuantity > 0) {
      // Incoming stock first settles the negative balance; only the remaining
      // positive quantity is valued at the incoming cost.
      newAverage = effectiveUnitCost;
    }
  } else {
    effectiveUnitCost = requestedUnitCost || oldAverage;
    if (input.ownershipType === "PARTY" && oldAverage === 0) {
      newAverage = effectiveUnitCost;
    }
  }

  if (input.ownershipType === "COMPANY") {
    await tx.companyStock.upsert({
      where: { itemId: input.itemId },
      create: {
        itemId: input.itemId,
        quantity: newQuantity,
        averageCost: newAverage,
      },
      update: { quantity: newQuantity, averageCost: newAverage },
    });
  } else {
    await tx.partyStockAccount.upsert({
      where: {
        partyId_itemId: {
          partyId: Number(input.partyId),
          itemId: input.itemId,
        },
      },
      create: {
        partyId: Number(input.partyId),
        itemId: input.itemId,
        quantity: newQuantity,
        averageValue: newAverage,
      },
      update: { quantity: newQuantity, averageValue: newAverage },
    });
  }

  const movement = await tx.stockMovement.create({
    data: {
      movementNumber: movementNumber(),
      movementDate: input.movementDate ?? new Date(),
      itemId: input.itemId,
      partyId:
        input.ownershipType === "PARTY" ? Number(input.partyId) : null,
      ownershipType: input.ownershipType,
      movementType: input.movementType,
      quantityIn,
      quantityOut,
      unitCost: effectiveUnitCost,
      totalValue: (quantityIn || quantityOut) * effectiveUnitCost,
      balanceAfter: newQuantity,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      referenceNumber: input.referenceNumber ?? null,
      notes: input.notes ?? null,
    },
  });
  await audit(tx, {
    action: "STOCK_MOVEMENT",
    entityType: "STOCK_MOVEMENT",
    entityId: movement.id,
    metadata: {
      ownershipType: input.ownershipType,
      itemId: input.itemId,
      partyId: input.partyId ?? null,
      referenceType: input.referenceType ?? null,
      referenceId: input.referenceId ?? null,
      balanceAfter: newQuantity,
    },
  });

  return {
    movement,
    oldQuantity,
    newQuantity,
    averageValue: newAverage,
    warning:
      input.ownershipType === "PARTY" && newQuantity < 0
        ? "تحذير: رصيد العميل أصبح سالبًا"
        : null,
  };
}

export async function transferStockOwnership(
  tx: Prisma.TransactionClient,
  input: OwnershipTransferInput
) {
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new InventoryError("INVALID_INPUT", "كمية التحويل غير صحيحة");
  }

  const referenceNumber =
    input.referenceNumber?.trim() ||
    `TRF-${new Date().toISOString().replace(/\D/g, "").slice(0, 17)}-${randomUUID()
      .slice(0, 6)
      .toUpperCase()}`;

  const fromCompany = input.direction === "COMPANY_TO_PARTY";
  const source = await applyStockMovement(tx, {
    itemId: input.itemId,
    partyId: fromCompany ? null : input.partyId,
    ownershipType: fromCompany ? "COMPANY" : "PARTY",
    movementType: "TRANSFER_OUT",
    quantityOut: input.quantity,
    unitCost: input.unitCost,
    movementDate: input.movementDate,
    referenceType: "OWNERSHIP_TRANSFER",
    referenceNumber,
    notes: input.notes,
  });

  const sourceUnitCost = Number(source.movement.unitCost);
  const destination = await applyStockMovement(tx, {
    itemId: input.itemId,
    partyId: fromCompany ? input.partyId : null,
    ownershipType: fromCompany ? "PARTY" : "COMPANY",
    movementType: "TRANSFER_IN",
    quantityIn: input.quantity,
    unitCost: input.unitCost || sourceUnitCost,
    movementDate: input.movementDate,
    referenceType: "OWNERSHIP_TRANSFER",
    referenceNumber,
    notes: input.notes,
  });

  return { referenceNumber, source, destination };
}
