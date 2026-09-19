import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authErrorResponse, completeInitialSetup } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await prisma.$transaction((tx) => completeInitialSetup(tx, body));
    return NextResponse.json({ id: user.id, email: user.email, name: user.name }, { status: 201 });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}
