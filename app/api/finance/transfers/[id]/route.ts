import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { cancelBankTransfer, financeErrorResponse } from "@/lib/finance";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";import{AuthError}from"@/lib/auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) { try { const { id } = await context.params, body = await request.json(); if (String(body.action).toUpperCase() !== "CANCEL") return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 }); await authorizeRequest(request,{moduleKey:"ACCOUNTING",action:"CANCEL"}); const row = await prisma.$transaction((tx) => cancelBankTransfer(tx, Number(id), String(body.reason ?? "").trim() || null)); return NextResponse.json(row); } catch (error) { console.error(error); if(error instanceof AuthError){const response=authErrorResponse(error);return NextResponse.json({error:response.message,code:response.code},{status:response.status})} const response = financeErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); } }
