import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { AnalyticsError, createEquipmentReading, upsertFactoryTarget } from "@/lib/analytics";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";

export async function POST(request: Request) {
  try { const body = await request.json(), type = String(body.type ?? "READING").toUpperCase(); await authorizeRequest(request, { moduleKey: "FACTORY", action: type === "TARGET" ? "UPDATE" : "CREATE" }); const row = type === "TARGET" ? await prisma.$transaction((tx) => upsertFactoryTarget(tx, body)) : await prisma.$transaction((tx) => createEquipmentReading(tx, body)); return NextResponse.json(row, { status: type === "TARGET" ? 200 : 201 }); }
  catch (error) { if (error instanceof AuthError) { const r = authErrorResponse(error); return NextResponse.json({ error: r.message, code: r.code }, { status: r.status }); } return NextResponse.json({ error: error instanceof AnalyticsError ? error.message : "تعذر حفظ القراءة" }, { status: 400 }); }
}
