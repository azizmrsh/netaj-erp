import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { accountDirectory, AccountDirectoryError, deleteAccount, saveAccount } from "@/lib/account-directory";

function failure(error: unknown) {
  if (error instanceof AuthError) { const result = authErrorResponse(error); return NextResponse.json({ error: result.message }, { status: result.status }); }
  return NextResponse.json({ error: error instanceof AccountDirectoryError ? error.message : "تعذر تنفيذ عملية الحساب" }, { status: error instanceof AccountDirectoryError ? error.status : 500 });
}
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return await runWithDataScope(auth, async () => {
      const id = Number(new URL(request.url).searchParams.get("auditAccountId"));
      if (id > 0) return NextResponse.json(await prisma.auditLog.findMany({ where: { entityType: "ACCOUNT", entityId: id }, orderBy: { id: "desc" }, take: 100 }));
      return NextResponse.json(await prisma.$transaction(tx => accountDirectory(tx)));
    });
  } catch (error) { return failure(error); }
}
async function save(request: Request, editing: boolean) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" });
    const body = await request.json() as Record<string, unknown>;
    return await runWithDataScope(auth, async () => {
      let id = Number(body.id);
      if (editing && !id && body.code) id = (await prisma.account.findUnique({ where: { code: String(body.code) } }))?.id ?? 0;
      if (editing && !id) throw new AccountDirectoryError("الحساب غير موجود", 404);
      return NextResponse.json(await prisma.$transaction(tx => saveAccount(tx, body, String(auth.userId), editing ? id : undefined)), { status: editing ? 200 : 201 });
    });
  } catch (error) { return failure(error); }
}
export const POST = (request: Request) => save(request, false);
export const PATCH = (request: Request) => save(request, true);
export async function DELETE(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "MANAGE" });
    const params = new URL(request.url).searchParams;
    return await runWithDataScope(auth, async () => {
      const id = Number(params.get("id")) || (await prisma.account.findUnique({ where: { code: params.get("code") ?? "" } }))?.id;
      if (!id) throw new AccountDirectoryError("الحساب غير موجود", 404);
      return NextResponse.json(await prisma.$transaction(tx => deleteAccount(tx, id, String(auth.userId))));
    });
  } catch (error) { return failure(error); }
}
