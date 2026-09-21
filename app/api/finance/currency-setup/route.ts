import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { authorizeRequest } from "@/lib/api-auth";
import { AuthError, authErrorResponse } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { prisma } from "@/lib/prisma";
import { CurrencySetupError, canManageCurrencyCatalog, currencySetupWorkspace, saveCompanyCurrencySetup, saveCurrencyCatalog } from "@/lib/currency-setup";

export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof AuthError) { const value = authErrorResponse(error); return NextResponse.json({ error: value.message, code: value.code }, { status: value.status }); }
  if (error instanceof CurrencySetupError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "الرمز أو الربط مسجل بالفعل؛ لم تحفظ أي تغييرات" }, { status: 409 });
  console.error(error); return NextResponse.json({ error: "تعذر حفظ إعدادات العملات" }, { status: 500 });
}
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    const data = await runWithDataScope(auth, () => prisma.$transaction(async tx => {
      const canManageCompany = auth.permissions.has("SETTINGS.MANAGE") && auth.companyModules.get("SETTINGS") === true && auth.subscription?.plan.modules.some(row => row.moduleKey === "SETTINGS" && row.enabled) === true;
      return { ...await currencySetupWorkspace(tx), canManageCompany, canManageCatalog: canManageCompany && await canManageCurrencyCatalog(tx, auth.userId) };
    }));
    return NextResponse.json(data);
  } catch (error) { return failure(error); }
}
async function mutate(request: Request, create: boolean) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "SETTINGS", action: "MANAGE" });
    const input = await request.json();
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new CurrencySetupError("بيانات الطلب غير صحيحة");
    if (input.action !== "CATALOG" && !(input.action === "COMPANY" && !create)) throw new CurrencySetupError("الإجراء غير مدعوم");
    const data = await runWithDataScope(auth, () => prisma.$transaction(async tx => {
      if (input.action === "CATALOG") return saveCurrencyCatalog(tx, input, auth.userId, create);
      return saveCompanyCurrencySetup(tx, input, auth.userId);
    }));
    return NextResponse.json(data, { status: create ? 201 : 200 });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) { return mutate(request, true); }
export async function PATCH(request: Request) { return mutate(request, false); }
