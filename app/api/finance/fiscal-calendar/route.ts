import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { authErrorResponse, authorizeRequest } from "@/lib/api-auth";
import { currentFiscalCalendar } from "@/lib/fiscal-close";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return NextResponse.json(await prisma.$transaction((tx) => currentFiscalCalendar(tx)));
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    console.error(error); return NextResponse.json({ error: "تعذر تحميل التقويم المالي" }, { status: 500 });
  }
}
