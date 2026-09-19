import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { ConfigurationError, customFieldsForEntity, saveCustomFieldValues } from "@/lib/configuration";
import { prisma } from "@/lib/prisma";

const modules: Record<string, string> = { PARTY: "CORE", ITEM: "CORE", SALE: "SALES", PURCHASE: "PURCHASES", PROJECT: "PROJECTS", EMPLOYEE: "HR", TRANSPORT_TRIP: "TRANSPORT", DELIVERY_RECEIPT_NOTE: "NOTES" };
async function exists(entityType: string, entityId: number) {
  if (entityType === "PARTY") return prisma.party.count({ where: { id: entityId } }); if (entityType === "ITEM") return prisma.item.count({ where: { id: entityId } });
  if (entityType === "SALE") return prisma.sale.count({ where: { id: entityId } }); if (entityType === "PURCHASE") return prisma.purchase.count({ where: { id: entityId } });
  if (entityType === "PROJECT") return prisma.project.count({ where: { id: entityId } }); if (entityType === "EMPLOYEE") return prisma.employee.count({ where: { id: entityId } });
  if (entityType === "TRANSPORT_TRIP") return prisma.transportTrip.count({ where: { id: entityId } }); if (entityType === "DELIVERY_RECEIPT_NOTE") return prisma.deliveryReceiptNote.count({ where: { id: entityId } }); return 0;
}
function failure(error: unknown) { if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); } if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message }, { status: error.status }); console.error(error); return NextResponse.json({ error: "تعذر معالجة الحقول المخصصة" }, { status: 500 }); }

export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams, entityType = String(params.get("entityType") ?? "").toUpperCase(), entityId = Number(params.get("entityId")); if (!modules[entityType]) throw new ConfigurationError("نوع الكيان غير مدعوم"); await authorizeRequest(request, { moduleKey: modules[entityType], action: "READ" }); return NextResponse.json(await prisma.$transaction((tx) => customFieldsForEntity(tx, entityType, Number.isInteger(entityId) && entityId > 0 ? entityId : undefined))); }
  catch (error) { return failure(error); }
}

export async function PUT(request: Request) {
  try { const body = await request.json() as { entityType?: unknown; entityId?: unknown; values?: unknown }, entityType = String(body.entityType ?? "").toUpperCase(), entityId = Number(body.entityId); if (!modules[entityType] || !Number.isInteger(entityId) || entityId <= 0) throw new ConfigurationError("مرجع الكيان غير صحيح"); await authorizeRequest(request, { moduleKey: modules[entityType], action: "UPDATE" }); if (!(await exists(entityType, entityId))) return NextResponse.json({ error: "السجل غير موجود" }, { status: 404 }); await prisma.$transaction((tx) => saveCustomFieldValues(tx, entityType, entityId, body.values)); return NextResponse.json(await prisma.$transaction((tx) => customFieldsForEntity(tx, entityType, entityId))); }
  catch (error) { return failure(error); }
}

