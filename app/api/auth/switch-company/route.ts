import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authErrorResponse, sessionTokenFromRequest, switchSessionCompany } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const company = await prisma.$transaction((tx) =>
      switchSessionCompany(tx, sessionTokenFromRequest(request), Number(body.companyId))
    );
    return NextResponse.json({ companyId: company.id, companyCode: company.code });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
