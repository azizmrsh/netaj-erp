import SuperAdminClient from "./SuperAdminClient";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, resolveAuthContext } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { requirePlatformAdministrator } from "@/lib/saas";
export const dynamic = "force-dynamic";
export default async function SuperAdminPage() { const token=(await cookies()).get(SESSION_COOKIE)?.value??null;const auth=await prisma.$transaction(tx=>resolveAuthContext(tx,token)).catch(()=>null);if(!auth)redirect("/login");const admin=await prisma.$transaction(tx=>requirePlatformAdministrator(tx,auth.userId)).catch(()=>null);if(!admin)notFound();return <SuperAdminClient />; }
