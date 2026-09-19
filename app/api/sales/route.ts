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
import { evaluateApprovalRules } from "@/lib/configuration";

export async function GET() {
  try {
    const sales = await prisma.sale.findMany({
      include: { party: true, items: { include: { item: true } } },
      orderBy: { invoiceDate: "desc" },
    });
    return NextResponse.json(sales);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تحميل المبيعات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const invoiceNumber = requiredText(body.invoiceNumber, "رقم الفاتورة مطلوب");
    const partyId = Number(body.partyId);
    if (!Number.isInteger(partyId) || partyId <= 0) {
      throw new CommerceValidationError("العميل غير صحيح");
    }
    const lines = parseCommerceLines(body.items);
    const totals = commerceTotals(lines);
    const approvalRules = await prisma.approvalRule.findMany({ where: { entityType: "SALE", isActive: true }, orderBy: { priority: "asc" } });
    const requiredApprovals = evaluateApprovalRules(approvalRules, { ...body, totalAmount: totals.totalAmount, subtotal: totals.subtotal });

    const [party, validItems] = await Promise.all([
      prisma.party.findUnique({ where: { id: partyId } }),
      prisma.item.count({
        where: { id: { in: lines.map((line) => line.itemId) }, isActive: true },
      }),
    ]);
    if (!party?.isCustomer || !party.isActive) {
      throw new CommerceValidationError("الكيان المحدد ليس عميلًا نشطًا للمبيعات");
    }
    if (validItems !== new Set(lines.map((line) => line.itemId)).size) {
      throw new CommerceValidationError("توجد مادة غير موجودة أو غير نشطة");
    }

    const sale = await prisma.sale.create({
      data: {
        invoiceNumber,
        invoiceDate: optionalDate(body.invoiceDate) ?? new Date(),
        partyId,
        referenceNumber: optionalText(body.referenceNumber),
        purchaseOrderNumber: optionalText(body.purchaseOrderNumber),
        paymentMethod: optionalText(body.paymentMethod),
        dueDate: optionalDate(body.dueDate),
        ...totals,
        status: requiredApprovals.length ? "PENDING" : optionalText(body.status) ?? "DRAFT",
        notes: optionalText(body.notes),
        items: { create: lines },
      },
      include: { party: true, items: { include: { item: true } } },
    });
    return NextResponse.json({ ...sale, requiredApprovals }, { status: 201 });
  } catch (error) {
    console.error(error);
    if (error instanceof CommerceValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "رقم الفاتورة مستخدم مسبقًا" }, { status: 409 });
    }
    return NextResponse.json({ error: "تعذر إنشاء فاتورة المبيعات" }, { status: 500 });
  }
}
