import { Prisma } from "@prisma/client";
import { assertOpenAccountingPeriod, reverseJournalEntry } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { validateCostCenterForPosting } from "@/lib/cost-centers";
import { getVerifiedDataScope } from "@/lib/data-scope";
import { nextDocumentNumber } from "@/lib/document-numbering";

type Tx = Prisma.TransactionClient;
type Input = Record<string, unknown>;
export class ManualJournalError extends Error { constructor(message: string, public status = 400) { super(message); } }
const clean = (v: unknown) => String(v ?? "").trim();
async function validated(tx: Tx, input: Input) {
  const scope = await getVerifiedDataScope();
  const entryDate = new Date(clean(input.entryDate));
  if (!Number.isFinite(entryDate.getTime()) || !clean(input.description)) throw new ManualJournalError("التاريخ والبيان مطلوبان");
  const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
  const branchId = input.branchId ? Number(input.branchId) : null;
  if (branchId && !await tx.branch.findFirst({ where: { id: branchId, companyId: scope.companyId, isActive: true } })) throw new ManualJournalError("الفرع غير صالح للشركة");
  if (!Array.isArray(input.lines) || input.lines.length < 2 || input.lines.length > 200) throw new ManualJournalError("يلزم سطران على الأقل وبحد أقصى 200 سطر");
  const lines = [];
  let totalDebit = new Prisma.Decimal(0), totalCredit = new Prisma.Decimal(0);
  for (const raw of input.lines as Input[]) {
    const account = await tx.account.findFirst({ where: { id: Number(raw.accountId), ...scope, isActive: true, allowPosting: true } });
    if (!account) throw new ManualJournalError("اختر حساب حركة نشطًا تابعًا للشركة لكل سطر");
    let debit: Prisma.Decimal, credit: Prisma.Decimal;
    try { debit = new Prisma.Decimal(clean(raw.debit) || 0); credit = new Prisma.Decimal(clean(raw.credit) || 0); } catch { throw new ManualJournalError("مبلغ السطر غير صحيح"); }
    if (!debit.isFinite() || !credit.isFinite() || debit.isNegative() || credit.isNegative() || debit.decimalPlaces() > 2 || credit.decimalPlaces() > 2 || debit.gt(0) === credit.gt(0)) throw new ManualJournalError("السطر يقبل مبلغًا موجبًا في المدين أو الدائن فقط وبمنزلتين عشريتين");
    const costCenterId = raw.costCenterId ? Number(raw.costCenterId) : null;
    await validateCostCenterForPosting(tx, { costCenterId });
    const partyId = raw.partyId ? Number(raw.partyId) : null;
    if (partyId && !await tx.party.findFirst({ where: { id: partyId, ...scope, isActive: true } })) throw new ManualJournalError("الطرف غير صالح للشركة");
    const projectCode = clean(raw.projectCode) || null;
    if (projectCode && !await tx.project.findFirst({ where: { projectNumber: projectCode, ...scope } })) throw new ManualJournalError("رمز المشروع غير موجود في الشركة");
    totalDebit = totalDebit.plus(debit); totalCredit = totalCredit.plus(credit);
    lines.push({ ...scope, accountId: account.id, accountCode: account.code, accountName: account.nameAr, debit, credit, transactionDebit: debit, transactionCredit: credit, transactionCurrencyCode: company.baseCurrencyCode, exchangeRate: new Prisma.Decimal(1), partyId, costCenterId, projectCode, description: clean(raw.description) || clean(input.description) });
  }
  if (!totalDebit.eq(totalCredit)) throw new ManualJournalError("القيد غير متوازن؛ يجب تساوي إجمالي المدين والدائن قبل الحفظ");
  return { entryDate, description: clean(input.description), referenceNumber: clean(input.referenceNumber) || null, branchId, totalDebit, totalCredit, totalTransactionDebit: totalDebit, totalTransactionCredit: totalCredit, transactionCurrencyCode: company.baseCurrencyCode, functionalCurrencyCode: company.baseCurrencyCode, lines };
}

