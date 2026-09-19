import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { buildMigrationCertificate, MigrationCertificationError, serializeCertificate } from "@/lib/migration-certification";
import { prisma } from "@/lib/prisma";

function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof MigrationCertificationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
  console.error(error); return NextResponse.json({ error: "تعذر إنشاء شهادة مطابقة الترحيل" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "READ" });
    const certificates = await prisma.migrationCertificate.findMany({ include: { batch: { select: { batchNumber: true, sourceFile: true, targetType: true } } }, orderBy: { generatedAt: "desc" }, take: 100 });
    return NextResponse.json(certificates.map(serializeCertificate));
  } catch (error) { return failure(error); }
}

export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "IMPORT", action: "EXECUTE" });
    const body = await request.json() as { importBatchId?: unknown };
    const importBatchId = Number(body.importBatchId);
    if (!Number.isInteger(importBatchId) || importBatchId <= 0) throw new MigrationCertificationError("رقم دفعة الاستيراد غير صالح");
    const certificate = await prisma.$transaction((tx) => buildMigrationCertificate(tx, importBatchId, String(auth.userId)), { timeout: 120_000 });
    return NextResponse.json(certificate, { status: 201 });
  } catch (error) { return failure(error); }
}
