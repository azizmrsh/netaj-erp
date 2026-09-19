import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";

export async function authorizeAttachmentEntity(request: Request, entityType: string, entityId: number, action: "READ" | "CREATE") {
  let moduleKey = "CORE";
  if (entityType === "BUSINESS_DOCUMENT") {
    const document = await prisma.businessDocument.findUnique({ where: { id: entityId }, select: { direction: true } });
    moduleKey = document?.direction === "PURCHASE" ? "PURCHASES" : "SALES";
  } else if (entityType === "SALES_INVOICE") moduleKey = "SALES";
  else if (entityType === "SUPPLIER_INVOICE") moduleKey = "PURCHASES";
  else if (entityType === "DELIVERY_RECEIPT_NOTE") moduleKey = "NOTES";
  else if (["TRANSPORT_TRIP", "TRUCK", "DRIVER"].includes(entityType)) moduleKey = "TRANSPORT";
  else if (["EXPENSE", "REVENUE", "FINANCIAL_VOUCHER", "JOURNAL_ENTRY", "BANK_TRANSFER", "BANK_RECONCILIATION", "VAT_RETURN", "CREDIT_DEBIT_NOTE", "ACCOUNTING_ADJUSTMENT"].includes(entityType)) moduleKey = "ACCOUNTING";
  else if (entityType === "FACTORY_MAINTENANCE") moduleKey = "FACTORY";
  else if (["EMPLOYEE", "EXTERNAL_WORKER"].includes(entityType)) moduleKey = "HR";
  return authorizeRequest(request, { moduleKey, action });
}
