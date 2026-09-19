import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { createBlendedFactoryProduction, factoryErrorResponse, upsertFactoryProductSetting } from "@/lib/factory";

function failure(error: unknown) { console.error(error); if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); } const value = factoryErrorResponse(error); return NextResponse.json({ error: value.message }, { status: value.status }); }
export async function GET(request: Request) { try { await authorizeRequest(request, { moduleKey: "FACTORY", action: "READ" }); return NextResponse.json(await prisma.factoryProductSetting.findMany({ orderBy: { productItemId: "asc" } })); } catch (error) { return failure(error); } }
export async function POST(request: Request) { try { const body = await request.json() as Record<string, unknown>, action = String(body.action ?? "PRODUCE").toUpperCase(); await authorizeRequest(request, { moduleKey: "FACTORY", action: action === "CONFIGURE" ? "MANAGE" : "POST" }); const row = await prisma.$transaction(async (tx) => { if (action === "CONFIGURE") return upsertFactoryProductSetting(tx, body); return createBlendedFactoryProduction(tx, body); }); return NextResponse.json(row, { status: 201 }); } catch (error) { return failure(error); } }
