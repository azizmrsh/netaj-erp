import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { customFieldsForEntity, saveCustomFieldValues } from "@/lib/configuration";
import { audit } from "@/lib/audit";
import { customerFinancialExposure } from "@/lib/operational-controls";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await authorizeRequest(request, { moduleKey: "CORE", action: "READ" });
    const canRead = async (moduleKey: string) => authorizeRequest(request, { moduleKey, action: "READ" }).then(() => true).catch(() => false);
    const [inventoryAccess, notesAccess, transportAccess, salesAccess, purchasesAccess, accountingAccess, factoryAccess] = await Promise.all([
      canRead("INVENTORY"), canRead("NOTES"), canRead("TRANSPORT"), canRead("SALES"), canRead("PURCHASES"), canRead("ACCOUNTING"), canRead("FACTORY"),
    ]);
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
      customFields,
      financialExposure,
    ] =
      await Promise.all([
        inventoryAccess ? prisma.partyStockAccount.findMany({
          where: { partyId },
          include: { item: true },
          orderBy: { itemId: "asc" },
        }) : [],

        inventoryAccess ? prisma.stockMovement.findMany({
          where: { partyId },
          include: { item: true },
          orderBy: { movementDate: "desc" },
        }) : [],

        notesAccess ? prisma.deliveryReceiptNote.findMany({
          where: { partyId },
          include: { items: { include: { item: true } } },
          orderBy: { noteDate: "desc" },
        }) : [],

        transportAccess ? prisma.transportTrip.findMany({
          where: { partyId },
          orderBy: { tripDate: "desc" },
        }) : [],

        salesAccess ? prisma.sale.findMany({
          where: { partyId },
          include: { items: { include: { item: true } } },
          orderBy: [{ invoiceDate: "desc" }, { id: "desc" }],
        }) : [],

        purchasesAccess ? prisma.purchase.findMany({
          where: { partyId },
          include: { items: { include: { item: true } } },
          orderBy: [{ purchaseDate: "desc" }, { id: "desc" }],
        }) : [],

        prisma.businessDocument.findMany({
          where: { partyId, direction: { in: [...(salesAccess ? ["SALES"] : []), ...(purchasesAccess ? ["PURCHASE"] : [])] } },
          include: { lines: { include: { item: true } } },
          orderBy: [{ documentDate: "desc" }, { id: "desc" }],
        }),

        accountingAccess ? prisma.journalEntry.findMany({
          where: { lines: { some: { partyId } } },
          include: { lines: { where: { partyId } } },
          orderBy: [{ entryDate: "desc" }, { id: "desc" }],
        }) : [],

        prisma.attachment.findMany({
          where: { entityType: "PARTY", entityId: partyId },
          orderBy: { uploadedAt: "desc" },
        }),
        factoryAccess ? prisma.factoryTransaction.findMany({ where: { partyId }, include: { item: true }, orderBy: [{ transactionDate: "desc" }, { id: "desc" }] }) : [],
        factoryAccess ? prisma.factoryFeeRate.findMany({ where: { partyId, isActive: true }, include: { item: true }, orderBy: { itemId: "asc" } }) : [],
        prisma.$transaction((tx) => customFieldsForEntity(tx, "PARTY", partyId)),
        inventoryAccess && accountingAccess ? prisma.$transaction((tx) => customerFinancialExposure(tx, partyId)) : null,
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
      customFields,
      financialExposure,
    });
  } catch (error) {
    console.error(error);

    if (error instanceof AuthError) {
      const response = authErrorResponse(error);
      return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
    }

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
    await authorizeRequest(request, { moduleKey: "CORE", action: "UPDATE" });
    const { id } = await params;
    const partyId = Number(id);
    const body = await request.json();

    if (!Number.isInteger(partyId) || partyId <= 0) {
      return NextResponse.json(
        { error: "رقم العميل أو المورد غير صحيح" },
        { status: 400 }
      );
    }

    const party = await prisma.$transaction(async (tx) => {
      const updated = await tx.party.update({
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
        ...(typeof body.bankName === "string" ? { bankName: body.bankName.trim() || null } : {}),
        ...(typeof body.iban === "string" ? { iban: body.iban.replace(/\s/g, "").toUpperCase() || null } : {}),
      },
      include: {
        address: true,
      },
      });
      await saveCustomFieldValues(tx, "PARTY", partyId, body.customFields);
      await audit(tx, { action: "UPDATE", entityType: "PARTY", entityId: partyId, metadata: { fields: Object.keys(body).filter((key) => key !== "customFields") } });
      return updated;
    });

    return NextResponse.json(party);
  } catch (error) {
    console.error(error);

    if (error instanceof AuthError) {
      const response = authErrorResponse(error);
      return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
    }

    return NextResponse.json(
      { error: "تعذر تحديث العميل أو المورد" },
      { status: 500 }
    );
  }
}
