import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCompany, getTenantWorkspace, platformErrorResponse } from "@/lib/platform";

const LEGACY_TENANT_ID = 1;

export async function GET() {
  try {
    const workspace = await prisma.$transaction((tx) => getTenantWorkspace(tx, LEGACY_TENANT_ID));
    return NextResponse.json(workspace);
  } catch (error) {
    console.error(error);
    const response = platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const company = await prisma.$transaction((tx) => createCompany(tx, LEGACY_TENANT_ID, body));
    return NextResponse.json(company, { status: 201 });
  } catch (error) {
    console.error(error);
    const response = platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
