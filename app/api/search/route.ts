import { NextResponse } from "next/server";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { globalSearch } from "@/lib/global-search";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CORE", action: "READ" }), params = new URL(request.url).searchParams;
    const modules = new Set([...auth.companyModules].filter(([moduleKey, enabled]) => enabled && auth.permissions.has(`${moduleKey}.READ`)).map(([moduleKey]) => moduleKey)); modules.add("CORE");
    return NextResponse.json(await prisma.$transaction((tx) => globalSearch(tx, params.get("q") ?? "", modules, Number(params.get("page")) || 1, Number(params.get("pageSize")) || 20, auth.tenantId, auth.companyId)));
  } catch (error) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
}
