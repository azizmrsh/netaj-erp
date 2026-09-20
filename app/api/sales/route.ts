import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CommerceValidationError,
  commerceTotals,
  optionalDate,
  optionalText,
  parseCommerceLines,
} from "@/lib/commerce";
import { evaluateApprovalRules } from "@/lib/configuration";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { runWithDataScope } from "@/lib/data-scope";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { AuthError } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "SALES", action: "READ" });
    const params = new URL(request.url).searchParams;
    const from = params.get("from"), to = params.get("to"), partyId = Number(params.get("partyId")), itemId=Number(params.get("itemId")), status = params.get("status"), q = params.get("q")?.trim();
    const sales = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.sale.findMany({
      where: { ...(partyId > 0 ? { partyId } : {}), ...(itemId>0?{items:{some:{itemId}}}:{}), ...(status ? { status } : {}), ...(from || to ? { invoiceDate: { ...(from ? { gte: new Date(`${from}T00:00:00.000`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999`) } : {}) } } : {}), ...(q ? { OR: [{ invoiceNumber: { contains: q } }, { referenceNumber: { contains: q } }, { party: { nameAr: { contains: q } } }, { party: { nameEn: { contains: q } } }] } : {}) },
      include: { party: true, items: { include: { item: true } } },
      orderBy: { invoiceDate: "desc" },
    }));
    return NextResponse.json(sales);
  } catch (error) {
    if (error instanceof AuthError) {
      const response = authErrorResponse(error);
      return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
    }
    console.error(error);
    return NextResponse.json({ error: "تعذر تحميل المبيعات" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "SALES", action: "CREATE" });
    const body = (await request.json()) as Record<string, unknown>;
    const invoiceDate = optionalDate(body.invoiceDate) ?? new Date();
    const partyId = Number(body.partyId);
    if (!Number.isInteger(partyId) || partyId <= 0) {
      throw new CommerceValidationError("العميل غير صحيح");
    }
    const lines = parseCommerceLines(body.items);
    const totals = commerceTotals(lines);
    const sale = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.$transaction(async (tx) => {
      const [party, validItems, approvalRules] = await Promise.all([
        tx.party.findUnique({ where: { id: partyId } }),
        tx.item.count({ where: { id: { in: lines.map((line) => line.itemId) }, isActive: true } }),
        tx.approvalRule.findMany({ where: { entityType: "SALE", isActive: true }, orderBy: { priority: "asc" } }),
      ]);
      if (!party?.isCustomer || !party.isActive) throw new CommerceValidationError("الكيان المحدد ليس عميلًا نشطًا للمبيعات");
      if (validItems !== new Set(lines.map((line) => line.itemId)).size) throw new CommerceValidationError("توجد مادة غير موجودة أو غير نشطة");
      const invoiceNumber = optionalText(body.invoiceNumber) ?? await nextDocumentNumber(tx, "INV", invoiceDate);
      const requiredApprovals = evaluateApprovalRules(approvalRules, { ...body, totalAmount: totals.totalAmount, subtotal: totals.subtotal });
      const created = await tx.sale.create({
      data: {
        invoiceNumber,
        invoiceDate,
        partyId,
        referenceNumber: optionalText(body.referenceNumber),
        purchaseOrderNumber: optionalText(body.purchaseOrderNumber),
        paymentMethod: optionalText(body.paymentMethod),
        currency: optionalText(body.currency)?.toUpperCase() ?? "SAR",
        transportMode: optionalText(body.transportMode)?.toUpperCase() ?? "NONE",
        includedTransportRevenue: Number(body.includedTransportRevenue ?? 0),
        dueDate: optionalDate(body.dueDate),
        ...totals,
        status: requiredApprovals.length ? "PENDING" : optionalText(body.status) ?? "DRAFT",
        notes: optionalText(body.notes),
        items: { create: lines },
      },
      include: { party: true, items: { include: { item: true } } },
      });
      await audit(tx, { action: "SALES_INVOICE_CREATE", entityType: "SALES_INVOICE", entityId: created.id, userId: String(context.userId), metadata: { invoiceNumber, direct: true } });
      return { ...created, requiredApprovals };
    }));
    return NextResponse.json(sale, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      const response = authErrorResponse(error);
      return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
    }
    console.error(error);
    if (error instanceof CommerceValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json({ error: "رقم الفاتورة مستخدم مسبقًا" }, { status: 409 });
    }
    return NextResponse.json({ error: "تعذر إنشاء فاتورة المبيعات" }, { status: 500 });
  }
}
