import type { Prisma } from "@prisma/client";
import { audit, verifyAuditChain } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
type Candidate = { alertType: string; severity?: string; title: string; description: string; entityType?: string; entityId?: number; fingerprint: string };

export async function scanControlAlerts(tx: Tx, userId?: string) {
  const scope = await getVerifiedDataScope();
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [invoiceGroups, ibanGroups, approvedChanges, purchases, cancellations, sensitiveChanges, auditIntegrity] = await Promise.all([
    tx.purchase.groupBy({ by: ["partyId", "supplierInvoiceNumber"], where: { supplierInvoiceNumber: { not: null }, status: { not: "CANCELLED" } }, _count: { _all: true } }),
    tx.party.groupBy({ by: ["iban"], where: { isSupplier: true, iban: { not: null } }, _count: { _all: true } }),
    tx.businessDocument.findMany({ where: { approvedAt: { not: null } }, select: { id: true, documentNumber: true, approvedAt: true, updatedAt: true } }),
    tx.purchase.findMany({ where: { sourceOrderId: { not: null }, status: { not: "CANCELLED" } }, include: { sourceOrder: true } }),
    tx.auditLog.findMany({ where: { createdAt: { gte: since }, action: { contains: "CANCEL" } }, orderBy: { createdAt: "desc" }, take: 200 }),
    tx.auditLog.findMany({ where: { createdAt: { gte: since }, action: { in: ["UPDATE", "DELETE", "DEACTIVATE"] }, entityType: { in: ["PARTY", "ITEM", "BANK_ACCOUNT", "ACCOUNT", "PLATFORM_USER"] } }, orderBy: { createdAt: "desc" }, take: 200 }),
    verifyAuditChain(tx),
  ]);
  const candidates: Candidate[] = [];
  for (const row of invoiceGroups.filter((entry) => entry.supplierInvoiceNumber && entry._count._all > 1)) candidates.push({ alertType: "DUPLICATE_SUPPLIER_INVOICE", title: "احتمال تكرار فاتورة مورد", description: `رقم المورد ${row.supplierInvoiceNumber} ظهر ${row._count._all} مرات للطرف نفسه؛ يرجى المراجعة.`, entityType: "PARTY", entityId: row.partyId, fingerprint: `dup-invoice:${row.partyId}:${row.supplierInvoiceNumber}` });
  for (const row of ibanGroups.filter((entry) => entry.iban && entry._count._all > 1)) candidates.push({ alertType: "DUPLICATE_SUPPLIER_IBAN", title: "IBAN مشترك بين موردين", description: `IBAN المنتهي بـ ${String(row.iban).slice(-4)} مستخدم في ${row._count._all} سجلات موردين؛ يرجى التحقق.`, fingerprint: `dup-iban:${row.iban}` });
  for (const row of approvedChanges.filter((entry) => entry.approvedAt && entry.updatedAt.getTime() > entry.approvedAt.getTime() + 1000)) candidates.push({ alertType: "POST_APPROVAL_CHANGE", severity: "HIGH", title: "مستند عُدّل بعد الاعتماد", description: `المستند ${row.documentNumber} تغير بعد وقت الاعتماد؛ يرجى مراجعة سجل التدقيق.`, entityType: "BUSINESS_DOCUMENT", entityId: row.id, fingerprint: `post-approval:${row.id}:${row.updatedAt.toISOString()}` });
  for (const row of purchases.filter((entry) => entry.sourceOrder && Number(entry.totalAmount) > Number(entry.sourceOrder.totalAmount) + 0.004)) candidates.push({ alertType: "SPEND_ABOVE_PO", severity: "HIGH", title: "فاتورة أعلى من أمر الشراء", description: `الفاتورة ${row.purchaseNumber} تتجاوز أمر الشراء ${row.sourceOrder?.documentNumber}.`, entityType: "PURCHASE", entityId: row.id, fingerprint: `po-over:${row.id}:${row.updatedAt.toISOString()}` });
  const cancellationsByUser = new Map<string, number>();
  for (const row of cancellations) cancellationsByUser.set(row.userId ?? "system", (cancellationsByUser.get(row.userId ?? "system") ?? 0) + 1);
  for (const [actor, count] of cancellationsByUser) if (count >= 3) candidates.push({ alertType: "UNUSUAL_CANCELLATION_VOLUME", title: "حجم إلغاءات يحتاج مراجعة", description: `تم تسجيل ${count} عمليات إلغاء خلال 7 أيام بواسطة ${actor}. هذا تنبيه رقابي وليس اتهامًا.`, fingerprint: `cancellations:${actor}:${since.toISOString().slice(0, 10)}` });
  for (const row of sensitiveChanges) candidates.push({ alertType: "SENSITIVE_MASTER_CHANGE", title: "تغيير بيانات أساسية حساسة", description: `تم ${row.action} على ${row.entityType}؛ راجع التفاصيل في سجل التدقيق.`, entityType: row.entityType, entityId: row.entityId ?? undefined, fingerprint: `master:${row.id}` });
  if (!auditIntegrity.valid) candidates.push({ alertType: "AUDIT_CHAIN_INTEGRITY", severity: "CRITICAL", title: "سلامة سلسلة التدقيق تحتاج مراجعة", description: `تعذر التحقق من السلسلة عند السجل ${auditIntegrity.brokenAtId}.`, entityType: "AUDIT_LOG", entityId: auditIntegrity.brokenAtId ?? undefined, fingerprint: `audit-chain:${auditIntegrity.brokenAtId}` });
  for (const candidate of candidates) await tx.controlAlert.upsert({ where: { tenantId_companyId_fingerprint: { ...scope, fingerprint: candidate.fingerprint } }, create: { ...candidate, severity: candidate.severity ?? "WARNING" }, update: { title: candidate.title, description: candidate.description, severity: candidate.severity ?? "WARNING", status: "OPEN", detectedAt: new Date(), resolvedAt: null, resolvedBy: null, resolution: null } });
  await audit(tx, { action: "CONTROL_SCAN", entityType: "CONTROL_ALERT", userId, metadata: { candidates: candidates.length, auditChainValid: auditIntegrity.valid } });
  return { generated: candidates.length, auditIntegrity, alerts: await tx.controlAlert.findMany({ orderBy: [{ status: "asc" }, { detectedAt: "desc" }], take: 500 }) };
}

export async function resolveControlAlert(tx: Tx, id: number, resolution: string, userId: string) {
  if (!resolution.trim()) throw new Error("سبب المعالجة مطلوب");
  const row = await tx.controlAlert.update({ where: { id }, data: { status: "RESOLVED", resolvedAt: new Date(), resolvedBy: userId, resolution: resolution.trim() } });
  await audit(tx, { action: "CONTROL_ALERT_RESOLVE", entityType: "CONTROL_ALERT", entityId: id, userId, metadata: { resolution } });
  return row;
}
