import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const includeRelations = {
  unit: true,
  category: true,
};

export async function GET() {
  try {
    const items = await prisma.item.findMany({
      include: includeRelations,
      orderBy: { id: "desc" },
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

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const code = String(body.code || "").trim().toUpperCase();
    const nameAr = String(body.nameAr || "").trim();
    const nameEn = body.nameEn ? String(body.nameEn).trim() : null;
    const specification = body.specification
      ? String(body.specification).trim()
      : null;
    const manufacturer = body.manufacturer
      ? String(body.manufacturer).trim()
      : null;
    const countryOfOrigin = body.countryOfOrigin
      ? String(body.countryOfOrigin).trim()
      : null;
    const batchNumber = body.batchNumber
      ? String(body.batchNumber).trim()
      : null;

    const unitId = Number(body.unitId);
    const categoryId =
      body.categoryId === null ||
      body.categoryId === undefined ||
      body.categoryId === ""
        ? null
        : Number(body.categoryId);

    const costPrice = Number(body.costPrice ?? 0);
    const salePrice = Number(body.salePrice ?? 0);
    const vatRate = Number(body.vatRate ?? 15);
    const minimumStock = Number(body.minimumStock ?? 0);

    if (!code || !nameAr) {
      return NextResponse.json(
        { error: "كود المادة والاسم العربي مطلوبان" },
        { status: 400 }
      );
    }

    if (!Number.isInteger(unitId) || unitId <= 0) {
      return NextResponse.json(
        { error: "يجب اختيار وحدة صحيحة" },
        { status: 400 }
      );
    }

    if (
      !Number.isFinite(costPrice) ||
      !Number.isFinite(salePrice) ||
      !Number.isFinite(vatRate) ||
      !Number.isFinite(minimumStock) ||
      costPrice < 0 ||
      salePrice < 0 ||
      vatRate < 0 ||
      minimumStock < 0
    ) {
      return NextResponse.json(
        { error: "الأسعار والضريبة والحد الأدنى للمخزون يجب أن تكون أرقامًا صحيحة وغير سالبة" },
        { status: 400 }
      );
    }

    const existing = await prisma.item.findUnique({
      where: { code },
    });

    if (existing) {
      return NextResponse.json(
        { error: "كود المادة مستخدم مسبقًا" },
        { status: 409 }
      );
    }

    const unit = await prisma.unit.findUnique({
      where: { id: unitId },
    });

    if (!unit || !unit.isActive) {
      return NextResponse.json(
        { error: "الوحدة غير موجودة أو غير نشطة" },
        { status: 400 }
      );
    }

    if (categoryId !== null) {
      if (!Number.isInteger(categoryId) || categoryId <= 0) {
        return NextResponse.json(
          { error: "التصنيف غير صحيح" },
          { status: 400 }
        );
      }

      const category = await prisma.itemCategory.findUnique({
        where: { id: categoryId },
      });

      if (!category || !category.isActive) {
        return NextResponse.json(
          { error: "التصنيف غير موجود أو غير نشط" },
          { status: 400 }
        );
      }
    }

    const item = await prisma.item.create({
      data: {
        code,
        nameAr,
        nameEn,
        categoryId,
        unitId,
        specification,
        manufacturer,
        countryOfOrigin,
        batchNumber,
        costPrice,
        salePrice,
        vatRate,
        minimumStock,
        isActive: true,
      },
      include: includeRelations,
    });

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "تعذر إضافة المادة" },
      { status: 500 }
    );
  }
}
