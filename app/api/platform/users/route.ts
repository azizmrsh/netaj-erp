import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { platformErrorResponse } from "@/lib/platform";
import { createTenantUser, listTenantUsers } from "@/lib/users";

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" });
    return NextResponse.json(await prisma.$transaction((tx) => listTenantUsers(tx, context.tenantId)));
  } catch (error) {
    const response = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" });
    const body = await request.json();
    const user = await prisma.$transaction((tx) => createTenantUser(tx, context.tenantId, body));
    return NextResponse.json(user, { status: 201 });
  } catch (error) {
    const response = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
