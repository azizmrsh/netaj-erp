import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertOpenAccountingPeriod, createBalancedJournal } from "@/lib/accounting";

export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const referenceType = params.get("referenceType")?.toUpperCase();
    const [accounts, mappings, periods, journals] = await Promise.all([
      prisma.account.findMany({ orderBy: { code: "asc" } }),
      prisma.accountingMapping.findMany({ include: { account: true }, orderBy: { key: "asc" } }),
      prisma.accountingPeriod.findMany({ orderBy: { startDate: "desc" } }),
      prisma.journalEntry.findMany({ where: referenceType ? { referenceType } : {}, include: { lines: { include: { account: true } } }, orderBy: [{ entryDate: "desc" }, { id: "desc" }], take: 100 }),
    ]);
    return NextResponse.json({ accounts, mappings, periods, journals });
  } catch (error) { console.error(error); return NextResponse.json({ error: "تعذر تحميل الأساس المحاسبي" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const entryDate = new Date(String(body.entryDate ?? "")), description = String(body.description ?? "").trim();
    const lines = Array.isArray(body.lines) ? body.lines as Record<string, unknown>[] : [];
    if (Number.isNaN(entryDate.getTime()) || !description || lines.length < 2) return NextResponse.json({ error: "التاريخ والبيان وسطران على الأقل مطلوبة" }, { status: 400 });
    const referenceNumber = String(body.referenceNumber ?? `MANUAL-${Date.now()}`).trim();
    const journal = await prisma.$transaction(async (tx) => {
      await assertOpenAccountingPeriod(tx, entryDate);
      return createBalancedJournal(tx, { entryDate, description, referenceType: "MANUAL_JOURNAL", referenceId: Date.now(), referenceNumber,
        lines: lines.map((line) => ({ accountId: Number(line.accountId), debit: String(line.debit ?? 0), credit: String(line.credit ?? 0),
          partyId: line.partyId ? Number(line.partyId) : null, description: String(line.description ?? description) })) });
    });
    return NextResponse.json(journal, { status: 201 });
  } catch (error) { console.error(error); return NextResponse.json({ error: error instanceof Error ? error.message : "تعذر إنشاء القيد" }, { status: 400 }); }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const key = String(body.key ?? "").trim().toUpperCase();
    const accountId = Number(body.accountId);
    if (!key || !Number.isInteger(accountId) || accountId <= 0) {
      return NextResponse.json({ error: "مفتاح الربط والحساب مطلوبان" }, { status: 400 });
    }
    const account = await prisma.account.findUnique({ where: { id: accountId } });
    if (!account?.isActive || !account.allowPosting) {
      return NextResponse.json({ error: "الحساب غير صالح للترحيل" }, { status: 400 });
    }
    const mapping = await prisma.accountingMapping.upsert({
      where: { key }, create: { key, accountId }, update: { accountId }, include: { account: true },
    });
    return NextResponse.json(mapping);
  } catch (error) { console.error(error); return NextResponse.json({ error: "تعذر تحديث ربط الحساب" }, { status: 500 }); }
}
