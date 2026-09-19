import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const parse = (value: string) => { try { return JSON.parse(value) as Record<string, unknown>; } catch { return {}; } };
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("company")?.trim().toUpperCase();
  const company = await prisma.company.findFirst({ where: code ? { code, isActive: true } : { isActive: true }, orderBy: { id: "asc" }, include: { themeProfile: true } });
  if (!company) return NextResponse.json({ name: "NETAj Global ERP", logoUrl: null, primaryColor: "#22d3ee", secondaryColor: "#020617", title: "تسجيل الدخول" });
  const branding = company.themeProfile ? parse(company.themeProfile.loginBrandingJson) : {};
  return NextResponse.json({ name: company.tradeName || company.legalNameAr, logoUrl: company.themeProfile?.loginLogoUrl || company.themeProfile?.logoUrl || null, primaryColor: company.themeProfile?.primaryColor || "#22d3ee", secondaryColor: company.themeProfile?.secondaryColor || "#020617", title: String(branding.title ?? "تسجيل الدخول"), subtitle: String(branding.subtitle ?? "NETAj Global ERP") });
}
