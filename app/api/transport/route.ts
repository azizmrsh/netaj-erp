import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const tripInclude = {
  note: { select: { id: true, noteNumber: true, noteType: true } },
  party: { select: { id: true, nameAr: true } },
  item: { select: { id: true, code: true, nameAr: true } },
  truck: true,
  driver: true,
  expenses: { orderBy: { expenseDate: "desc" as const } },
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status")?.toUpperCase();
    const truckId = Number(searchParams.get("truckId"));
    const driverId = Number(searchParams.get("driverId"));
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const where: Prisma.TransportTripWhereInput = {
      ...(status ? { status } : {}),
      ...(Number.isInteger(truckId) && truckId > 0 ? { truckId } : {}),
      ...(Number.isInteger(driverId) && driverId > 0 ? { driverId } : {}),
      ...(from || to
        ? {
            tripDate: {
              ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}),
              ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}),
            },
          }
        : {}),
    };
    const alertLimit = new Date();
    alertLimit.setDate(alertLimit.getDate() + 60);
    const [trips, trucks, drivers, truckDocuments, driverDocuments] =
      await Promise.all([
        prisma.transportTrip.findMany({
          where,
          include: tripInclude,
          orderBy: [{ tripDate: "desc" }, { id: "desc" }],
        }),
        prisma.truck.findMany({
          include: { documents: { orderBy: { expiryDate: "asc" } } },
          orderBy: { plateNumber: "asc" },
        }),
        prisma.driver.findMany({
          include: { documents: { orderBy: { expiryDate: "asc" } } },
          orderBy: { name: "asc" },
        }),
        prisma.truckDocument.findMany({
          where: { expiryDate: { lte: alertLimit } },
          include: { truck: { select: { id: true, plateNumber: true } } },
          orderBy: { expiryDate: "asc" },
        }),
        prisma.driverDocument.findMany({
          where: { expiryDate: { lte: alertLimit } },
          include: { driver: { select: { id: true, name: true } } },
          orderBy: { expiryDate: "asc" },
        }),
      ]);

    const normalizedTrips = trips.map((trip) => {
      const weight = Number(trip.weight ?? trip.quantity);
      const km = Number(trip.actualKm ?? trip.estimatedKm ?? 0);
      const netProfit = Number(trip.netProfit);
      const revenue = Number(trip.transportRevenue);
      return {
        ...trip,
        profitPerTon: weight > 0 ? netProfit / weight : null,
        profitPerKm: km > 0 ? netProfit / km : null,
        profitMargin: revenue > 0 ? (netProfit / revenue) * 100 : null,
      };
    });
    const directDriverAlerts = drivers.flatMap((driver) =>
      [
        ["رخصة القيادة", driver.licenseExpiry],
        ["الجواز", driver.passportExpiry],
        ["بطاقة السائق", driver.driverCardExpiry],
      ]
        .filter((entry): entry is [string, Date] =>
          entry[1] instanceof Date && entry[1] <= alertLimit
        )
        .map(([documentType, expiryDate], index) => ({
          id: -(driver.id * 10 + index + 1),
          documentType,
          expiryDate,
          driver: { id: driver.id, name: driver.name },
        }))
    );
    return NextResponse.json({
      trips: normalizedTrips,
      trucks,
      drivers,
      alerts: { truckDocuments, driverDocuments: [...driverDocuments, ...directDriverAlerts] },
      summary: {
        trips: trips.length,
        openTrips: trips.filter((trip) => trip.status === "OPEN").length,
        completedTrips: trips.filter((trip) => trip.status === "COMPLETED").length,
        revenue: trips.reduce((sum, trip) => sum + Number(trip.transportRevenue), 0),
        cost: trips.reduce((sum, trip) => sum + Number(trip.totalCost), 0),
        profit: trips.reduce((sum, trip) => sum + Number(trip.netProfit), 0),
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "تعذر تحميل بيانات النقل" }, { status: 500 });
  }
}
