import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function amount(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const id = Number((await params).id);
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "رقم الرحلة غير صحيح" }, { status: 400 });
    }
    const current = await prisma.transportTrip.findUnique({
      where: { id },
      include: { expenses: true },
    });
    if (!current) {
      return NextResponse.json({ error: "الرحلة غير موجودة" }, { status: 404 });
    }
    const body = (await request.json()) as Record<string, unknown>;
    const fuelLiters = amount(body.fuelLiters ?? current.fuelLiters);
    const fuelPricePerLiter = amount(
      body.fuelPricePerLiter ?? current.fuelPricePerLiter
    );
    const fuelCost = fuelLiters * fuelPricePerLiter;
    const driverTripFee = amount(body.driverTripFee ?? current.driverTripFee);
    const driverPaidAmount = amount(
      body.driverPaidAmount ?? current.driverPaidAmount
    );
    const maintenanceCost = amount(
      body.maintenanceCost ?? current.maintenanceCost
    );
    const administrativeCost = amount(
      body.administrativeCost ?? current.administrativeCost
    );
    const roadPermitCost = amount(body.roadPermitCost ?? current.roadPermitCost);
    const otherCost = amount(body.otherCost ?? current.otherCost);
    const additionalExpenses = current.expenses.reduce(
      (sum, expense) => sum + Number(expense.amount),
      0
    );
    const totalCost =
      fuelCost +
      driverTripFee +
      maintenanceCost +
      administrativeCost +
      roadPermitCost +
      otherCost +
      additionalExpenses;
    const transportRevenue = amount(
      body.transportRevenue ?? current.transportRevenue
    );
    const status = String(body.status ?? current.status).toUpperCase();
    if (!["OPEN", "IN_PROGRESS", "COMPLETED", "CANCELLED"].includes(status)) {
      return NextResponse.json({ error: "حالة الرحلة غير صحيحة" }, { status: 400 });
    }
    const truckId = body.truckId ? Number(body.truckId) : current.truckId;
    const driverId = body.driverId ? Number(body.driverId) : current.driverId;
    const trip = await prisma.transportTrip.update({
      where: { id },
      data: {
        truckId,
        driverId,
        estimatedKm: amount(body.estimatedKm ?? current.estimatedKm),
        actualKm: amount(body.actualKm ?? current.actualKm),
        transportRevenue,
        transportPricePerTon:
          body.transportPricePerTon === ""
            ? null
            : amount(body.transportPricePerTon ?? current.transportPricePerTon),
        fuelLiters,
        fuelPricePerLiter,
        fuelCost,
        driverTripFee,
        driverPaidAmount,
        driverPaymentStatus:
          driverPaidAmount >= driverTripFee && driverTripFee > 0 ? "PAID" : "DUE",
        maintenanceCost,
        administrativeCost,
        roadPermitCost,
        otherCost,
        totalCost,
        netProfit: transportRevenue - totalCost,
        status,
        notes: String(body.notes ?? current.notes ?? "").trim() || null,
      },
      include: { truck: true, driver: true, party: true, item: true, note: true },
    });
    return NextResponse.json(trip);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تحديث الرحلة" }, { status: 400 });
  }
}
