import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, revokeSession, sessionTokenFromRequest } from "@/lib/auth";

export async function POST(request: Request) {
  await prisma.$transaction((tx) => revokeSession(tx, sessionTokenFromRequest(request)));
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(SESSION_COOKIE, "", { httpOnly: true, expires: new Date(0), path: "/", sameSite: "lax" });
  return response;
}
