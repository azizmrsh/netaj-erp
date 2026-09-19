import { NextResponse } from "next/server";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { authorizeRequest } from "@/lib/api-auth";
import { DataImportError, executeImportBatch, rollbackImportBatch, serializeBatch } from "@/lib/data-import";
import { getImportTarget } from "@/lib/import-definitions";
import { prisma } from "@/lib/prisma";
import { enqueueBackgroundJob } from "@/lib/background-jobs";

function errorResponse(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof DataImportError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  console.error(error); return NextResponse.json({ error: "تعذر تنفيذ إجراء دفعة الاستيراد" }, { status: 500 });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await authorizeRequest(request, { moduleKey: "IMPORT", action: "READ" });
    const { id } = await context.params;
    const batch = await prisma.importBatch.findFirst({ where: { id: Number(id) }, include: { rows: { orderBy: [{ sourceSheet: "asc" }, { sourceRow: "asc" }], take: 500 }, links: { orderBy: { id: "asc" } } } });
    if (!batch) throw new DataImportError("دفعة الاستيراد غير موجودة", "NOT_FOUND", 404);
    return NextResponse.json(serializeBatch(batch));
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params, body = await request.json() as { action?: unknown };
    const action = String(body.action ?? "").toUpperCase();
    const batch = await prisma.importBatch.findFirst({ where: { id: Number(id) }, select: { targetType: true, duplicateStrategy: true } });
    if (!batch) throw new DataImportError("دفعة الاستيراد غير موجودة", "NOT_FOUND", 404);
    if (action === "EXECUTE" || action === "QUEUE_EXECUTE") {
      const auth = await authorizeRequest(request, { moduleKey: "IMPORT", action: "EXECUTE" });
      const target = getImportTarget(batch.targetType);
      if (target?.accountingSensitive) await authorizeRequest(request, { moduleKey: "IMPORT", action: "ACCOUNTING_IMPORT" });
      if (["UPDATE", "MERGE"].includes(batch.duplicateStrategy)) await authorizeRequest(request, { moduleKey: "IMPORT", action: "UPDATE_EXISTING" });
      if(action === "QUEUE_EXECUTE") return NextResponse.json(await prisma.$transaction(async tx=>{const result=await enqueueBackgroundJob(tx,{jobType:"IMPORT_EXECUTE",payload:{batchId:Number(id)},idempotencyKey:`import:${id}`,maxAttempts:3},String(auth.userId));await tx.importBatch.update({where:{id:Number(id)},data:{status:"QUEUED"}});return result}),{status:202});
      return NextResponse.json(await prisma.$transaction((tx) => executeImportBatch(tx, Number(id), String(auth.userId)), { timeout: 120_000 }));
    }
    if (action === "ROLLBACK") {
      const auth = await authorizeRequest(request, { moduleKey: "IMPORT", action: "ROLLBACK" });
      return NextResponse.json(await prisma.$transaction((tx) => rollbackImportBatch(tx, Number(id), String(auth.userId)), { timeout: 120_000 }));
    }
    throw new DataImportError("الإجراء غير مدعوم");
  } catch (error) { return errorResponse(error); }
}
