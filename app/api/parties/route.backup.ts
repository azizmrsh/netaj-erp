import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const parties = await prisma.party.findMany({
      include: {
        address: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return NextResponse.json(parties);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "تعذر تحميل العملاء والموردين" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    if (!body.nameAr?.trim()) {
      return NextResponse.json(
        { error: "اسم المنشأة مطلوب" },
        { status: 400 }
      );
    }

    if (!body.isCustomer && !body.isSupplier) {
      return NextResponse.json(
        { error: "يجب تحديد عميل أو مورد أو كليهما" },
        { status: 400 }
      );
    }

    const party = await prisma.party.create({
      data: {
        nameAr: body.nameAr.trim(),
        nameEn: body.nameEn?.trim() || null,
        unifiedNumber: body.unifiedNumber?.trim() || null,
        vatNumber: body.vatNumber?.trim() || null,
        telephone: body.telephone?.trim() || null,
        email: body.email?.trim() || null,

        isCustomer: Boolean(body.isCustomer),
        isSupplier: Boolean(body.isSupplier),
        isActive: true,

        notes: body.notes?.trim() || null,
      },
      include: {
        address: true,
      },
    });

    return NextResponse.json(party, { status: 201 });
  } catch (error: any) {
    console.error(error);

    if (error?.code === "P2002") {
      return NextResponse.json(
        { error: "الرقم الموحد مسجل مسبقًا" },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "تعذر حفظ العميل أو المورد" },
      { status: 500 }
    );
  }
}
