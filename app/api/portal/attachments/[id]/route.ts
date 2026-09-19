import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PortalAuthError, withPortalScope } from "@/lib/portal-auth";
import { getPrivateObject } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const attachmentId = Number((await params).id);
    return await withPortalScope(request, async (identityId) => {
      const identity = await prisma.portalIdentity.findUnique({ where: { id: identityId } });
      if (!identity || !JSON.parse(identity.permissionsJson).includes("DOCUMENTS")) {
        throw new PortalAuthError("لا توجد صلاحية للمستندات", "PORTAL_PERMISSION_DENIED", 403);
      }
      const version = await prisma.managedDocumentVersion.findFirst({
        where: { attachmentId, document: { ownerType: "PARTY", ownerId: identity.partyId, status: "ACTIVE" } },
      });
      if (!version) throw new PortalAuthError("المرفق غير موجود", "NOT_FOUND", 404);
      const attachment = await prisma.attachment.findUnique({ where: { id: version.attachmentId } });
      if (!attachment) throw new PortalAuthError("المرفق غير موجود", "NOT_FOUND", 404);
      const content = await getPrivateObject(attachment.storagePath);
      return new Response(content, { headers: {
        "Content-Type": attachment.mimeType, "Content-Length": String(content.byteLength),
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`,
        "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      } });
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر قراءة المرفق" }, { status: error instanceof PortalAuthError ? error.status : 500 });
  }
}
