import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const partyId = Number(id);

    if (!Number.isInteger(partyId) || partyId <= 0) {
      return NextResponse.json(
        { error: "رقم العميل أو المورد غير صحيح" },
        { status: 400 }
      );
    }

    const party = await prisma.party.findUnique({
      where: { id: partyId },
      include: {
        address: true,
      },
    });

    if (!party) {
      return NextResponse.json(
        { error: "العميل أو المورد غير موجود" },
        { status: 404 }
      );
    }

    return NextResponse.json(party);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "تعذر تحميل ملف العميل أو المورد" },
      { status: 500 }
    );
  }
}
