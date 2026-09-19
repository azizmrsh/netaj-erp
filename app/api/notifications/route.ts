import { NextResponse } from "next/server";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { loadNotificationCenter } from "@/lib/notification-center";
import { prisma } from "@/lib/prisma";
export async function GET(request: Request) { try { const context = await authorizeRequest(request, { moduleKey: "CORE", action: "READ" }), enabled = new Set([...context.companyModules].filter(([, value]) => value).map(([key]) => key)); return NextResponse.json(await prisma.$transaction((tx) => loadNotificationCenter(tx, enabled))); } catch (error) { if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); } return NextResponse.json({ error: "تعذر تحميل مركز التنبيهات" }, { status: 500 }); } }
