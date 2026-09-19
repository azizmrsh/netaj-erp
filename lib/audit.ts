import type { Prisma } from "@prisma/client";

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
  return tx.auditLog.create({
    data: {
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      userId: input.userId ?? "system",
      metadata: input.metadata === undefined ? null : JSON.stringify(input.metadata),
    },
  });
}
