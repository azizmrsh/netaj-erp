import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { BudgetError, createBudget } from "@/lib/budgeting";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return NextResponse.json(await prisma.budget.findMany({ include: { fiscalYear: true, lines: { include: { account: true, fiscalPeriod: true, costCenter: true, department: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] }));
  } catch (error) { return response(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" });
    const body = await request.json();
    return NextResponse.json(await prisma.$transaction((tx) => createBudget(tx, body, auth.userId)), { status: 201 });
  } catch (error) { return response(error); }
}
function response(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof BudgetError) return NextResponse.json({ error: error.message }, { status: 400 });
  console.error(error); return NextResponse.json({ error: "تعذر معالجة الميزانية" }, { status: 500 });
}
