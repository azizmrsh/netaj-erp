import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createBusinessDocument, parseWorkflowInput, WorkflowError, workflowInclude } from "@/lib/workflows";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

function errorResponse(error: unknown) {
  console.error(error);
  if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
  if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 400 });
  return NextResponse.json({ error: "تعذر تنفيذ عملية المستند" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const direction = params.get("direction")?.toUpperCase();
    const allowedDirections: string[] = [];
    if (!direction || direction === "SALES") await authorizeRequest(request, { moduleKey: "SALES", action: "READ" }).then(() => allowedDirections.push("SALES")).catch(() => undefined);
    if (!direction || direction === "PURCHASE") await authorizeRequest(request, { moduleKey: "PURCHASES", action: "READ" }).then(() => allowedDirections.push("PURCHASE")).catch(() => undefined);
    if (allowedDirections.length === 0) throw new AuthError("لا توجد صلاحية لقراءة المستندات", "PERMISSION_DENIED", 403);
    const documentType = params.get("documentType")?.toUpperCase();
    const status = params.get("status")?.toUpperCase();
    const partyId = Number(params.get("partyId"));
    const itemId = Number(params.get("itemId"));
    const query = params.get("q")?.trim();
    const reference = params.get("reference")?.trim();
    const page = Math.max(Number(params.get("page")) || 1, 1);
    const pageSize = Math.min(Math.max(Number(params.get("pageSize")) || 50, 1), 100);
    const from = params.get("from");
    const to = params.get("to");
    const where: Prisma.BusinessDocumentWhereInput = {
      direction: { in: allowedDirections },
      ...(documentType ? { documentType } : {}), ...(status ? { status } : {}),
      ...(Number.isInteger(partyId) && partyId > 0 ? { partyId } : {}),
      ...(Number.isInteger(itemId) && itemId > 0 ? { lines: { some: { itemId } } } : {}),
      ...(reference ? { referenceNumber: { contains: reference } } : {}),
      ...(query ? { OR: [{ documentNumber: { contains: query } }, { referenceNumber: { contains: query } }, { party: { nameAr: { contains: query } } }] } : {}),
      ...(from || to ? { documentDate: { ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) } } : {}),
    };
    const [documents, total, parties, items, trucks, drivers, currencies] = await Promise.all([
      prisma.businessDocument.findMany({ where, include: workflowInclude, orderBy: [{ documentDate: "desc" }, { id: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      prisma.businessDocument.count({ where }),
      prisma.party.findMany({ where: { isActive: true }, select: { id: true, nameAr: true, isCustomer: true, isSupplier: true }, orderBy: { nameAr: "asc" } }),
      prisma.item.findMany({ where: { isActive: true }, include: { unit: true }, orderBy: { nameAr: "asc" } }),
      prisma.truck.findMany({ where: { status: "ACTIVE" }, orderBy: { plateNumber: "asc" } }),
      prisma.driver.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
      prisma.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    ]);
    return NextResponse.json({ documents, options: { parties, items, trucks, drivers, currencies }, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const input = parseWorkflowInput(await request.json());
    const isPurchase = input.documentType === "PURCHASE_REQUEST" || input.documentType === "PURCHASE_ORDER";
    await authorizeRequest(request, { moduleKey: isPurchase ? "PURCHASES" : "SALES", action: "CREATE" });
    const document = await prisma.$transaction((tx) => createBusinessDocument(tx, input));
    return NextResponse.json(document, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
