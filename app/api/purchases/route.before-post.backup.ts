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
