import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { createVoucher, ensureFinanceFoundation, financeErrorResponse } from "@/lib/finance";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
function failure(error: unknown) { const e = error instanceof AuthError ? authErrorResponse(error) : financeErrorResponse(error); return NextResponse.json({ error: e.message }, { status: e.status }); }
export async function GET(request: Request) {
  try {
    const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "READ" });
    return await runWithDataScope(auth, async () => {
      const params = new URL(request.url).searchParams, status = params.get("status")?.toUpperCase(), partyId = Number(params.get("partyId"));
      const vouchers = await prisma.financialVoucher.findMany({ where: { ...(status ? { status } : {}), ...(partyId > 0 ? { partyId } : {}) }, include: { party: true, bankAccount: true, allocations: { include: { sale: true, purchase: true } }, journalEntry: { include: { lines: true } } }, orderBy: [{ voucherDate: "desc" }, { id: "desc" }] });
      if (!params.has("workspace")) return NextResponse.json(vouchers);
      const [banks, parties, accounts, costCenters, branches, transfers, sales, purchases] = await Promise.all([
        prisma.bankAccount.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }), prisma.party.findMany({ where: { isActive: true }, orderBy: { nameAr: "asc" } }), prisma.account.findMany({ where: { isActive: true, allowPosting: true }, orderBy: { code: "asc" } }), prisma.costCenter.findMany({ where: { isActive: true } }), prisma.branch.findMany({ where: { companyId: auth.companyId, isActive: true } }), prisma.bankTransfer.findMany({ include: { fromBankAccount: true, toBankAccount: true }, orderBy: { transferDate: "desc" } }),
        prisma.sale.findMany({ where: { status: { in: ["POSTED", "COMPLETED"] } }, include: { allocations: { where: { voucher: { status: "POSTED" } } } } }), prisma.purchase.findMany({ where: { status: { in: ["POSTED", "COMPLETED"] } }, include: { allocations: { where: { voucher: { status: "POSTED" } } } } }),
      ]);
      const invoices = [...sales.map(s => ({ id: s.id, type: "CUSTOMER_RECEIPT", number: s.invoiceNumber, partyId: s.partyId, currency: s.currency, outstanding: new Prisma.Decimal(s.totalAmount).minus(s.allocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0))).toString() })), ...purchases.map(s => ({ id: s.id, type: "SUPPLIER_PAYMENT", number: s.purchaseNumber, partyId: s.partyId, currency: s.currency, outstanding: new Prisma.Decimal(s.totalAmount).minus(s.allocations.reduce((sum, a) => sum.plus(a.amount), new Prisma.Decimal(0))).toString() }))];
      return NextResponse.json({ vouchers, banks, parties, accounts, costCenters, branches, transfers, invoices });
    });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try { const auth = await authorizeRequest(request, { moduleKey: "ACCOUNTING", action: "CREATE" }), body = await request.json(); const row = await runWithDataScope(auth, () => prisma.$transaction(async tx => { await ensureFinanceFoundation(tx); return createVoucher(tx, { ...body, userId: auth.userId }); })); return NextResponse.json(row, { status: 201 }); }
  catch (error) { return failure(error); }
}
