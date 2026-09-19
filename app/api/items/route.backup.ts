import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.item.findMany({
      include: {
        unit: true,
        category: true,
      },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(items);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر تحميل المواد" },
      { status: 500 }
    );
  }
}
