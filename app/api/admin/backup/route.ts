import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { authErrorResponse, resolveAuthContext, sessionTokenFromRequest } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { backupFileName, createVerifiedDatabaseBackup } from "@/lib/backup";
import { prisma } from "@/lib/prisma";
import { PlatformError, platformErrorResponse } from "@/lib/platform";
import { requirePlatformAdministrator } from "@/lib/saas";

export async function GET(request: Request) {
  let destination = "";
  try {
    const { auth, administrator } = await prisma.$transaction(async (tx) => {
      const authContext = await resolveAuthContext(tx, sessionTokenFromRequest(request));
      return { auth: authContext, administrator: await requirePlatformAdministrator(tx, authContext.userId) };
    });
    if (process.env.ALLOW_DATABASE_BACKUP_DOWNLOAD !== "1") throw new PlatformError("تنزيل قاعدة البيانات معطل في إعدادات الخادم", "BACKUP_DOWNLOAD_DISABLED", 403);
    const authorized = await prisma.$transaction(async (tx) => {
      const [tenants, grants] = await Promise.all([
        tx.tenant.findMany({ select: { id: true } }),
        tx.supportAccessGrant.findMany({ where: { platformAdminId: administrator.id, companyId: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
      ]);
      const grantedTenants = new Set(grants.filter((grant) => { try { return (JSON.parse(grant.scopeJson) as string[]).includes("DATABASE_BACKUP"); } catch { return false; } }).map((grant) => grant.tenantId));
      return tenants.every((tenant) => grantedTenants.has(tenant.id));
    });
    if (!authorized) throw new PlatformError("يلزم تفويض دعم DATABASE_BACKUP صالح لكل مستأجر", "BACKUP_GRANT_REQUIRED", 403);
    const fileName = backupFileName(`netaj-company-${auth.companyId}`); destination = join(tmpdir(), fileName);
    const verified = await createVerifiedDatabaseBackup(destination), bytes = await readFile(destination);
    await prisma.$transaction(async (tx) => {
      const record = await tx.backupRecord.create({ data: { backupNumber: `BAK-${Date.now()}`, fileName, sizeBytes: BigInt(verified.sizeBytes), checksumSha256: verified.checksumSha256, databaseVersion: "SQLite", createdBy: auth.userId, verifiedAt: new Date() } });
      await audit(tx, { action: "BACKUP_DOWNLOAD", entityType: "BACKUP_RECORD", entityId: record.id, userId: String(auth.userId), metadata: { checksum: verified.checksumSha256, sizeBytes: verified.sizeBytes } });
    });
    return new Response(bytes, { headers: { "content-type": "application/vnd.sqlite3", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store", "x-content-checksum-sha256": verified.checksumSha256 } });
  } catch (error) {
    const response = error instanceof PlatformError ? platformErrorResponse(error) : authErrorResponse(error); return NextResponse.json({ error: response.status === 500 && error instanceof Error ? error.message : response.message, code: response.code }, { status: response.status });
  } finally { if (destination) await rm(destination, { force: true }).catch(() => undefined); }
}