export async function saveManualJournal(tx: Tx, input: Input, userId: string, id?: number) {
  const scope = await getVerifiedDataScope();
  const existing = id ? await tx.journalEntry.findFirst({ where: { id, ...scope }, include: { lines: true } }) : null;
  if (id && (!existing || existing.referenceType !== "MANUAL_JOURNAL" || existing.status !== "DRAFT")) throw new ManualJournalError("يمكن تعديل مسودة قيد يدوي فقط", 409);
  const { lines, ...data } = await validated(tx, input);
  const row = existing
    ? await tx.journalEntry.update({ where: { id }, data: { ...data, lines: { deleteMany: {}, create: lines } }, include: { lines: true } })
    : await tx.journalEntry.create({ data: { ...scope, ...data, referenceType: "MANUAL_JOURNAL", status: "DRAFT", entryNumber: await nextDocumentNumber(tx, "JE", data.entryDate), lines: { create: lines } }, include: { lines: true } });
  await audit(tx, { action: existing ? "JOURNAL_EDIT" : "JOURNAL_CREATE", entityType: "JOURNAL_ENTRY", entityId: row.id, userId, metadata: { before: existing, after: row } });
  return row;
}

export async function manualJournalAction(tx: Tx, id: number, action: string, userId: string) {
  const scope = await getVerifiedDataScope();
  const row = await tx.journalEntry.findFirst({ where: { id, ...scope }, include: { lines: true } });
  if (!row) throw new ManualJournalError("القيد غير موجود", 404);
  if (action === "COPY") return saveManualJournal(tx, { ...row, entryDate: new Date().toISOString().slice(0, 10), description: `نسخة من ${row.entryNumber} — ${row.description ?? ""}`, lines: row.lines.map(line => ({ ...line, debit: String(line.debit), credit: String(line.credit) })) }, userId);
  if (row.referenceType !== "MANUAL_JOURNAL") throw new ManualJournalError("القيد الآلي يُعتمد أو يُلغى من مستنده الأصلي للحفاظ على ترابط الحسابات", 409);
  if (action === "REVERSE") {
    const reversed = await reverseJournalEntry(tx, { originalId: id, referenceType: "MANUAL_JOURNAL_REVERSAL", referenceId: id, description: `عكس القيد ${row.entryNumber}`, referenceNumber: row.entryNumber });
    await audit(tx, { action: "JOURNAL_REVERSE", entityType: "JOURNAL_ENTRY", entityId: id, userId, metadata: { reversalId: reversed.id } });
    return reversed;
  }
  if (action === "CANCEL") {
    if (!["DRAFT", "APPROVED"].includes(row.status)) throw new ManualJournalError("لا يمكن إلغاء قيد مرحل؛ استخدم العكس", 409);
  } else if (action === "APPROVE") {
    if (row.status !== "DRAFT") throw new ManualJournalError("يمكن اعتماد المسودة فقط", 409);
    await validated(tx, { ...row, entryDate: row.entryDate.toISOString(), lines: row.lines });
  } else if (action === "POST") {
    if (row.status === "POSTED") return row;
    if (row.status !== "APPROVED") throw new ManualJournalError("يجب اعتماد القيد قبل الترحيل", 409);
    await validated(tx, { ...row, entryDate: row.entryDate.toISOString(), lines: row.lines });
    await assertOpenAccountingPeriod(tx, row.entryDate);
  } else throw new ManualJournalError("الإجراء غير معروف");
  const result = await tx.journalEntry.update({ where: { id }, data: { status: action === "POST" ? "POSTED" : action === "APPROVE" ? "APPROVED" : "CANCELLED", ...(action === "POST" ? { postedAt: new Date() } : action === "CANCEL" ? { cancelledAt: new Date() } : {}) }, include: { lines: true } });
  await audit(tx, { action: `JOURNAL_${action}`, entityType: "JOURNAL_ENTRY", entityId: id, userId, metadata: { previousStatus: row.status, nextStatus: result.status } });
  return result;
}
