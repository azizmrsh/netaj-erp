import OrganizationClient from "./OrganizationClient";
import { prisma } from "@/lib/prisma";
import { getTenantWorkspace } from "@/lib/platform";

export const dynamic = "force-dynamic";

export default async function OrganizationPage() {
  const workspace = await prisma.$transaction((tx) => getTenantWorkspace(tx, 1));
  return <OrganizationClient initialWorkspace={JSON.parse(JSON.stringify(workspace))} />;
}
