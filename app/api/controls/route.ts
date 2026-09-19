import { NextResponse } from "next/server";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { resolveControlAlert, scanControlAlerts } from "@/lib/controls";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try { await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" }); return NextResponse.json(await prisma.controlAlert.findMany({ orderBy: [{ status: "asc" }, { detectedAt: "desc" }], take: 500 })); }
  catch (error) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" }), body = await request.json();
    const result = body.action === "RESOLVE"
      ? await prisma.$transaction((tx) => resolveControlAlert(tx, Number(body.id), String(body.resolution ?? ""), String(auth.userId)))
      : await prisma.$transaction((tx) => scanControlAlerts(tx, String(auth.userId)));
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ الفحص الرقابي" }, { status: 400 });
  }
}
