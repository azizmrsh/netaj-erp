import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";

function dateOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "TRANSPORT", action: "CREATE" });
    const body = (await request.json()) as Record<string, unknown>;
    const ownerType = String(body.ownerType ?? "").toUpperCase();
    const ownerId = Number(body.ownerId);
    const documentType = String(body.documentType ?? "").trim();
    const previousDocumentId = Number(body.previousDocumentId) || null;
    if (!Number.isInteger(ownerId) || ownerId <= 0 || !documentType) {
      return NextResponse.json({ error: "المالك ونوع الوثيقة مطلوبان" }, { status: 400 });
    }
    const common = {
      documentType,
      documentNumber: String(body.documentNumber ?? "").trim() || null,
      issueDate: dateOrNull(body.issueDate),
      expiryDate: dateOrNull(body.expiryDate),
      attachmentUrl: String(body.attachmentUrl ?? "").trim() || null,
      issuer: String(body.issuer ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
      previousDocumentId,
      renewedAt: previousDocumentId ? new Date() : null,
      renewedBy: previousDocumentId ? String(context.userId) : null,
    };
    if (ownerType === "TRUCK") {
      const document = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.$transaction(async tx => {
        const owner = await tx.truck.findFirst({ where: { id: ownerId } });
        if (!owner) throw new Error("الشاحنة غير موجودة ضمن الشركة الحالية");
        if (previousDocumentId) {
          const previous = await tx.truckDocument.findFirst({ where: { id: previousDocumentId, truckId: ownerId } });
          if (!previous) throw new Error("الوثيقة السابقة غير موجودة");
          await tx.truckDocument.update({ where: { id: previous.id }, data: { status: "RENEWED", renewedAt: new Date(), renewedBy: String(context.userId) } });
        }
        const row = await tx.truckDocument.create({ data: { truckId: ownerId, ...common } });
        await audit(tx,{action:previousDocumentId?"TRUCK_DOCUMENT_RENEW":"TRUCK_DOCUMENT_CREATE",entityType:"TRUCK_DOCUMENT",entityId:row.id,userId:String(context.userId),metadata:{ownerId,previousDocumentId}});
        return row;
      }));
      return NextResponse.json(document, { status: 201 });
    }
    if (ownerType === "DRIVER") {
      const document = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.$transaction(async tx => {
        const owner = await tx.driver.findFirst({ where: { id: ownerId } });
        if (!owner) throw new Error("السائق غير موجود ضمن الشركة الحالية");
        if (previousDocumentId) {
          const previous = await tx.driverDocument.findFirst({ where: { id: previousDocumentId, driverId: ownerId } });
          if (!previous) throw new Error("الوثيقة السابقة غير موجودة");
          await tx.driverDocument.update({ where: { id: previous.id }, data: { status: "RENEWED", renewedAt: new Date(), renewedBy: String(context.userId) } });
        }
        const row = await tx.driverDocument.create({ data: { driverId: ownerId, ...common } });
        await audit(tx,{action:previousDocumentId?"DRIVER_DOCUMENT_RENEW":"DRIVER_DOCUMENT_CREATE",entityType:"DRIVER_DOCUMENT",entityId:row.id,userId:String(context.userId),metadata:{ownerId,previousDocumentId}});
        return row;
      }));
      return NextResponse.json(document, { status: 201 });
    }
    return NextResponse.json({ error: "نوع مالك الوثيقة غير صحيح" }, { status: 400 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر حفظ الوثيقة" }, { status: 400 });
  }
}
