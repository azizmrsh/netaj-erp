import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCompany, getTenantWorkspace, platformErrorResponse } from "@/lib/platform";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "CORE", action: "READ" });
    const workspace = await prisma.$transaction((tx) => getTenantWorkspace(tx, context.tenantId, context.membershipId));
    return NextResponse.json(workspace);
  } catch (error) {
    console.error(error);
    const response = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" });
    const body = await request.json();
    const company = await prisma.$transaction(async (tx) => {
      const created = await createCompany(tx, context.tenantId, body);
      await tx.companyAccess.create({ data: { membershipId: context.membershipId, companyId: created.id } });
      const role = await tx.role.create({
        data: {
          tenantId: context.tenantId,
          companyId: created.id,
          code: "ADMIN",
          name: "مدير الشركة",
          isSystem: true,
          permissions: { create: [...context.permissions].map((permissionKey) => ({ permissionKey })) },
          memberships: { create: { membershipId: context.membershipId } },
        },
      });
      return { ...created, administratorRoleId: role.id };
    });
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error(error);
    const response = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
