import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndPostExpense, financeErrorResponse } from "@/lib/finance";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function GET(request: Request) { try { await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" }); return NextResponse.json(await prisma.expense.findMany({ include: { category: true, bankAccount: true, journalEntry: true, allocations: { include: { costCenter: true } } }, orderBy: [{ expenseDate: "desc" }, { id: "desc" }] })); } catch (error) { if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } throw error; } }
export async function POST(request: Request) { try { await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "POST" }); const body = await request.json(); const row = await prisma.$transaction((tx) => createAndPostExpense(tx, body)); return NextResponse.json(row, { status: 201 }); } catch (error) { console.error(error); if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); } }
