import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const categories = await prisma.itemCategory.findMany({
      where: { isActive: true },
      orderBy: { nameAr: "asc" },
    });

    return NextResponse.json(categories);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر تحميل التصنيفات" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const nameAr = String(body.nameAr || "").trim();
    const nameEn = String(body.nameEn || "").trim() || null;

    if (!nameAr) {
      return NextResponse.json(
        { error: "اسم التصنيف العربي مطلوب" },
        { status: 400 }
      );
    }

    const category = await prisma.itemCategory.create({
      data: { nameAr, nameEn },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "تعذر إضافة التصنيف" },
      { status: 500 }
    );
  }
}
