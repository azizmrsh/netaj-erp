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
      include: { address: true },
    });

    if (!party) {
      return NextResponse.json(
        { error: "العميل أو المورد غير موجود" },
        { status: 404 }
      );
    }

    const [
      stockAccounts,
      stockMovements,
      notesDocuments,
      transportTrips,
      sales,
      purchases,
      businessDocuments,
      journalEntries,
      attachments,
      factoryTransactions,
      factoryFeeRates,
    ] =
      await Promise.all([
        prisma.partyStockAccount.findMany({
          where: { partyId },
          include: { item: true },
          orderBy: { itemId: "asc" },
        }),

        prisma.stockMovement.findMany({
          where: { partyId },
          include: { item: true },
          orderBy: { movementDate: "desc" },
        }),

        prisma.deliveryReceiptNote.findMany({
          where: { partyId },
          include: { items: { include: { item: true } } },
          orderBy: { noteDate: "desc" },
        }),

        prisma.transportTrip.findMany({
          where: { partyId },
          orderBy: { tripDate: "desc" },
        }),

        prisma.sale.findMany({
          where: { partyId },
          include: { items: { include: { item: true } } },
          orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
        }),

        prisma.purchase.findMany({
          where: { partyId },
          include: { items: { include: { item: true } } },
          orderBy: [{ purchaseDate: "desc" }, { id: "desc" }],
        }),

        prisma.businessDocument.findMany({
          where: { partyId },
          include: { lines: { include: { item: true } } },
          orderBy: [{ documentDate: "desc" }, { id: "desc" }],
        }),

        prisma.journalEntry.findMany({
          where: { lines: { some: { partyId } } },
          include: { lines: { where: { partyId } } },
          orderBy: [{ entryDate: "desc" }, { id: "desc" }],
        }),

        prisma.attachment.findMany({
          where: { entityType: "PARTY", entityId: partyId },
          orderBy: { uploadedAt: "desc" },
        }),
        prisma.factoryTransaction.findMany({ where: { partyId }, include: { item: true }, orderBy: [{ transactionDate: "desc" }, { id: "desc" }] }),
        prisma.factoryFeeRate.findMany({ where: { partyId, isActive: true }, include: { item: true }, orderBy: { itemId: "asc" } }),
      ]);

    return NextResponse.json({
      ...party,
      stockAccounts,
      stockMovements,
      notesDocuments,
      transportTrips,
      sales,
      purchases,
      businessDocuments,
      journalEntries,
      attachments,
      factoryTransactions,
      factoryFeeRates,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "تعذر تحميل ملف العميل أو المورد" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const partyId = Number(id);
    const body = await request.json();

    if (!Number.isInteger(partyId) || partyId <= 0) {
      return NextResponse.json(
        { error: "رقم العميل أو المورد غير صحيح" },
        { status: 400 }
      );
    }

    const party = await prisma.party.update({
      where: { id: partyId },
      data: {
        ...(typeof body.isCustomer === "boolean"
          ? { isCustomer: body.isCustomer }
          : {}),
        ...(typeof body.isSupplier === "boolean"
          ? { isSupplier: body.isSupplier }
          : {}),
        ...(typeof body.isActive === "boolean"
          ? { isActive: body.isActive }
          : {}),
      },
      include: {
        address: true,
      },
    });

    return NextResponse.json(party);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "تعذر تحديث العميل أو المورد" },
      { status: 500 }
    );
  }
}
