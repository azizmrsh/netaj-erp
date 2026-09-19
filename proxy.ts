import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { prisma } from "@/lib/prisma";
import { AuthError, requireAuthorization, resolveAuthContext } from "@/lib/auth";

const publicPaths = ["/login", "/setup", "/api/auth/login", "/api/auth/setup"];

function requiredModule(path: string) {
  if (path.startsWith("/api/platform")) return null;
  if (/^\/api\/notes\/\d+$/.test(path) || /^\/api\/finance\/(vouchers|transfers|periods)\/\d+$/.test(path) || /^\/api\/hr\/payroll\/\d+$/.test(path)) return null;
  if (/^\/(api\/)?(items|item-categories|units|parties|attachments|settings)/.test(path) || path === "/") return "CORE";
  if (path.startsWith("/api/inventory") || path.startsWith("/inventory")) return "INVENTORY";
  if (path.startsWith("/api/notes") || path.startsWith("/notes")) return "NOTES";
  if (path.startsWith("/api/transport") || path.startsWith("/transport")) return "TRANSPORT";
  if (path.startsWith("/api/purchases") || path.startsWith("/purchases")) return "PURCHASES";
  if (path.startsWith("/api/workflows")) return null;
  if (path.startsWith("/api/sales") || path.startsWith("/sales")) return "SALES";
  if (path.startsWith("/api/accounting") || path.startsWith("/api/finance") || path.startsWith("/accounting")) return "ACCOUNTING";
  if (path.startsWith("/api/factory") || path.startsWith("/factory")) return "FACTORY";
  if (path.startsWith("/api/hr") || path.startsWith("/hr")) return "HR";
  if (path.startsWith("/api/external") || path.startsWith("/external")) return "EXTERNAL";
  if (path.startsWith("/api/projects") || path.startsWith("/projects")) return "PROJECTS";
  if (path.startsWith("/api/imports") || path.startsWith("/imports")) return "IMPORT";
  if (path.startsWith("/api/configuration") || path.startsWith("/api/custom-reports") || path.startsWith("/settings/configuration") || path.startsWith("/reports/builder")) return "CONFIG";
  return "CORE";
}

function requiredAction(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") return "READ" as const;
  if (request.method === "POST" && /(invoice|convert|post)/i.test(request.nextUrl.pathname)) return "POST" as const;
  if (request.method === "POST") return "CREATE" as const;
  if (request.method === "DELETE") return "CANCEL" as const;
  return "UPDATE" as const;
}

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (publicPaths.some((publicPath) => path === publicPath || path.startsWith(`${publicPath}/`))) {
    return NextResponse.next();
  }
  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "يجب تسجيل الدخول", code: "AUTH_REQUIRED" }, { status: 401 });
    }
    const login = new URL("/login", request.url);
    login.searchParams.set("next", path);
    return NextResponse.redirect(login);
  }

  if (path.startsWith("/api/auth/")) return NextResponse.next();
  try {
    const token = request.cookies.get(SESSION_COOKIE)?.value ?? null;
    const moduleKey = requiredModule(path);
    const context = await prisma.$transaction((tx) =>
      moduleKey ? requireAuthorization(tx, token, { moduleKey, action: requiredAction(request) }) : resolveAuthContext(tx, token)
    );
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-netaj-scope-verified", "1");
    requestHeaders.set("x-netaj-tenant-id", String(context.tenantId));
    requestHeaders.set("x-netaj-company-id", String(context.companyId));
    requestHeaders.set("x-netaj-user-id", String(context.userId));
    return NextResponse.next({ request: { headers: requestHeaders } });
  } catch (error) {
    const status = error instanceof AuthError ? error.status : 500;
    const code = error instanceof AuthError ? error.code : "AUTH_INTERNAL_ERROR";
    const message = error instanceof AuthError ? error.message : "تعذر التحقق من الصلاحيات";
    if (path.startsWith("/api/")) return NextResponse.json({ error: message, code }, { status });
    if (status === 401) return NextResponse.redirect(new URL("/login", request.url));
    return new NextResponse("Forbidden", { status: 403 });
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
