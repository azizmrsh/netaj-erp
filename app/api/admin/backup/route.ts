import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NextResponse } from "next/server";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { audit } from "@/lib/audit";
import { backupFileName, createVerifiedDatabaseBackup } from "@/lib/backup";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  let destination = "";
  try {
    const auth = await authorizeRequest(request, { moduleKey: "CORE", action: "MANAGE" });
    const fileName = backupFileName(`netaj-company-${auth.companyId}`); destination = join(tmpdir(), fileName);
    const verified = await createVerifiedDatabaseBackup(destination), bytes = await readFile(destination);
    await prisma.$transaction(async (tx) => {
      const record = await tx.backupRecord.create({ data: { backupNumber: `BAK-${Date.now()}`, fileName, sizeBytes: BigInt(verified.sizeBytes), checksumSha256: verified.checksumSha256, databaseVersion: "SQLite", createdBy: auth.userId, verifiedAt: new Date() } });
      await audit(tx, { action: "BACKUP_DOWNLOAD", entityType: "BACKUP_RECORD", entityId: record.id, userId: String(auth.userId), metadata: { checksum: verified.checksumSha256, sizeBytes: verified.sizeBytes } });
    });
    return new Response(bytes, { headers: { "content-type": "application/vnd.sqlite3", "content-disposition": `attachment; filename="${fileName}"`, "cache-control": "no-store", "x-content-checksum-sha256": verified.checksumSha256 } });
  } catch (error) {
    const response = authErrorResponse(error); return NextResponse.json({ error: response.status === 500 && error instanceof Error ? error.message : response.message, code: response.code }, { status: response.status });
  } finally { if (destination) await rm(destination, { force: true }).catch(() => undefined); }
}
