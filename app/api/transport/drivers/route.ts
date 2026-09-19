import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET() {
  const drivers = await prisma.driver.findMany({
    include: { documents: { orderBy: { expiryDate: "asc" } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(drivers);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "اسم السائق مطلوب" }, { status: 400 });
    }
    const driver = await prisma.driver.create({
      data: {
        name,
        idNumber: String(body.idNumber ?? "").trim() || null,
        phone: String(body.phone ?? "").trim() || null,
        nationality: String(body.nationality ?? "").trim() || null,
        licenseNumber: String(body.licenseNumber ?? "").trim() || null,
        licenseExpiry: dateOrNull(body.licenseExpiry),
        passportNumber: String(body.passportNumber ?? "").trim() || null,
        passportExpiry: dateOrNull(body.passportExpiry),
        driverCardNumber: String(body.driverCardNumber ?? "").trim() || null,
        driverCardExpiry: dateOrNull(body.driverCardExpiry),
        notes: String(body.notes ?? "").trim() || null,
      },
      include: { documents: true },
    });
    return NextResponse.json(driver, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر إضافة السائق؛ تحقق من رقم الهوية" }, { status: 400 });
  }
}
