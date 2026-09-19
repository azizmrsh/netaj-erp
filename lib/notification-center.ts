import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export type CenterNotification = { id: string; category: "CONTROL" | "APPROVAL" | "EXPIRY"; severity: "INFO" | "WARNING" | "CRITICAL"; title: string; description: string; occurredAt: Date; href: string };

export async function loadNotificationCenter(tx: Tx, enabledModules: Set<string>, now = new Date()) {
  const horizon = new Date(now.getTime() + 45 * 86_400_000), notifications: CenterNotification[] = [];
  const [alerts, approvals] = await Promise.all([
    tx.controlAlert.findMany({ where: { status: "OPEN" }, orderBy: { detectedAt: "desc" }, take: 50 }),
    enabledModules.has("APPROVALS") ? tx.unifiedApprovalRequest.findMany({ where: { status: "PENDING" }, orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }], take: 50 }) : [],
  ]);
  for (const alert of alerts) notifications.push({ id: `CONTROL:${alert.id}`, category: "CONTROL", severity: alert.severity === "CRITICAL" ? "CRITICAL" : "WARNING", title: alert.title, description: alert.description, occurredAt: alert.detectedAt, href: "/controls" });
  for (const approval of approvals) notifications.push({ id: `APPROVAL:${approval.id}`, category: "APPROVAL", severity: approval.dueAt && approval.dueAt < now ? "CRITICAL" : "INFO", title: approval.title, description: `${approval.requestNumber}${approval.dueAt ? ` · الاستحقاق ${approval.dueAt.toLocaleDateString("ar-SA")}` : ""}`, occurredAt: approval.createdAt, href: "/approvals" });
  if (enabledModules.has("HR")) {
    const employees = await tx.employee.findMany({ where: { status: "ACTIVE", OR: [{ idExpiry: { gte: now, lte: horizon } }, { contractExpiry: { gte: now, lte: horizon } }] }, select: { id: true, employeeNumber: true, nameAr: true, idExpiry: true, contractExpiry: true } });
    for (const employee of employees) for (const [kind, date] of [["الهوية", employee.idExpiry], ["العقد", employee.contractExpiry]] as const) if (date && date >= now && date <= horizon) notifications.push({ id: `EMPLOYEE:${employee.id}:${kind}`, category: "EXPIRY", severity: date.getTime() - now.getTime() <= 14 * 86_400_000 ? "CRITICAL" : "WARNING", title: `قرب انتهاء ${kind} — ${employee.nameAr}`, description: `${employee.employeeNumber} · ${date.toLocaleDateString("ar-SA")}`, occurredAt: date, href: "/hr" });
  }
  if (enabledModules.has("TRANSPORT")) {
    const [documents, drivers] = await Promise.all([tx.truckDocument.findMany({ where: { expiryDate: { gte: now, lte: horizon } }, include: { truck: { select: { plateNumber: true } } } }), tx.driver.findMany({ where: { status: "ACTIVE", OR: [{ licenseExpiry: { gte: now, lte: horizon } }, { driverCardExpiry: { gte: now, lte: horizon } }, { passportExpiry: { gte: now, lte: horizon } }] } })]);
    for (const document of documents) notifications.push({ id: `TRUCK:${document.id}`, category: "EXPIRY", severity: document.expiryDate && document.expiryDate.getTime() - now.getTime() <= 14 * 86_400_000 ? "CRITICAL" : "WARNING", title: `قرب انتهاء ${document.documentType}`, description: `${document.truck.plateNumber} · ${document.expiryDate?.toLocaleDateString("ar-SA")}`, occurredAt: document.expiryDate ?? now, href: "/transport" });
    for (const driver of drivers) { const dates = [["رخصة القيادة", driver.licenseExpiry], ["بطاقة السائق", driver.driverCardExpiry], ["الجواز", driver.passportExpiry]] as const; for (const [kind, date] of dates) if (date && date >= now && date <= horizon) notifications.push({ id: `DRIVER:${driver.id}:${kind}`, category: "EXPIRY", severity: date.getTime() - now.getTime() <= 14 * 86_400_000 ? "CRITICAL" : "WARNING", title: `قرب انتهاء ${kind}`, description: `${driver.name} · ${date.toLocaleDateString("ar-SA")}`, occurredAt: date, href: "/transport" }); }
  }
  notifications.sort((left, right) => (left.severity === right.severity ? right.occurredAt.getTime() - left.occurredAt.getTime() : ({ CRITICAL: 0, WARNING: 1, INFO: 2 }[left.severity] - { CRITICAL: 0, WARNING: 1, INFO: 2 }[right.severity])));
  return { generatedAt: now, counts: { total: notifications.length, critical: notifications.filter((entry) => entry.severity === "CRITICAL").length, warning: notifications.filter((entry) => entry.severity === "WARNING").length, approvals: notifications.filter((entry) => entry.category === "APPROVAL").length }, notifications };
}
