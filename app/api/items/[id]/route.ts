import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const includeRelations = {
  unit: true,
  category: true,
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const itemId = Number(id);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "رقم المادة غير صحيح" }, { status: 400 });
    }

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: includeRelations,
    });

    if (!item) {
      return NextResponse.json({ error: "المادة غير موجودة" }, { status: 404 });
    }

    return NextResponse.json(item);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تحميل المادة" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const itemId = Number(id);
    const body = await request.json();

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return NextResponse.json({ error: "رقم المادة غير صحيح" }, { status: 400 });
    }

    const current = await prisma.item.findUnique({ where: { id: itemId } });

    if (!current) {
      return NextResponse.json({ error: "المادة غير موجودة" }, { status: 404 });
    }

    const code =
      body.code !== undefined
        ? String(body.code).trim().toUpperCase()
        : current.code;

    const nameAr =
      body.nameAr !== undefined ? String(body.nameAr).trim() : current.nameAr;

    if (!code || !nameAr) {
      return NextResponse.json(
        { error: "كود المادة والاسم العربي مطلوبان" },
        { status: 400 }
      );
    }

    const duplicate = await prisma.item.findFirst({
      where: {
        code,
        NOT: { id: itemId },
      },
    });

    if (duplicate) {
      return NextResponse.json(
        { error: "كود المادة مستخدم لمادة أخرى" },
        { status: 409 }
      );
    }

    const unitId =
      body.unitId !== undefined ? Number(body.unitId) : current.unitId;

    const unit = await prisma.unit.findUnique({ where: { id: unitId } });

    if (!unit || !unit.isActive) {
      return NextResponse.json(
        { error: "الوحدة غير موجودة أو غير نشطة" },
        { status: 400 }
      );
    }

    let categoryId = current.categoryId;

    if (body.categoryId !== undefined) {
      categoryId =
        body.categoryId === null || body.categoryId === ""
          ? null
          : Number(body.categoryId);

      if (categoryId !== null) {
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
    }

    const costPrice =
      body.costPrice !== undefined ? Number(body.costPrice) : Number(current.costPrice);
    const salePrice =
      body.salePrice !== undefined ? Number(body.salePrice) : Number(current.salePrice);
    const vatRate =
      body.vatRate !== undefined ? Number(body.vatRate) : Number(current.vatRate);
    const minimumStock =
      body.minimumStock !== undefined
        ? Number(body.minimumStock)
        : Number(current.minimumStock);

    if (
      ![costPrice, salePrice, vatRate, minimumStock].every(
        (value) => Number.isFinite(value) && value >= 0
      )
    ) {
      return NextResponse.json(
        { error: "الأسعار والضريبة والحد الأدنى يجب أن تكون أرقامًا غير سالبة" },
        { status: 400 }
      );
    }

    const item = await prisma.item.update({
      where: { id: itemId },
      data: {
        code,
        nameAr,
        nameEn:
          body.nameEn !== undefined
            ? String(body.nameEn || "").trim() || null
            : current.nameEn,
        categoryId,
        unitId,
        specification:
          body.specification !== undefined
            ? String(body.specification || "").trim() || null
            : current.specification,
        manufacturer:
          body.manufacturer !== undefined
            ? String(body.manufacturer || "").trim() || null
            : current.manufacturer,
        countryOfOrigin:
          body.countryOfOrigin !== undefined
            ? String(body.countryOfOrigin || "").trim() || null
            : current.countryOfOrigin,
        batchNumber:
          body.batchNumber !== undefined
            ? String(body.batchNumber || "").trim() || null
            : current.batchNumber,
        costPrice,
        salePrice,
        vatRate,
        minimumStock,
        isActive:
          body.isActive !== undefined ? Boolean(body.isActive) : current.isActive,
      },
      include: includeRelations,
    });

    return NextResponse.json(item);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تعديل المادة" }, { status: 500 });
  }
}
