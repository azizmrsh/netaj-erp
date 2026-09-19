import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { platformErrorResponse, setCompanyModule } from "@/lib/platform";

const LEGACY_TENANT_ID = 1;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const companyModule = await prisma.$transaction((tx) =>
      setCompanyModule(tx, LEGACY_TENANT_ID, Number(id), String(body.moduleKey ?? ""), Boolean(body.enabled))
    );
    return NextResponse.json(companyModule);
  } catch (error) {
    console.error(error);
    const response = platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
