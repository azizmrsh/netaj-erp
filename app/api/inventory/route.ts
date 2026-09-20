import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

function idList(value: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0);
}

function dateBoundary(value: string | null, endOfDay = false) {
  if (!value) return null;
  const suffix = endOfDay ? "T23:59:59.999" : "T00:00:00.000";
  const date = new Date(value.includes("T") ? value : `${value}${suffix}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const movementInclude = {
  item: { include: { unit: true, category: true } },
  party: true,
} satisfies Prisma.StockMovementInclude;

type IncludedMovement = Prisma.StockMovementGetPayload<{
  include: typeof movementInclude;
}>;

function movementJson(row: IncludedMovement) {
  return {
    ...row,
    quantityIn: Number(row.quantityIn),
    quantityOut: Number(row.quantityOut),
    unitCost: Number(row.unitCost),
    totalValue: Number(row.totalValue),
    balanceAfter:
      row.balanceAfter === null ? null : Number(row.balanceAfter),
  };
}

type StatementRow = {
  key: string;
  ownershipType: string;
  partyId: number | null;
  partyName: string;
  itemId: number;
  itemCode: string;
  itemName: string;
  unitName: string;
  openingQuantity: number;
  quantityIn: number;
  quantityOut: number;
  closingQuantity: number;
  movementInValue: number;
  movementOutValue: number;
};

function statementKey(row: IncludedMovement) {
  return `${row.ownershipType}:${row.partyId ?? "company"}:${row.itemId}`;
}

function statementBase(row: IncludedMovement): StatementRow {
  return {
    key: statementKey(row),
    ownershipType: row.ownershipType,
    partyId: row.partyId,
    partyName: row.party?.nameAr ?? "مخزون الشركة",
    itemId: row.itemId,
    itemCode: row.item.code,
    itemName: row.item.nameAr,
    unitName: row.item.unit.nameAr,
    openingQuantity: 0,
    quantityIn: 0,
    quantityOut: 0,
    closingQuantity: 0,
    movementInValue: 0,
    movementOutValue: 0,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "INVENTORY", action: "READ" });
    const { searchParams } = new URL(request.url);
    const itemIds = idList(searchParams.get("itemIds"));
    const partyIds = idList(searchParams.get("partyIds"));
    const ownershipType = searchParams.get("ownershipType")?.toUpperCase();
    const from = dateBoundary(searchParams.get("from"));
    const to = dateBoundary(searchParams.get("to"), true);

    const baseMovementWhere: Prisma.StockMovementWhereInput = {
      ...(itemIds.length ? { itemId: { in: itemIds } } : {}),
      ...(partyIds.length ? { partyId: { in: partyIds } } : {}),
      ...(ownershipType === "COMPANY" || ownershipType === "PARTY"
        ? { ownershipType }
        : {}),
    };

    const periodWhere: Prisma.StockMovementWhereInput = {
      ...baseMovementWhere,
      ...(from || to
        ? {
            movementDate: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    };

    const [companyStock, partyStock, movements, openingMovements, items, parties] =
      await Promise.all([
        prisma.companyStock.findMany({
          where: { tenantId: auth.tenantId, companyId: auth.companyId, ...(itemIds.length ? { itemId: { in: itemIds } } : {}) },
          include: {
            item: { include: { unit: true, category: true } },
          },
          orderBy: { itemId: "asc" },
        }),
        prisma.partyStockAccount.findMany({
          where: {
            tenantId: auth.tenantId, companyId: auth.companyId,
            ...(itemIds.length ? { itemId: { in: itemIds } } : {}),
            ...(partyIds.length ? { partyId: { in: partyIds } } : {}),
          },
          include: {
            party: true,
            item: { include: { unit: true, category: true } },
          },
          orderBy: [{ partyId: "asc" }, { itemId: "asc" }],
        }),
        prisma.stockMovement.findMany({
          where: { ...periodWhere, tenantId: auth.tenantId, companyId: auth.companyId },
          include: movementInclude,
          orderBy: [{ movementDate: "desc" }, { id: "desc" }],
        }),
        from
          ? prisma.stockMovement.findMany({
              where: {
                tenantId: auth.tenantId, companyId: auth.companyId,
                ...baseMovementWhere,
                movementDate: { lt: from },
              },
              include: movementInclude,
              orderBy: [{ movementDate: "asc" }, { id: "asc" }],
            })
          : Promise.resolve([] as IncludedMovement[]),
        prisma.item.findMany({
          where: { isActive: true, tenantId: auth.tenantId, companyId: auth.companyId },
          select: { id: true, code: true, nameAr: true },
          orderBy: { nameAr: "asc" },
        }),
        prisma.party.findMany({
          where: { isActive: true, tenantId: auth.tenantId, companyId: auth.companyId },
          select: {
            id: true,
            nameAr: true,
            isCustomer: true,
            isSupplier: true,
          },
          orderBy: { nameAr: "asc" },
        }),
      ]);

    const statement = new Map<string, StatementRow>();
    for (const row of openingMovements) {
      const key = statementKey(row);
      const entry = statement.get(key) ?? statementBase(row);
      entry.openingQuantity += Number(row.quantityIn) - Number(row.quantityOut);
      entry.closingQuantity = entry.openingQuantity;
      statement.set(key, entry);
    }

    for (const row of movements.slice().reverse()) {
      const key = statementKey(row);
      const entry = statement.get(key) ?? statementBase(row);
      const quantityIn = Number(row.quantityIn);
      const quantityOut = Number(row.quantityOut);
      entry.quantityIn += quantityIn;
      entry.quantityOut += quantityOut;
      entry.movementInValue += quantityIn * Number(row.unitCost);
      entry.movementOutValue += quantityOut * Number(row.unitCost);
      entry.closingQuantity =
        entry.openingQuantity + entry.quantityIn - entry.quantityOut;
      statement.set(key, entry);
    }

    const company = companyStock.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      averageCost: Number(row.averageCost),
      stockValue: Number(row.quantity) * Number(row.averageCost),
    }));
    const customers = partyStock.map((row) => ({
      ...row,
      quantity: Number(row.quantity),
      averageValue: Number(row.averageValue),
      stockValue: Number(row.quantity) * Number(row.averageValue),
      isNegative: Number(row.quantity) < 0,
    }));

    return NextResponse.json({
      companyStock: company,
      partyStock: customers,
      movements: movements.map(movementJson),
      statement: Array.from(statement.values()).sort((a, b) =>
        `${a.partyName}-${a.itemName}`.localeCompare(
          `${b.partyName}-${b.itemName}`,
          "ar"
        )
      ),
      summary: {
        companyItems: company.length,
        companyQuantity: company.reduce((sum, row) => sum + row.quantity, 0),
        companyValue: company.reduce((sum, row) => sum + row.stockValue, 0),
        partyStockAccounts: customers.length,
        partyQuantity: customers.reduce((sum, row) => sum + row.quantity, 0),
        partyValue: customers.reduce((sum, row) => sum + row.stockValue, 0),
        negativePartyBalances: customers.filter((row) => row.isNegative).length,
        movementCount: movements.length,
      },
      filterOptions: { items, parties },
      filters: {
        itemIds,
        partyIds,
        from: from?.toISOString() ?? null,
        to: to?.toISOString() ?? null,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error);
    return NextResponse.json(
      { error: "تعذر تحميل بيانات المخزون" },
      { status: 500 }
    );
  }
}
