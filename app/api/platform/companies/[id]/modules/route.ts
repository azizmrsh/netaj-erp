import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformErrorResponse, setCompanyModule } from "@/lib/platform";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const authContext = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" });
    const { id } = await context.params;
    const body = await request.json();
    const companyModule = await prisma.$transaction((tx) =>
      setCompanyModule(tx, authContext.tenantId, Number(id), String(body.moduleKey ?? ""), Boolean(body.enabled))
    );
    return NextResponse.json(companyModule);
  } catch (error) {
    console.error(error);
    const response = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
