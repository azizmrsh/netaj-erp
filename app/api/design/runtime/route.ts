import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const parse = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };

export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "DESIGN", action: "READ" });
    const [theme, dashboards, company] = await Promise.all([
      prisma.companyThemeProfile.findFirst(),
      prisma.dashboardDefinition.findMany({ where: { isActive: true }, include: { widgets: { where: { isActive: true }, orderBy: { position: "asc" } } }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] }),
      prisma.company.findFirst({ where: { id: auth.companyId }, select: { legalNameAr: true, legalNameEn: true, defaultLanguageCode: true } }),
    ]);
    const visible = dashboards.filter((dashboard) => { const roles = parse<string[]>(dashboard.roleCodesJson, []); return !roles.length || roles.some((role) => auth.roleCodes.includes(role)); });
    return NextResponse.json({ company, theme: theme ? { ...theme, menuOrder: parse(theme.menuOrderJson, []), dashboardStyle: parse(theme.dashboardStyleJson, {}), loginBranding: parse(theme.loginBrandingJson, {}) } : null, dashboards: visible.map((dashboard) => ({ ...dashboard, roleCodes: parse(dashboard.roleCodesJson, []), widgets: dashboard.widgets.map((widget) => ({ ...widget, config: parse(widget.configJson, {}) })) })) });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    console.error(error); return NextResponse.json({ error: "تعذر تحميل تصميم الشركة" }, { status: 500 });
  }
}
