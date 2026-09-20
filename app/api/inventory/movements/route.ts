import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import {
  applyStockMovement,
  InventoryError,
  transferStockOwnership,
  type StockOwnership,
} from "@/lib/inventory";

type RequestBody = Record<string, unknown>;

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : Number.NaN;
}

function optionalDate(value: unknown) {
  if (!value) return undefined;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function errorResponse(error: unknown) {
  console.error(error);

  if (error instanceof InventoryError) {
    const status =
      error.code === "ITEM_NOT_FOUND" || error.code === "PARTY_NOT_FOUND"
        ? 404
        : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  if (error instanceof AuthError) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }

  return NextResponse.json(
    { error: "تعذر تسجيل حركة المخزون" },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "INVENTORY", action: "CREATE" });
    const body = (await request.json()) as RequestBody;
    const itemId = Number(body.itemId);
    const partyId = optionalPositiveInteger(body.partyId);
    const movementDate = optionalDate(body.movementDate);

    if (movementDate === null) {
      return NextResponse.json(
        { error: "تاريخ الحركة غير صحيح" },
        { status: 400 }
      );
    }

    const transferDirection = String(body.transferDirection ?? "").toUpperCase();
    const item = await prisma.item.findFirst({ where: { id: itemId, tenantId: auth.tenantId, companyId: auth.companyId, isActive: true }, select: { id: true } });
    if (!item) return NextResponse.json({ error: "المادة غير موجودة ضمن الشركة الحالية" }, { status: 404 });
    if (partyId) {
      const party = await prisma.party.findFirst({ where: { id: partyId, tenantId: auth.tenantId, companyId: auth.companyId, isActive: true }, select: { id: true } });
      if (!party) return NextResponse.json({ error: "العميل أو المورد غير موجود ضمن الشركة الحالية" }, { status: 404 });
    }
    if (
      transferDirection === "COMPANY_TO_PARTY" ||
      transferDirection === "PARTY_TO_COMPANY"
    ) {
      if (!partyId || Number.isNaN(partyId)) {
        return NextResponse.json(
          { error: "يجب تحديد العميل أو المورد للتحويل" },
          { status: 400 }
        );
      }

      const result = await prisma.$transaction((tx) =>
        transferStockOwnership(tx, {
          direction: transferDirection,
          itemId,
          partyId,
          quantity: Number(body.quantity),
          unitCost: Number(body.unitCost ?? 0),
          movementDate,
          referenceNumber: optionalText(body.referenceNumber),
          notes: optionalText(body.notes),
        })
      );
      return NextResponse.json(result, { status: 201 });
    }

    const ownershipType = String(body.ownershipType ?? "").toUpperCase();
    if (ownershipType !== "COMPANY" && ownershipType !== "PARTY") {
      return NextResponse.json(
        { error: "نوع ملكية المخزون غير صحيح" },
        { status: 400 }
      );
    }

    if (Number.isNaN(partyId)) {
      return NextResponse.json(
        { error: "رقم العميل أو المورد غير صحيح" },
        { status: 400 }
      );
    }

    const movementType = String(
      body.movementType || (Number(body.quantityIn) > 0 ? "RECEIPT" : "DELIVERY")
    )
      .trim()
      .toUpperCase();

    const result = await prisma.$transaction((tx) =>
      applyStockMovement(tx, {
        itemId,
        partyId,
        ownershipType: ownershipType as StockOwnership,
        movementType,
        quantityIn: Number(body.quantityIn ?? 0),
        quantityOut: Number(body.quantityOut ?? 0),
        unitCost: Number(body.unitCost ?? 0),
        movementDate,
        referenceType: optionalText(body.referenceType),
        referenceId: optionalPositiveInteger(body.referenceId),
        referenceNumber: optionalText(body.referenceNumber),
        notes: optionalText(body.notes),
      })
    );

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
