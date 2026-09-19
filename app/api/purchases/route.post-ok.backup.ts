import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const purchases = await prisma.purchase.findMany({
      include: {
        party: true,
        items: {
          include: {
            item: true,
          },
        },
      },
      orderBy: {
        purchaseDate: "desc",
      },
    });

    return NextResponse.json(purchases);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر تحميل المشتريات" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const purchase = await prisma.purchase.create({
      data: {
        purchaseNumber: body.purchaseNumber,
        purchaseDate: body.purchaseDate
          ? new Date(body.purchaseDate)
          : new Date(),
        partyId: Number(body.partyId),
        supplierInvoiceNumber: body.supplierInvoiceNumber || null,
        referenceNumber: body.referenceNumber || null,
        subtotal: body.subtotal || 0,
        discount: body.discount || 0,
        vatAmount: body.vatAmount || 0,
        totalAmount: body.totalAmount || 0,
        status: body.status || "DRAFT",
        notes: body.notes || null,

        items: {
          create: (body.items || []).map((row: any) => ({
            itemId: Number(row.itemId),
            quantity: row.quantity || 0,
            unitPrice: row.unitPrice || 0,
            discount: row.discount || 0,
            vatRate: row.vatRate ?? 15,
            vatAmount: row.vatAmount || 0,
            totalAmount: row.totalAmount || 0,
          })),
        },
      },

      include: {
        party: true,
        items: {
          include: {
            item: true,
          },
        },
      },
    });

    return NextResponse.json(purchase, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "تعذر إنشاء فاتورة المشتريات" },
      { status: 500 }
    );
  }
}
