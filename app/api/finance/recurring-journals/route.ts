import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";
import { createRecurringJournal, recurringJournalWorkspace } from "@/lib/recurring-journals";
import { recurringError } from "./errors";
export async function GET(request: Request) {
  try {
    await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return NextResponse.json(await prisma.$transaction(recurringJournalWorkspace));
  } catch (error) { return recurringError(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" });
    const body = await request.json();
    return NextResponse.json(await prisma.$transaction(tx => createRecurringJournal(tx, body, String(auth.userId))), { status: 201 });
  } catch (error) { return recurringError(error); }
}
