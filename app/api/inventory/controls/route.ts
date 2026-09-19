import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { approveInventoryCount, createInventoryCount, customerFinancialExposure, operationalControlErrorResponse, setPartyStockValuationRate } from "@/lib/operational-controls";

function failure(error: unknown) {
  console.error(error);
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  const value = operationalControlErrorResponse(error);
  return NextResponse.json({ error: value.message }, { status: value.status });
}

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "INVENTORY", action: "READ" });
    const params = new URL(request.url).searchParams, view = String(params.get("view") ?? "counts").toLowerCase();
    if (view === "exposure") return NextResponse.json(await prisma.$transaction((tx) => customerFinancialExposure(tx, Number(params.get("partyId")), params.get("asOf") ? new Date(String(params.get("asOf"))) : new Date())));
    if (view === "valuations") return NextResponse.json(await prisma.partyStockValuationRate.findMany({ include: { party: true, item: true }, orderBy: [{ effectiveAt: "desc" }, { id: "desc" }] }));
    return NextResponse.json(await prisma.inventoryCount.findMany({ include: { lines: { include: { item: true } } }, orderBy: [{ countDate: "desc" }, { id: "desc" }] }));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>, action = String(body.action ?? "CREATE_COUNT").toUpperCase();
    const auth = await authorizeRequest(request, { moduleKey: "INVENTORY", action: action === "APPROVE_COUNT" ? "APPROVE" : action === "SET_VALUATION" ? "MANAGE" : "CREATE" });
    const row = await prisma.$transaction(async (tx) => {
      if (action === "APPROVE_COUNT") return approveInventoryCount(tx, Number(body.id), auth.userId);
      if (action === "SET_VALUATION") return setPartyStockValuationRate(tx, body, auth.userId);
      return createInventoryCount(tx, body);
    });
    return NextResponse.json(row, { status: action === "CREATE_COUNT" ? 201 : 200 });
  } catch (error) { return failure(error); }
}
