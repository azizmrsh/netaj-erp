import { NextResponse } from "next/server";
import { AuthError, authErrorResponse, resolveAuthContext, sessionTokenFromRequest } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PlatformError, platformErrorResponse } from "@/lib/platform";
import { changeSubscription, platformWorkspace, requirePlatformAdministrator, savePlan, saveSupportGrant } from "@/lib/saas";

async function context(request: Request) { return prisma.$transaction(async (tx) => { const auth = await resolveAuthContext(tx, sessionTokenFromRequest(request)); const admin = await requirePlatformAdministrator(tx, auth.userId); return { auth, admin }; }); }
function failure(error: unknown) { const value = error instanceof AuthError ? authErrorResponse(error) : platformErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }

export async function GET(request: Request) { try { await context(request); return NextResponse.json(await prisma.$transaction((tx) => platformWorkspace(tx))); } catch (error) { return failure(error); } }
export async function POST(request: Request) {
  try {
    const { auth, admin } = await context(request), body = await request.json() as Record<string, unknown>, action = String(body.action ?? "").toUpperCase();
    const result = await prisma.$transaction(async (tx) => {
      if (action === "PLAN") return savePlan(tx, body, String(auth.userId));
      if (action === "SUBSCRIPTION") return changeSubscription(tx, body, String(auth.userId));
      if (action === "SUBSCRIPTION_STATUS") { const id = Number(body.id), status = String(body.status ?? "").toUpperCase(); if (!['ACTIVE','TRIAL','PAUSED','CANCELLED'].includes(status)) throw new PlatformError("حالة الاشتراك غير صالحة", "INVALID_SUBSCRIPTION_STATUS"); const subscription = await tx.tenantSubscription.findUnique({ where: { id } }); if (!subscription) throw new PlatformError("الاشتراك غير موجود", "SUBSCRIPTION_NOT_FOUND", 404); return tx.tenantSubscription.update({ where: { id }, data: { status, endsAt: status === 'CANCELLED' ? new Date() : undefined } }); }
      if (action === "SUPPORT_GRANT") return saveSupportGrant(tx, admin.id, body, String(auth.userId));
      if (action === "SUPPORT_REVOKE") { const id = Number(body.id), grant = await tx.supportAccessGrant.findUnique({ where: { id } }); if (!grant || grant.platformAdminId !== admin.id) throw new PlatformError("التفويض غير موجود", "GRANT_NOT_FOUND", 404); return tx.supportAccessGrant.update({ where: { id }, data: { revokedAt: new Date() } }); }
      if (action === "PLATFORM_CONFIG") { const configKey = String(body.configKey ?? "").toUpperCase().replace(/[^A-Z0-9_.-]/g, "_"); if (!configKey) throw new PlatformError("مفتاح الإعداد مطلوب", "INVALID_CONFIG"); return tx.platformConfiguration.upsert({ where: { configKey }, create: { configKey, valueJson: JSON.stringify(body.value), updatedBy: String(auth.userId) }, update: { valueJson: JSON.stringify(body.value), updatedBy: String(auth.userId) } }); }
      throw new PlatformError("إجراء إدارة المنصة غير مدعوم", "INVALID_ACTION");
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return failure(error); }
}
