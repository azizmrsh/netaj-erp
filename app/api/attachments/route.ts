import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { authorizeAttachmentEntity } from "@/lib/attachment-authorization";
import { AuthError } from "@/lib/auth";
import { authErrorResponse } from "@/lib/api-auth";
import { assertTenantLimit } from "@/lib/saas";
import { PlatformError, platformErrorResponse } from "@/lib/platform";

const maximumSize = 10 * 1024 * 1024;
const allowed = new Map([
  ["application/pdf", ".pdf"], ["image/jpeg", ".jpg"], ["image/png", ".png"],
  ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".xlsx"], ["application/vnd.ms-excel", ".xls"],
]);
const knownEntities = new Set(["BUSINESS_DOCUMENT", "DELIVERY_RECEIPT_NOTE", "SALES_INVOICE", "SUPPLIER_INVOICE", "PARTY", "TRANSPORT_TRIP", "TRUCK", "DRIVER", "EXPENSE", "REVENUE", "FINANCIAL_VOUCHER", "JOURNAL_ENTRY", "BANK_TRANSFER", "FACTORY_MAINTENANCE", "EMPLOYEE", "EXTERNAL_WORKER"]);

async function entityExists(entityType: string, entityId: number) {
  switch (entityType) {
    case "BUSINESS_DOCUMENT": return Boolean(await prisma.businessDocument.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "DELIVERY_RECEIPT_NOTE": return Boolean(await prisma.deliveryReceiptNote.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "SALES_INVOICE": return Boolean(await prisma.sale.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "SUPPLIER_INVOICE": return Boolean(await prisma.purchase.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "PARTY": return Boolean(await prisma.party.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "TRANSPORT_TRIP": return Boolean(await prisma.transportTrip.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "TRUCK": return Boolean(await prisma.truck.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "DRIVER": return Boolean(await prisma.driver.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "EXPENSE": return Boolean(await prisma.expense.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "REVENUE": return Boolean(await prisma.revenue.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "FINANCIAL_VOUCHER": return Boolean(await prisma.financialVoucher.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "JOURNAL_ENTRY": return Boolean(await prisma.journalEntry.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "BANK_TRANSFER": return Boolean(await prisma.bankTransfer.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "FACTORY_MAINTENANCE": return Boolean(await prisma.factoryMaintenance.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "EMPLOYEE": return Boolean(await prisma.employee.findUnique({ where: { id: entityId }, select: { id: true } }));
    case "EXTERNAL_WORKER": return Boolean(await prisma.externalWorker.findUnique({ where: { id: entityId }, select: { id: true } }));
    default: return false;
  }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const entityType = params.get("entityType")?.toUpperCase();
  const entityId = Number(params.get("entityId"));
  if (!entityType || !Number.isInteger(entityId)) return NextResponse.json({ error: "مرجع المرفقات غير صحيح" }, { status: 400 });
  try {
    await authorizeAttachmentEntity(request, entityType, entityId, "READ");
    return NextResponse.json(await prisma.attachment.findMany({ where: { entityType, entityId }, orderBy: { uploadedAt: "desc" } }));
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
  }
}

export async function POST(request: Request) {
  let fullPath: string | null = null;
  try {
    const form = await request.formData();
    const file = form.get("file");
    const entityType = String(form.get("entityType") ?? "").toUpperCase();
    const entityId = Number(form.get("entityId"));
    const uploadedBy = String(form.get("uploadedBy") ?? "system").trim() || "system";
    if (!(file instanceof File) || !knownEntities.has(entityType) || !Number.isInteger(entityId) || entityId <= 0) {
      return NextResponse.json({ error: "الملف أو مرجع المستند غير صحيح" }, { status: 400 });
    }
    const auth = await authorizeAttachmentEntity(request, entityType, entityId, "CREATE");
    if (!(await entityExists(entityType, entityId))) {
      return NextResponse.json({ error: "المستند المرتبط بالمرفق غير موجود" }, { status: 404 });
    }
    const extension = allowed.get(file.type);
    if (!extension || file.size <= 0 || file.size > maximumSize) {
      return NextResponse.json({ error: "يسمح بملفات PDF/JPG/PNG/Excel حتى 10MB" }, { status: 400 });
    }
    await prisma.$transaction((tx) => assertTenantLimit(tx, auth.tenantId, "STORAGE", file.size));
    const originalExtension = extname(file.name).toLowerCase();
    if (originalExtension && originalExtension !== extension && !(extension === ".jpg" && originalExtension === ".jpeg")) {
      return NextResponse.json({ error: "امتداد الملف لا يطابق نوعه" }, { status: 400 });
    }
    const storedName = `${Date.now()}-${randomUUID()}${extension}`;
    const configuredDirectory = process.env.ATTACHMENT_STORAGE_DIR;
    const directory = resolve(configuredDirectory ?? join(process.cwd(), "storage", "attachments"));
    await mkdir(directory, { recursive: true });
    fullPath = join(directory, storedName);
    await writeFile(fullPath, new Uint8Array(await file.arrayBuffer()), { flag: "wx" });
    const attachment = await prisma.$transaction(async (tx) => {
      const saved = await tx.attachment.create({ data: { entityType, entityId, originalName: file.name.slice(0, 255), storedName, storagePath: configuredDirectory ? fullPath! : `storage/attachments/${storedName}`, mimeType: file.type, size: file.size, uploadedBy, notes: String(form.get("notes") ?? "").trim() || null } });
      await audit(tx, { action: "ATTACH", entityType, entityId, userId: uploadedBy, metadata: { attachmentId: saved.id, fileName: saved.originalName, size: saved.size } });
      return saved;
    });
    return NextResponse.json(attachment, { status: 201 });
  } catch (error) {
    console.error(error);
    if (fullPath) await unlink(fullPath).catch(() => undefined);
    if (error instanceof AuthError) {
      const response = authErrorResponse(error);
      return NextResponse.json({ error: response.message, code: response.code }, { status: response.status });
    }
    if (error instanceof PlatformError) { const response = platformErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); }
    return NextResponse.json({ error: "تعذر رفع المرفق" }, { status: 500 });
  }
}
