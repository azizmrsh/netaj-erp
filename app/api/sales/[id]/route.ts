import { NextResponse } from "next/server";
import { authorizeRequest } from "@/lib/api-auth";
import { postSalesInvoiceJournal, reverseJournalEntry } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await authorizeRequest(request, { moduleKey: "SALES", action: "READ" }), id = Number((await params).id); const row = await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, () => prisma.sale.findUnique({ where: { id }, include: { party: { include: { address: true } }, items: { include: { item: { include: { unit: true } } } }, creditDebitNotes: true } })); return row ? NextResponse.json(row) : NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحميل الفاتورة" }, { status: 403 }); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "SALES", action: "POST" }), id = Number((await params).id), body = await request.json() as Record<string, unknown>, action = String(body.action ?? "").toUpperCase();
    return await runWithDataScope({ tenantId: context.tenantId, companyId: context.companyId }, async () => {
      const current = await prisma.sale.findUnique({ where: { id } }); if (!current) return NextResponse.json({ error: "الفاتورة غير موجودة" }, { status: 404 });
      if (action === "POST") {
        if (current.status === "PENDING") return NextResponse.json({ error: "يجب اعتماد الفاتورة قبل الترحيل" }, { status: 409 });
        if (current.status === "CANCELLED") return NextResponse.json({ error: "لا يمكن ترحيل فاتورة ملغاة" }, { status: 409 });
        const result = await prisma.$transaction(async (tx) => { const journal = await postSalesInvoiceJournal(tx, id); const sale = await tx.sale.update({ where: { id }, data: { status: "POSTED" } }); await audit(tx, { action: "SALES_INVOICE_POST", entityType: "SALES_INVOICE", entityId: id, userId: String(context.userId), metadata: { journalId: journal.id } }); return { sale, journal }; }); return NextResponse.json(result);
      }
      if (action === "CANCEL") {
        const reason = String(body.reason ?? "").trim(); if (reason.length < 3) return NextResponse.json({ error: "سبب الإلغاء مطلوب" }, { status: 400 });
        const result = await prisma.$transaction(async (tx) => { const journal = await tx.journalEntry.findFirst({ where: { referenceType: "SALES_INVOICE", referenceId: id, status: "POSTED" } }); const reversal = journal ? await reverseJournalEntry(tx, { originalId: journal.id, description: `عكس فاتورة ${current.invoiceNumber}: ${reason}`, referenceType: "SALES_INVOICE_REVERSAL", referenceId: id, referenceNumber: current.invoiceNumber }) : null; const sale = await tx.sale.update({ where: { id }, data: { status: "CANCELLED", notes: [current.notes, `سبب الإلغاء: ${reason}`].filter(Boolean).join("\n") } }); await audit(tx, { action: "SALES_INVOICE_CANCEL", entityType: "SALES_INVOICE", entityId: id, userId: String(context.userId), metadata: { reason, reversalId: reversal?.id } }); return { sale, reversal }; }); return NextResponse.json(result);
      }
      return NextResponse.json({ error: "الإجراء غير مدعوم" }, { status: 400 });
    });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تحديث الفاتورة" }, { status: 400 }); }
}
