import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { upsertCompanyConfiguration } from "@/lib/configuration";

const clean = (value: unknown) => String(value ?? "").trim();

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const rows = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.companyConfiguration.findMany({
      where: { category: "PAYMENT_METHODS", isActive: true }, orderBy: [{ configKey: "asc" }],
    }));
    return NextResponse.json(rows.map((row) => { let value: Record<string, unknown> = {}; try { const parsed = JSON.parse(row.valueJson); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) value = parsed as Record<string, unknown>; } catch { /* ignore malformed legacy configuration */ } return { id: row.id, code: row.configKey, nameAr: row.labelAr ?? row.configKey, nameEn: row.labelEn ?? row.configKey, ...value }; }));
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    return NextResponse.json({ error: "تعذر تحميل طرق الدفع" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" });
    const body = await request.json() as Record<string, unknown>;
    const code = clean(body.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
    if (!code || !clean(body.nameAr)) return NextResponse.json({ error: "رمز وطريقة الدفع مطلوبان" }, { status: 400 });
    const row = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.$transaction((tx) => upsertCompanyConfiguration(tx, {
      tenantId: auth.tenantId, companyId: auth.companyId, category: "PAYMENT_METHODS", configKey: code,
      labelAr: clean(body.nameAr), labelEn: clean(body.nameEn) || code, valueType: "JSON",
      value: { type: clean(body.type).toUpperCase() || "OTHER", accountId: body.accountId ? Number(body.accountId) : null, displayOrder: Number(body.displayOrder ?? 0) || 0 },
      isActive: body.isActive !== false,
    }, String(auth.userId))));
    return NextResponse.json(row, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    return NextResponse.json({ error: "تعذر حفظ طريقة الدفع" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" });
    const code = clean(new URL(request.url).searchParams.get("code")).toUpperCase();
    if (!code) return NextResponse.json({ error: "رمز طريقة الدفع مطلوب" }, { status: 400 });
    const result = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => prisma.companyConfiguration.updateMany({ where: { category: "PAYMENT_METHODS", configKey: code }, data: { isActive: false } }));
    if (!result.count) return NextResponse.json({ error: "طريقة الدفع غير موجودة" }, { status: 404 });
    return NextResponse.json({ disabled: true });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    return NextResponse.json({ error: "تعذر تعطيل طريقة الدفع" }, { status: 500 });
  }
}
