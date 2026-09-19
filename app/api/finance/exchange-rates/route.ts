import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { CurrencyError, saveExchangeRate } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return NextResponse.json(await prisma.exchangeRate.findMany({ orderBy: [{ rateDate: "desc" }, { id: "desc" }], take: 500 }));
  } catch (error) { return response(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" });
    const body = await request.json();
    return NextResponse.json(await prisma.$transaction((tx) => saveExchangeRate(tx, body, auth.userId)), { status: 201 });
  } catch (error) { return response(error); }
}

function response(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof CurrencyError) return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
  console.error(error); return NextResponse.json({ error: "تعذر معالجة سعر الصرف" }, { status: 500 });
}
