import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createAndPostExpense, financeErrorResponse } from "@/lib/finance";

export async function GET() { return NextResponse.json(await prisma.expense.findMany({ include: { category: true, bankAccount: true, journalEntry: true }, orderBy: [{ expenseDate: "desc" }, { id: "desc" }] })); }
export async function POST(request: Request) { try { const body = await request.json(); const row = await prisma.$transaction((tx) => createAndPostExpense(tx, body)); return NextResponse.json(row, { status: 201 }); } catch (error) { console.error(error); const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); } }
