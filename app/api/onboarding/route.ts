import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { platformErrorResponse } from "@/lib/platform";
import { onboardingWorkspace, saveOnboardingStep } from "@/lib/saas";
import { initializeCompanyDesign } from "@/lib/design";

function failure(error: unknown) { const value = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
export async function GET(request: Request) { try { const auth = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" }); return NextResponse.json(await prisma.$transaction(async (tx) => { await initializeCompanyDesign(tx, auth.tenantId, auth.companyId); return onboardingWorkspace(tx, auth.tenantId, auth.companyId); })); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { const auth = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" }), body = await request.json() as Record<string, unknown>; return NextResponse.json(await prisma.$transaction((tx) => saveOnboardingStep(tx, auth.tenantId, auth.companyId, auth.userId, body))); } catch (error) { return failure(error); } }
