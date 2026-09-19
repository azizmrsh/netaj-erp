import OrganizationClient from "./OrganizationClient";
import { prisma } from "@/lib/prisma";
import { getTenantWorkspace } from "@/lib/platform";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, resolveAuthContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const context = await prisma.$transaction((tx) => resolveAuthContext(tx, token)).catch(() => null);
  if (!context) redirect("/login");
  const workspace = await prisma.$transaction((tx) => getTenantWorkspace(tx, context.tenantId, context.membershipId));
  return <OrganizationClient initialWorkspace={JSON.parse(JSON.stringify(workspace))} currentCompanyId={context.companyId} />;
}
