import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";

function numberOrNull(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function dateOrNull(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "TRANSPORT", action: "READ" });
    const trucks = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.truck.findMany({
      include: { documents: { orderBy: { expiryDate: "asc" } }, assignedDriver: { select: { id: true, name: true } } },
      orderBy: { plateNumber: "asc" },
    }));
    return NextResponse.json(trucks);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الشاحنات" }, { status: 403 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "TRANSPORT", action: "CREATE" });
    const body = (await request.json()) as Record<string, unknown>;
    const plateNumber = String(body.plateNumber ?? "").trim();
    if (!plateNumber) {
      return NextResponse.json({ error: "رقم اللوحة مطلوب" }, { status: 400 });
    }
    const assignedDriverId = numberOrNull(body.assignedDriverId);
    const truck = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.truck.create({
      data: {
        plateNumber,
        fleetCode: String(body.fleetCode ?? "").trim() || null,
        truckType: String(body.truckType ?? "").trim() || null,
        make: String(body.make ?? "").trim() || null,
        model: String(body.model ?? "").trim() || null,
        modelYear: numberOrNull(body.modelYear),
        vin: String(body.vin ?? "").trim() || null,
        serialNumber: String(body.serialNumber ?? "").trim() || null,
        color: String(body.color ?? "").trim() || null,
        ownershipType: String(body.ownershipType ?? "").trim() || null,
        branchName: String(body.branchName ?? "").trim() || null,
        assignedDriverId,
        currentOdometer: numberOrNull(body.currentOdometer) ?? 0,
        acquisitionDate: dateOrNull(body.acquisitionDate),
        acquisitionCost: numberOrNull(body.acquisitionCost),
        trailerType: String(body.trailerType ?? "").trim() || null,
        capacity: numberOrNull(body.capacity),
        fuelTankCapacity: numberOrNull(body.fuelTankCapacity),
        fuelType: String(body.fuelType ?? "").trim() || null,
        fuelConsumption: numberOrNull(body.fuelConsumption),
        fuelPrice: numberOrNull(body.fuelPrice),
        maintenancePerKm: numberOrNull(body.maintenancePerKm),
        notes: String(body.notes ?? "").trim() || null,
      },
      include: { documents: true, assignedDriver: { select: { id: true, name: true } } },
    }));
    return NextResponse.json(truck, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر إضافة الشاحنة؛ تحقق من عدم تكرار اللوحة" }, { status: 400 });
  }
}
