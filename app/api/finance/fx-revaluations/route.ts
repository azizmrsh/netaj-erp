import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { FxRevaluationError, createFxRevaluation, previewFxRevaluation } from "@/lib/fx-revaluation";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const params = new URL(request.url).searchParams;
    if (params.get("preview") === "1") return NextResponse.json(await prisma.$transaction((tx) => previewFxRevaluation(tx, Object.fromEntries(params))));
    return NextResponse.json(await prisma.fxRevaluation.findMany({ include: { lines: true, journalEntry: true, reversalJournal: true }, orderBy: [{ revaluationDate: "desc" }, { id: "desc" }], take: 100 }));
  } catch (error) { return response(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" });
    const body = await request.json();
    return NextResponse.json(await prisma.$transaction((tx) => createFxRevaluation(tx, body, auth.userId)), { status: 201 });
  } catch (error) { return response(error); }
}

function response(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof FxRevaluationError || error instanceof Error && error.name === "CurrencyError") return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(error); return NextResponse.json({ error: "تعذر معالجة إعادة تقييم العملة" }, { status: 500 });
}
