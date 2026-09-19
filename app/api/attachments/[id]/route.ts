import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeAttachmentEntity } from "@/lib/attachment-authorization";
import { AuthError } from "@/lib/auth";
import { authErrorResponse } from "@/lib/api-auth";
import { getPrivateObject } from "@/lib/storage";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 });
    await authorizeAttachmentEntity(request, attachment.entityType, attachment.entityId, "READ");
    const content = await getPrivateObject(attachment.storagePath);
    return new Response(content, { headers: { "Content-Type": attachment.mimeType, "Content-Length": String(content.byteLength), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`, "Cache-Control":"private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { console.error(error); if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message, code: response.code }, { status: response.status }); } return NextResponse.json({ error: "تعذر قراءة المرفق" }, { status: 500 }); }
}
