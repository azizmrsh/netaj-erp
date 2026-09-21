import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { ManualJournalError, manualJournalAction, saveManualJournal } from "@/lib/manual-journals";
function failure(error: unknown) {
  if (error instanceof AuthError) { const e = authErrorResponse(error); return NextResponse.json({ error: e.message }, { status: e.status }); }
  return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ عملية القيد" }, { status: error instanceof ManualJournalError ? error.status : 400 });
}
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return await runWithDataScope(auth, async () => {
      const params = new URL(request.url).searchParams, id = Number(params.get("id"));
      if (id) {
        const journal = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: true } } } });
        if (!journal) throw new ManualJournalError("القيد غير موجود", 404);
        const [audit, attachments] = await Promise.all([prisma.auditLog.findMany({ where: { entityType: "JOURNAL_ENTRY", entityId: id }, orderBy: { id: "desc" }, take: 100 }), prisma.attachment.findMany({ where: { entityType: "JOURNAL_ENTRY", entityId: id } })]);
        return NextResponse.json({ journal, audit, attachments });
      }
      const [journals, accounts, costCenters, branches, company] = await Promise.all([
        prisma.journalEntry.findMany({ include: { lines: true }, orderBy: [{ entryDate: "desc" }, { id: "desc" }] }),
        prisma.account.findMany({ where: { isActive: true, allowPosting: true }, orderBy: { code: "asc" } }),
        prisma.costCenter.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
        prisma.branch.findMany({ where: { companyId: auth.companyId, isActive: true } }),
        prisma.company.findUniqueOrThrow({ where: { id: auth.companyId }, select: { baseCurrencyCode: true } }),
      ]);
      return NextResponse.json({ journals, accounts, costCenters, branches, currency: company.baseCurrencyCode });
    });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const action = String(body.action ?? "SAVE");
    const permission = action === "POST" || action === "REVERSE" ? "POST" : action === "APPROVE" ? "APPROVE" : "MANAGE";
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: permission });
    const result = await runWithDataScope(auth, () => prisma.$transaction(tx => action === "SAVE" ? saveManualJournal(tx, body, String(auth.userId), body.id ? Number(body.id) : undefined) : manualJournalAction(tx, Number(body.id), action, String(auth.userId))));
    return NextResponse.json(result);
  } catch (error) { return failure(error); }
}
