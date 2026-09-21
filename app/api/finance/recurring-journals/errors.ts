import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { RecurringJournalError } from "@/lib/recurring-journals";

export function recurringError(error: unknown) {
  if (error instanceof AuthError) {
    const response = authErrorResponse(error);
    return NextResponse.json({ error: response.message }, { status: response.status });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return NextResponse.json({ error: "لم يكتمل تهيئة مخزن القيود الدورية. يلزم تحديث قاعدة البيانات قبل استخدام هذه الشاشة." }, { status: 503 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر معالجة القيد الدوري" }, { status: error instanceof RecurringJournalError ? error.status : 400 });
}
