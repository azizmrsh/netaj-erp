import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authErrorResponse, resolveAuthContext, sessionTokenFromRequest } from "@/lib/auth";
import { beginMfaEnrollment, confirmMfaEnrollment, disableMfa, MfaError } from "@/lib/mfa";

export async function GET(request: Request) {
  try {
    const context = await prisma.$transaction((tx) => resolveAuthContext(tx, sessionTokenFromRequest(request)));
    const factors = await prisma.userMfaFactor.findMany({ where: { userId: context.userId }, select: { id: true, factorType: true, label: true, verifiedAt: true, lastUsedAt: true, createdAt: true } });
    return NextResponse.json({ enabled: factors.some((factor) => factor.verifiedAt), factors });
  } catch (error) {
    const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const context = await prisma.$transaction((tx) => resolveAuthContext(tx, sessionTokenFromRequest(request)));
    const result = await prisma.$transaction(async (tx) => {
      if (body.action === "ENROLL") {
        const user = await tx.platformUser.findUniqueOrThrow({ where: { id: context.userId } });
        return beginMfaEnrollment(tx, user.id, user.email);
      }
      if (body.action === "CONFIRM") return confirmMfaEnrollment(tx, context.userId, Number(body.factorId), String(body.code ?? ""));
      if (body.action === "DISABLE") return disableMfa(tx, context.userId, body.code);
      throw new MfaError("إجراء MFA غير مدعوم");
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MfaError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
