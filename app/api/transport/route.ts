import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { authorizeRequest } from "@/lib/api-auth";
import { runWithDataScope } from "@/lib/data-scope";
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
    const context = await authorizeRequest(request, { moduleKey: "TRANSPORT", action: "READ" });
    return await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, async () => {
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
    const [trips, trucks, drivers, truckDocuments, driverDocuments, parties, items] =
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
        prisma.party.findMany({
          where: { isCustomer: true, isActive: true },
          select: { id: true, unifiedNumber: true, nameAr: true, nameEn: true, telephone: true },
          orderBy: { nameAr: "asc" },
        }),
        prisma.item.findMany({
          where: { isActive: true },
          select: { id: true, code: true, nameAr: true, nameEn: true },
          orderBy: { nameAr: "asc" },
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
    const allDocuments = [
      ...trucks.flatMap((truck) => truck.documents.map((document) => ({ ...document, ownerType: "TRUCK", ownerId: truck.id, ownerName: truck.plateNumber }))),
      ...drivers.flatMap((driver) => driver.documents.map((document) => ({ ...document, ownerType: "DRIVER", ownerId: driver.id, ownerName: driver.name }))),
    ].sort((a, b) => {
      if (!a.expiryDate && !b.expiryDate) return b.createdAt.getTime() - a.createdAt.getTime();
      if (!a.expiryDate) return 1;
      if (!b.expiryDate) return -1;
      return a.expiryDate.getTime() - b.expiryDate.getTime();
    });
    return NextResponse.json({
      trips: normalizedTrips,
      trucks,
      drivers,
      parties,
      items,
      documents: allDocuments,
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
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل بيانات النقل" }, { status: 403 });
  }
}
