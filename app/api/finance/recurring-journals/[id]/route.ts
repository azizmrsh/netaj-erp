import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";
import { executeRecurringJournal, recordRecurringFailure, RecurringJournalError, setRecurringJournalStatus } from "@/lib/recurring-journals";
import { recurringError } from "../errors";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: rawId } = await context.params, id = Number(rawId), body = await request.json();
    if (!Number.isInteger(id) || id < 1) throw new RecurringJournalError("رقم القيد غير صحيح");
    const action = String(body.action ?? "").toUpperCase();
    if (!["ACTIVATE", "PAUSE", "RUN"].includes(action)) throw new RecurringJournalError("الإجراء غير مدعوم");
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: action === "ACTIVATE" ? "APPROVE" : action === "RUN" ? "POST" : "UPDATE" });
    const userId = String(auth.userId);
    if (action !== "RUN") return NextResponse.json(await prisma.$transaction(tx => setRecurringJournalStatus(tx, id, action, userId)));
    const scheduledFor = new Date(String(body.scheduledFor ?? ""));
    if (!Number.isFinite(scheduledFor.getTime())) throw new RecurringJournalError("موعد التنفيذ مطلوب لمنع تكرار القيد");
    try {
      return NextResponse.json(await prisma.$transaction(tx => executeRecurringJournal(tx, id, scheduledFor, userId)));
    } catch (error) {
      if (!(error instanceof RecurringJournalError && error.status === 409)) await prisma.$transaction(tx => recordRecurringFailure(tx, id, scheduledFor, error, userId));
      throw error;
    }
  } catch (error) { return recurringError(error); }
}
