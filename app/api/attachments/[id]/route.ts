import { readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await params).id);
    const attachment = await prisma.attachment.findUnique({ where: { id } });
    if (!attachment) return NextResponse.json({ error: "المرفق غير موجود" }, { status: 404 });
    const root = resolve(process.env.ATTACHMENT_STORAGE_DIR ?? join(process.cwd(), "storage", "attachments"));
    const path = isAbsolute(attachment.storagePath) ? resolve(attachment.storagePath) : resolve(process.cwd(), attachment.storagePath);
    if (!path.startsWith(`${root}/`)) return NextResponse.json({ error: "مسار المرفق غير صالح" }, { status: 400 });
    const content = await readFile(path);
    return new Response(new Uint8Array(content), { headers: { "Content-Type": attachment.mimeType, "Content-Length": String(attachment.size), "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(attachment.originalName)}`, "X-Content-Type-Options": "nosniff" } });
  } catch (error) { console.error(error); return NextResponse.json({ error: "تعذر قراءة المرفق" }, { status: 500 }); }
}
