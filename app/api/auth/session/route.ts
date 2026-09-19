import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authErrorResponse, resolveAuthContext, sessionTokenFromRequest } from "@/lib/auth";

export async function GET(request: Request) {
  try {
    const context = await prisma.$transaction((tx) => resolveAuthContext(tx, sessionTokenFromRequest(request)));
    return NextResponse.json({
      userId: context.userId,
      userName: context.userName,
      tenantId: context.tenantId,
      companyId: context.companyId,
      companyCode: context.companyCode,
      availableCompanies: context.availableCompanies,
      permissions: [...context.permissions],
      modules: [...context.companyModules.entries()].filter(([, enabled]) => enabled).map(([key]) => key),
    });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
