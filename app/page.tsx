import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardClient from "./DashboardClient";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, resolveAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const context = await prisma.$transaction((tx) => resolveAuthContext(tx, token)).catch(() => null);
  if (!context) redirect("/login");
  const planModules = new Set(context.subscription?.plan.modules.filter((row) => row.enabled).map((row) => row.moduleKey) ?? []);
  const enabledModules = [...context.companyModules.entries()]
    .filter(([key, enabled]) => enabled && planModules.has(key))
    .map(([key]) => key);
  return <DashboardClient enabledModules={enabledModules} companyName={context.companyCode} userName={context.userName} />;
}
