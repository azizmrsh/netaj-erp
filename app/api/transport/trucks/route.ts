import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET() {
  const trucks = await prisma.truck.findMany({
    include: { documents: { orderBy: { expiryDate: "asc" } } },
    orderBy: { plateNumber: "asc" },
  });
  return NextResponse.json(trucks);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const plateNumber = String(body.plateNumber ?? "").trim();
    if (!plateNumber) {
      return NextResponse.json({ error: "رقم اللوحة مطلوب" }, { status: 400 });
    }
    const truck = await prisma.truck.create({
      data: {
        plateNumber,
        truckType: String(body.truckType ?? "").trim() || null,
        model: String(body.model ?? "").trim() || null,
        modelYear: numberOrNull(body.modelYear),
        trailerType: String(body.trailerType ?? "").trim() || null,
        capacity: numberOrNull(body.capacity),
        fuelType: String(body.fuelType ?? "").trim() || null,
        fuelConsumption: numberOrNull(body.fuelConsumption),
        fuelPrice: numberOrNull(body.fuelPrice),
        maintenancePerKm: numberOrNull(body.maintenancePerKm),
        notes: String(body.notes ?? "").trim() || null,
      },
      include: { documents: true },
    });
    return NextResponse.json(truck, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر إضافة الشاحنة؛ تحقق من عدم تكرار اللوحة" }, { status: 400 });
  }
}
