import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { ChequeError } from "@/lib/cheques";
export function chequeError(error: unknown) {
  if (error instanceof AuthError) { const response = authErrorResponse(error); return NextResponse.json({ error: response.message }, { status: response.status }); }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2021") return NextResponse.json({ error: "يلزم إكمال تحديث قاعدة البيانات لتشغيل دفتر الشيكات." }, { status: 503 });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "رقم الشيك مسجل بالفعل؛ لا يمكن إنشاء نسخة مكررة." }, { status: 409 });
  return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر تنفيذ عملية الشيك" }, { status: error instanceof ChequeError ? error.status : 400 });
}
