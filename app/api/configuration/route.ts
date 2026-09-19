import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { applyIndustryTemplate, ConfigurationError, listConfiguration, upsertApprovalRule, upsertCompanyConfiguration, upsertCustomField } from "@/lib/configuration";
import { prisma } from "@/lib/prisma";

function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof ConfigurationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error); return NextResponse.json({ error: "تعذر حفظ إعدادات الشركة" }, { status: 500 });
}

export async function GET(request: Request) {
  try { await authorizeRequest(request, { moduleKey: "CONFIG", action: "READ" }); return NextResponse.json(await prisma.$transaction((tx) => listConfiguration(tx, new URL(request.url).searchParams.get("entityType")))); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CONFIG", action: "MANAGE" }), body = await request.json() as Record<string, unknown>, action = String(body.action ?? "").toUpperCase();
    const scoped = { ...body, tenantId: auth.tenantId, companyId: auth.companyId };
    const result = await prisma.$transaction(async (tx) => {
      if (action === "CUSTOM_FIELD") return upsertCustomField(tx, scoped, String(auth.userId));
      if (action === "CONFIGURATION") return upsertCompanyConfiguration(tx, scoped, String(auth.userId));
      if (action === "APPROVAL_RULE") return upsertApprovalRule(tx, scoped, String(auth.userId));
      if (action === "APPLY_INDUSTRY_TEMPLATE") return applyIndustryTemplate(tx, auth.companyId, String(body.templateCode ?? "").toUpperCase(), String(auth.userId));
      throw new ConfigurationError("الإجراء غير مدعوم");
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "CONFIG", action: "MANAGE" });
    const params = new URL(request.url).searchParams, type = params.get("type"), id = Number(params.get("id"));
    if (!Number.isInteger(id) || id <= 0) throw new ConfigurationError("المعرف غير صحيح");
    const result = type === "field" ? await prisma.customFieldDefinition.updateMany({ where: { id }, data: { isActive: false } }) : type === "rule" ? await prisma.approvalRule.updateMany({ where: { id }, data: { isActive: false } }) : await prisma.companyConfiguration.updateMany({ where: { id }, data: { isActive: false } });
    if (!result.count) throw new ConfigurationError("السجل غير موجود", "NOT_FOUND", 404);
    return NextResponse.json({ disabled: true });
  } catch (error) { return failure(error); }
}

