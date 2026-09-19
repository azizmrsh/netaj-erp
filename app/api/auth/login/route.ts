import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, authErrorResponse, authenticateCredentials } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const result = await prisma.$transaction((tx) =>
      authenticateCredentials(tx, {
        ...body,
        userAgent: request.headers.get("user-agent"),
        ipAddress: forwarded,
      })
    );
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(SESSION_COOKIE, result.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
      priority: "high",
    });
    return response;
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
