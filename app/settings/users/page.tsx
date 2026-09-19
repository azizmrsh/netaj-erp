import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import UsersClient from "./UsersClient";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE, requireAuthorization } from "@/lib/auth";
import { listTenantUsers } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  const data = await prisma.$transaction(async (tx) => {
    const context = await requireAuthorization(tx, token, { moduleKey: "CORE", action: "MANAGE" });
    const [users, companies, permissions] = await Promise.all([
      listTenantUsers(tx, context.tenantId),
      tx.company.findMany({ where: { tenantId: context.tenantId, isActive: true }, select: { id: true, code: true, legalNameAr: true }, orderBy: { code: "asc" } }),
      tx.permission.findMany({ orderBy: [{ moduleKey: "asc" }, { action: "asc" }] }),
    ]);
    return { users, companies, permissions };
  }).catch(() => null);
  if (!data) redirect("/");
  return <UsersClient initialUsers={JSON.parse(JSON.stringify(data.users))} companies={data.companies} permissions={data.permissions} />;
}
