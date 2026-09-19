import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const sales = await prisma.sale.findMany({
      include: {
        party: true,
        items: {
          include: {
            item: true,
          },
        },
      },
      orderBy: {
        invoiceDate: "desc",
      },
    });

    return NextResponse.json(sales);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر تحميل المبيعات" },
      { status: 500 }
    );
  }
}
