import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest } from "@/lib/api-auth";
import { chequeWorkspace, createCheque, createChequeBook } from "@/lib/cheques";
import { chequeError } from "./errors";
export async function GET(request: Request) {
  try { await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" }); return NextResponse.json(await prisma.$transaction(tx => chequeWorkspace(tx, new URL(request.url).searchParams.get("direction") ?? undefined))); }
  catch (error) { return chequeError(error); }
}
export async function POST(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" }), body = await request.json();
    const result = await prisma.$transaction(async tx => body.kind === "BOOK" ? await createChequeBook(tx, body, String(auth.userId)) : await createCheque(tx, body, String(auth.userId)));
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return chequeError(error); }
}
