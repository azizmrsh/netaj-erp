import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelBankTransfer, financeErrorResponse } from "@/lib/finance";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params, body = await request.json(); if (String(body.action).toUpperCase() !== "CANCEL") return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 }); const row = await prisma.$transaction((tx) => cancelBankTransfer(tx, Number(id), String(body.reason ?? "").trim() || null)); return NextResponse.json(row); } catch (error) { console.error(error); const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); } }
