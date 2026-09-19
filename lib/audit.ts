import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { getVerifiedDataScope } from "@/lib/data-scope";

function auditHash(payload: unknown) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export async function audit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    entityType: string;
    entityId?: number | null;
    userId?: string | null;
    metadata?: unknown;
  }
) {
  const scope = await getVerifiedDataScope();
  const previous = await tx.auditLog.findFirst({ orderBy: { id: "desc" }, select: { id: true, entryHash: true } });
  const previousHash = previous?.entryHash ?? (previous ? `legacy-${previous.id}` : null);
  const createdAt = new Date();
  const metadata = input.metadata === undefined ? null : JSON.stringify(input.metadata);
  const entryHash = auditHash({
    tenantId: scope.tenantId,
    companyId: scope.companyId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    userId: input.userId ?? "system",
    metadata,
    previousHash,
    createdAt: createdAt.toISOString(),
  });
  return tx.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      userId: input.userId ?? "system",
      metadata,
      previousHash,
      entryHash,
      createdAt,
    },
  });
}

export async function verifyAuditChain(tx: Prisma.TransactionClient) {
  const rows = await tx.auditLog.findMany({ where: { entryHash: { not: null } }, orderBy: { id: "asc" } });
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (index > 0 && row.previousHash !== rows[index - 1].entryHash) return { valid: false, brokenAtId: row.id, checked: index };
    const expected = auditHash({
      tenantId: row.tenantId,
      companyId: row.companyId,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      userId: row.userId,
      metadata: row.metadata,
      previousHash: row.previousHash,
      createdAt: row.createdAt.toISOString(),
    });
    if (expected !== row.entryHash) return { valid: false, brokenAtId: row.id, checked: index };
  }
  return { valid: true, brokenAtId: null, checked: rows.length };
}
