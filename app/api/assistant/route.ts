import { NextResponse } from "next/server";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { askAssistant, AssistantError, saveAssistantProposal } from "@/lib/assistant";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "CORE", action: "READ" });
    return NextResponse.json(await prisma.assistantConversation.findMany({ where: { userId: context.userId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 100 }, proposals: { where: { status: "PENDING" } } }, orderBy: { updatedAt: "desc" }, take: 30 }));
  } catch (error) {
    const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CORE", action: "READ" });
    const body = await request.json();
    const enabledModules = new Set([...auth.companyModules].filter(([moduleKey, enabled]) => enabled && auth.permissions.has(`${moduleKey}.READ`)).map(([moduleKey]) => moduleKey));
    const context = { userId: auth.userId, permissions: auth.permissions, enabledModules };
    const action = String(body.action ?? "ASK").toUpperCase();
    const result = action === "ASK"
      ? await prisma.$transaction((tx) => askAssistant(tx, body, context))
      : await prisma.$transaction((tx) => saveAssistantProposal(tx, body, context));
    return NextResponse.json(result, { status: String(body.action ?? "ASK").toUpperCase() === "PROPOSE" ? 201 : 200 });
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    if (error instanceof AssistantError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    console.error(error); return NextResponse.json({ error: "تعذر تنفيذ طلب المساعد" }, { status: 500 });
  }
}
