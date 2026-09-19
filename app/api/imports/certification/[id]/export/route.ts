import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { migrationCertificateFile, MigrationCertificationError, serializeCertificate } from "@/lib/migration-certification";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "READ" });
    const { id } = await context.params;
    const certificate = await prisma.migrationCertificate.findFirst({ where: { id: Number(id) } });
    if (!certificate) throw new MigrationCertificationError("شهادة المطابقة غير موجودة", "NOT_FOUND", 404);
    const format = new URL(request.url).searchParams.get("format") === "pdf" ? "pdf" : "xlsx";
    const file = migrationCertificateFile(serializeCertificate(certificate), format);
    return new NextResponse(file as BodyInit, { headers: { "content-type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "content-disposition": `attachment; filename="${certificate.certificateNumber}.${format}"`, "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
    if (error instanceof MigrationCertificationError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.statusCode });
    console.error(error); return NextResponse.json({ error: "تعذر تصدير شهادة المطابقة" }, { status: 500 });
  }
}
