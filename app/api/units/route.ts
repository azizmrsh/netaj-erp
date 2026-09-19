import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const units = await prisma.unit.findMany({
      where: { isActive: true },
      orderBy: { id: "asc" },
    });

    return NextResponse.json(units);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر تحميل الوحدات" },
      { status: 500 }
    );
  }
}
