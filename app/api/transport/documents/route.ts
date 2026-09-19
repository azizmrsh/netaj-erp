import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const ownerType = String(body.ownerType ?? "").toUpperCase();
    const ownerId = Number(body.ownerId);
    const documentType = String(body.documentType ?? "").trim();
    if (!Number.isInteger(ownerId) || ownerId <= 0 || !documentType) {
      return NextResponse.json({ error: "المالك ونوع الوثيقة مطلوبان" }, { status: 400 });
    }
    const common = {
      documentType,
      documentNumber: String(body.documentNumber ?? "").trim() || null,
      issueDate: dateOrNull(body.issueDate),
      expiryDate: dateOrNull(body.expiryDate),
      attachmentUrl: String(body.attachmentUrl ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
    };
    if (ownerType === "TRUCK") {
      const document = await prisma.truckDocument.create({ data: { truckId: ownerId, ...common } });
      return NextResponse.json(document, { status: 201 });
    }
    if (ownerType === "DRIVER") {
      const document = await prisma.driverDocument.create({ data: { driverId: ownerId, ...common } });
      return NextResponse.json(document, { status: 201 });
    }
    return NextResponse.json({ error: "نوع مالك الوثيقة غير صحيح" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر حفظ الوثيقة" }, { status: 400 });
  }
}
