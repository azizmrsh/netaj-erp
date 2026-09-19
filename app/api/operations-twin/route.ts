import { NextResponse } from "next/server";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { loadOperationsTwin } from "@/lib/operations-twin";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request) { try { await authorizeRequest(request, { moduleKey: "CORE", action: "READ" }); return NextResponse.json(await prisma.$transaction(loadOperationsTwin)); } catch (error) { if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); } return NextResponse.json({ error: "تعذر تحميل التوأم التشغيلي" }, { status: 500 }); } }
