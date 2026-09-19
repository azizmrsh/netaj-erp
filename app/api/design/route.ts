import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { DesignError, listDesignWorkspace, publishTemplateVersion, saveDashboard, saveTemplateVersion, saveTheme } from "@/lib/design";
import { prisma } from "@/lib/prisma";

function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof DesignError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error); return NextResponse.json({ error: "تعذر معالجة إعدادات التصميم" }, { status: 500 });
}

export async function GET(request: Request) {
  try { await authorizeRequest(request, { moduleKey: "DESIGN", action: "READ" }); return NextResponse.json(await prisma.$transaction((tx) => listDesignWorkspace(tx))); }
  catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>, action = String(body.action ?? "").toUpperCase();
    const requiredAction = action === "PUBLISH_VERSION" ? "PUBLISH" : action === "THEME" ? "MANAGE" : "CREATE";
    const auth = await authorizeRequest(request, { moduleKey: "DESIGN", action: requiredAction });
    const scoped = { ...body, tenantId: auth.tenantId, companyId: auth.companyId };
    const result = await prisma.$transaction(async (tx) => {
      if (action === "TEMPLATE_VERSION") return saveTemplateVersion(tx, scoped, String(auth.userId));
      if (action === "PUBLISH_VERSION") return publishTemplateVersion(tx, Number(body.versionId), auth.companyId, String(auth.userId));
      if (action === "THEME") return saveTheme(tx, scoped, String(auth.userId));
      if (action === "DASHBOARD") return saveDashboard(tx, scoped, String(auth.userId));
      throw new DesignError("إجراء التصميم غير مدعوم");
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return failure(error); }
}
