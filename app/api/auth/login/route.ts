import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, authErrorResponse, authenticateCredentials } from "@/lib/auth";
import { assertRateLimit, clearRateLimit, RateLimitError } from "@/lib/rate-limit";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const rateKey = `login:${forwarded ?? "unknown"}:${String(body.email ?? "").trim().toLowerCase()}`;
    assertRateLimit(rateKey);
    const result = await prisma.$transaction((tx) =>
      authenticateCredentials(tx, {
        ...body,
        userAgent: request.headers.get("user-agent"),
        ipAddress: forwarded,
      })
    );
    clearRateLimit(rateKey);
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
    if (error instanceof RateLimitError) return NextResponse.json({ error: error.message, code: "RATE_LIMITED" }, { status: 429, headers: { "retry-after": String(error.retryAfterSeconds) } });
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
