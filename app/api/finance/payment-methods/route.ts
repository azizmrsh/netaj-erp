import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { availablePaymentMethods, listPaymentMethods, paymentMethodsWorkspace, PaymentMethodError, savePaymentMethod, setPaymentMethodActive, type PaymentUse } from "@/lib/payment-methods";

function fail(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر معالجة طرق الدفع" }, { status: error instanceof PaymentMethodError ? error.status : 400 });
}

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" }), params = new URL(request.url).searchParams;
    const use = params.get("use");
    if (use && !["SALES", "PURCHASES", "RECEIPT", "PAYMENT"].includes(use)) throw new PaymentMethodError("نوع المستند غير صحيح");
    const result = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(async tx => {
      if (use) return await availablePaymentMethods(tx, { use: use as PaymentUse, userId: auth.userId, branchId: Number(params.get("branchId")) || null, bankAccountId: Number(params.get("bankAccountId")) || null, currency: params.get("currency") });
      if (params.get("workspace") === "1") return await paymentMethodsWorkspace(tx);
      return await listPaymentMethods(tx, params.get("includeInactive") === "1");
    }));
    return NextResponse.json(result);
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" }), body = await request.json();
    const row = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => savePaymentMethod(tx, body, String(auth.userId))));
    return NextResponse.json(row, { status: body.id ? 200 : 201 });
  } catch (error) { return fail(error); }
}

export async function PATCH(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" }), body = await request.json();
    if (typeof body.isActive !== "boolean") throw new PaymentMethodError("حالة التفعيل غير صحيحة");
    return NextResponse.json(await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => setPaymentMethodActive(tx, String(body.code || "").trim().toUpperCase(), body.isActive, String(auth.userId)))));
  } catch (error) { return fail(error); }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" }), code = (new URL(request.url).searchParams.get("code") || "").trim().toUpperCase();
    await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction(tx => setPaymentMethodActive(tx, code, false, String(auth.userId))));
    return NextResponse.json({ disabled: true });
  } catch (error) { return fail(error); }
}
