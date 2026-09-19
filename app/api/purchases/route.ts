import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CommerceValidationError,
  commerceTotals,
  optionalDate,
  optionalText,
  parseCommerceLines,
  requiredText,
} from "@/lib/commerce";

export async function GET() {
  try {
    const purchases = await prisma.purchase.findMany({
      include: { party: true, items: { include: { item: true } } },
      orderBy: { purchaseDate: "desc" },
    });
    return NextResponse.json(purchases);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تحميل المشتريات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const purchaseNumber = requiredText(body.purchaseNumber, "رقم الشراء مطلوب");
    const partyId = Number(body.partyId);
    if (!Number.isInteger(partyId) || partyId <= 0) {
      throw new CommerceValidationError("المورد غير صحيح");
    }
    const lines = parseCommerceLines(body.items);
    const totals = commerceTotals(lines);

    const [party, validItems] = await Promise.all([
      prisma.party.findUnique({ where: { id: partyId } }),
      prisma.item.count({
        where: { id: { in: lines.map((line) => line.itemId) }, isActive: true },
      }),
    ]);
    if (!party?.isSupplier || !party.isActive) {
      throw new CommerceValidationError("الكيان المحدد ليس موردًا نشطًا للمشتريات");
    }
    if (validItems !== new Set(lines.map((line) => line.itemId)).size) {
      throw new CommerceValidationError("توجد مادة غير موجودة أو غير نشطة");
    }

    // A purchase invoice records the commercial transaction only. Ownership
    // moves through the operational inventory document, not automatically here.
    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber,
        purchaseDate: optionalDate(body.purchaseDate) ?? new Date(),
        partyId,
        supplierInvoiceNumber: optionalText(body.supplierInvoiceNumber),
        referenceNumber: optionalText(body.referenceNumber),
        ...totals,
        status: optionalText(body.status) ?? "DRAFT",
        notes: optionalText(body.notes),
        items: { create: lines },
      },
      include: { party: true, items: { include: { item: true } } },
    });
    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof CommerceValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "رقم الشراء مستخدم مسبقًا" }, { status: 409 });
    }
    return NextResponse.json({ error: "تعذر إنشاء فاتورة المشتريات" }, { status: 500 });
  }
}
