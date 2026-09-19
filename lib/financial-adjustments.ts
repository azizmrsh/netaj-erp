import { Prisma } from "@prisma/client";
import { assertOpenAccountingPeriod, createBalancedJournal, reverseJournalEntry } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { companyCurrency, functionalAmount } from "@/lib/currency";

type Tx = Prisma.TransactionClient;
const actor = (value: string | number | null | undefined) => value == null ? "system" : String(value);
const text = (value: unknown) => String(value ?? "").trim() || null;
const date = (value: unknown) => { const parsed = value ? new Date(String(value)) : new Date(); if (Number.isNaN(parsed.getTime())) throw new FinancialAdjustmentError("INVALID_INPUT", "التاريخ غير صحيح"); return parsed; };
const money = (value: unknown, label: string) => { try { const parsed = new Prisma.Decimal(String(value ?? 0)).toDecimalPlaces(2); if (parsed.isNegative()) throw new Error(); return parsed; } catch { throw new FinancialAdjustmentError("INVALID_INPUT", `${label} غير صحيح`); } };

export class FinancialAdjustmentError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS", message: string) { super(message); this.name = "FinancialAdjustmentError"; }
}

export async function createCreditDebitNote(tx: Tx, input: Record<string, unknown>, userId?: string | number | null) {
  const noteType = String(input.noteType ?? "").toUpperCase(), direction = String(input.direction ?? "").toUpperCase();
  if (!['CREDIT_NOTE','DEBIT_NOTE'].includes(noteType) || !['SALES','PURCHASE'].includes(direction)) throw new FinancialAdjustmentError("INVALID_INPUT", "نوع الإشعار أو اتجاهه غير صحيح");
  const noteDate = date(input.noteDate), sourceId = Number(direction === "SALES" ? input.saleId : input.purchaseId);
  const amountBeforeVat = money(input.amountBeforeVat, "المبلغ قبل الضريبة"), vatAmount = money(input.vatAmount, "الضريبة"), totalAmount = amountBeforeVat.plus(vatAmount).toDecimalPlaces(2);
  const reason = text(input.reason);
  if (!Number.isInteger(sourceId) || !amountBeforeVat.gt(0) || !reason) throw new FinancialAdjustmentError("INVALID_INPUT", "الفاتورة والسبب والمبلغ مطلوبة");
  const source = direction === "SALES" ? await tx.sale.findUnique({ where: { id: sourceId } }) : await tx.purchase.findUnique({ where: { id: sourceId } });
  if (!source || source.status !== "COMPLETED") throw new FinancialAdjustmentError("NOT_FOUND", "الفاتورة الأصلية غير موجودة أو غير مرحلة");
  const sourceFilter = direction === "SALES" ? { saleId: sourceId } : { purchaseId: sourceId };
  const previous = await tx.creditDebitNote.findMany({ where: { ...sourceFilter, status: "POSTED" } });
  if (noteType === "CREDIT_NOTE") {
    const available = previous.reduce((sum, note) => note.noteType === "DEBIT_NOTE" ? sum.plus(note.totalAmount) : sum.minus(note.totalAmount), new Prisma.Decimal(source.totalAmount));
    if (totalAmount.gt(available)) throw new FinancialAdjustmentError("INVALID_INPUT", `قيمة الإشعار الدائن تتجاوز الرصيد القابل للتخفيض ${available.toFixed(2)}`);
  }
  const noteNumber = await nextDocumentNumber(tx, noteType === "CREDIT_NOTE" ? "CN" : "DBN", noteDate);
  const exchangeRate = new Prisma.Decimal(source.exchangeRate || 1);
  const functionalAmountBeforeVat = functionalAmount(amountBeforeVat, exchangeRate), functionalVatAmount = functionalAmount(vatAmount, exchangeRate), functionalTotalAmount = functionalAmount(totalAmount, exchangeRate);
  const sourceDate = "invoiceDate" in source ? source.invoiceDate : source.purchaseDate;
  const row = await tx.creditDebitNote.create({ data: { noteNumber, noteDate, noteType, direction, partyId: source.partyId,
    ...(direction === "SALES" ? { saleId: sourceId } : { purchaseId: sourceId }), amountBeforeVat, vatAmount, totalAmount,
    currency: source.currency, exchangeRate, rateDate: source.rateDate ?? sourceDate,
    functionalAmountBeforeVat, functionalVatAmount, functionalTotalAmount,
    reason, notes: text(input.notes) }, include: { party: true, sale: true, purchase: true } });
  await audit(tx, { action: "CREATE", entityType: "CREDIT_DEBIT_NOTE", entityId: row.id, userId: actor(userId), metadata: { noteType, direction, sourceId } });
  return row;
}

export async function postCreditDebitNote(tx: Tx, id: number, userId?: string | number | null) {
  const note = await tx.creditDebitNote.findUnique({ where: { id } });
  if (!note) throw new FinancialAdjustmentError("NOT_FOUND", "الإشعار غير موجود");
  if (note.status === "POSTED") return tx.creditDebitNote.findUniqueOrThrow({ where: { id }, include: { journalEntry: { include: { lines: true } }, party: true } });
  if (note.status !== "DRAFT") throw new FinancialAdjustmentError("INVALID_STATUS", "لا يمكن ترحيل الإشعار في حالته الحالية");
  await assertOpenAccountingPeriod(tx, note.noteDate);
  const company = await companyCurrency(tx);
  const credit = note.noteType === "CREDIT_NOTE", sales = note.direction === "SALES";
  const lines = sales
    ? credit
      ? [{ mappingKey: "SALES_REVENUE", debit: note.functionalAmountBeforeVat, transactionDebit: note.amountBeforeVat }, ...(note.vatAmount.isZero() ? [] : [{ mappingKey: "VAT_PAYABLE", debit: note.functionalVatAmount, transactionDebit: note.vatAmount }]), { mappingKey: "ACCOUNTS_RECEIVABLE", credit: note.functionalTotalAmount, transactionCredit: note.totalAmount, partyId: note.partyId }]
      : [{ mappingKey: "ACCOUNTS_RECEIVABLE", debit: note.functionalTotalAmount, transactionDebit: note.totalAmount, partyId: note.partyId }, { mappingKey: "SALES_REVENUE", credit: note.functionalAmountBeforeVat, transactionCredit: note.amountBeforeVat }, ...(note.vatAmount.isZero() ? [] : [{ mappingKey: "VAT_PAYABLE", credit: note.functionalVatAmount, transactionCredit: note.vatAmount }])]
    : credit
      ? [{ mappingKey: "ACCOUNTS_PAYABLE", debit: note.functionalTotalAmount, transactionDebit: note.totalAmount, partyId: note.partyId }, { mappingKey: "INVENTORY_PURCHASES", credit: note.functionalAmountBeforeVat, transactionCredit: note.amountBeforeVat }, ...(note.vatAmount.isZero() ? [] : [{ mappingKey: "INPUT_VAT", credit: note.functionalVatAmount, transactionCredit: note.vatAmount }])]
      : [{ mappingKey: "INVENTORY_PURCHASES", debit: note.functionalAmountBeforeVat, transactionDebit: note.amountBeforeVat }, ...(note.vatAmount.isZero() ? [] : [{ mappingKey: "INPUT_VAT", debit: note.functionalVatAmount, transactionDebit: note.vatAmount }]), { mappingKey: "ACCOUNTS_PAYABLE", credit: note.functionalTotalAmount, transactionCredit: note.totalAmount, partyId: note.partyId }];
  const journal = await createBalancedJournal(tx, { entryDate: note.noteDate, description: `${credit ? "إشعار دائن" : "إشعار مدين"} ${note.noteNumber}: ${note.reason}`,
    referenceType: "CREDIT_DEBIT_NOTE", referenceId: note.id, referenceNumber: note.noteNumber,
    transactionCurrencyCode: note.currency, functionalCurrencyCode: company.baseCurrencyCode, exchangeRate: note.exchangeRate, rateDate: note.rateDate, lines });
  const posted = await tx.creditDebitNote.update({ where: { id }, data: { status: "POSTED", journalEntryId: journal.id, postedAt: new Date() }, include: { journalEntry: { include: { lines: true } }, party: true, sale: true, purchase: true } });
  await audit(tx, { action: "POST", entityType: "CREDIT_DEBIT_NOTE", entityId: id, userId: actor(userId), metadata: { journalId: journal.id } });
  return posted;
}

export async function cancelCreditDebitNote(tx: Tx, id: number, reason: unknown, userId?: string | number | null) {
  const note = await tx.creditDebitNote.findUnique({ where: { id } });
  if (!note) throw new FinancialAdjustmentError("NOT_FOUND", "الإشعار غير موجود");
  if (note.status === "CANCELLED") return note;
  if (note.status !== "POSTED" || !note.journalEntryId) throw new FinancialAdjustmentError("INVALID_STATUS", "يمكن إلغاء الإشعار المرحل فقط");
  const explanation = text(reason);
  if (!explanation) throw new FinancialAdjustmentError("INVALID_INPUT", "سبب الإلغاء مطلوب");
  await reverseJournalEntry(tx, { originalId: note.journalEntryId, referenceType: "CREDIT_DEBIT_NOTE_REVERSAL", referenceId: note.id, referenceNumber: note.noteNumber, description: `عكس ${note.noteNumber}: ${explanation}` });
  const cancelled = await tx.creditDebitNote.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: `${note.notes ?? ""}\nسبب الإلغاء: ${explanation}`.trim() } });
  await audit(tx, { action: "CANCEL", entityType: "CREDIT_DEBIT_NOTE", entityId: id, userId: actor(userId), metadata: { reason: explanation } });
  return cancelled;
}

export async function createAccountingAdjustment(tx: Tx, input: Record<string, unknown>, userId?: string | number | null) {
  const adjustmentType = String(input.adjustmentType ?? "").toUpperCase();
  if (!["ACCRUAL", "PREPAYMENT", "OPENING_BALANCE", "ADJUSTMENT"].includes(adjustmentType)) throw new FinancialAdjustmentError("INVALID_INPUT", "نوع التسوية غير صحيح");
  const adjustmentDate = date(input.adjustmentDate), description = text(input.description), rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (!description || rawLines.length < 2) throw new FinancialAdjustmentError("INVALID_INPUT", "البيان وطرفا القيد مطلوبان");
  const lines = rawLines.map((raw) => { const row = raw as Record<string, unknown>, accountId = Number(row.accountId), debit = money(row.debit, "المدين"), credit = money(row.credit, "الدائن");
    if (!Number.isInteger(accountId) || debit.eq(credit) || (debit.gt(0) && credit.gt(0)) || (debit.isZero() && credit.isZero())) throw new FinancialAdjustmentError("INVALID_INPUT", "سطر التسوية غير صحيح");
    return { accountId, debit, credit, partyId: row.partyId ? Number(row.partyId) : null, costCenter: text(row.costCenter), description: text(row.description) }; });
  const [accounts, totalDebit, totalCredit] = [await tx.account.findMany({ where: { id: { in: lines.map((line) => line.accountId) }, isActive: true, allowPosting: true } }),
    lines.reduce((sum, line) => sum.plus(line.debit), new Prisma.Decimal(0)), lines.reduce((sum, line) => sum.plus(line.credit), new Prisma.Decimal(0))];
  if (accounts.length !== new Set(lines.map((line) => line.accountId)).size) throw new FinancialAdjustmentError("NOT_FOUND", "أحد الحسابات غير صالح للترحيل");
  if (!totalDebit.eq(totalCredit) || !totalDebit.gt(0)) throw new FinancialAdjustmentError("INVALID_INPUT", "قيد التسوية غير متوازن");
  const adjustmentNumber = await nextDocumentNumber(tx, "ADJ", adjustmentDate);
  const row = await tx.accountingAdjustment.create({ data: { adjustmentNumber, adjustmentDate, adjustmentType, description,
    referenceNumber: text(input.referenceNumber), notes: text(input.notes), lines: { create: lines } }, include: { lines: { include: { account: true } } } });
  await audit(tx, { action: "CREATE", entityType: "ACCOUNTING_ADJUSTMENT", entityId: row.id, userId: actor(userId), metadata: { adjustmentType, total: totalDebit.toString() } });
  return row;
}

export async function postAccountingAdjustment(tx: Tx, id: number, userId?: string | number | null) {
  const adjustment = await tx.accountingAdjustment.findUnique({ where: { id }, include: { lines: true } });
  if (!adjustment) throw new FinancialAdjustmentError("NOT_FOUND", "قيد التسوية غير موجود");
  if (adjustment.status === "POSTED") return tx.accountingAdjustment.findUniqueOrThrow({ where: { id }, include: { journalEntry: { include: { lines: true } }, lines: { include: { account: true } } } });
  if (adjustment.status !== "DRAFT") throw new FinancialAdjustmentError("INVALID_STATUS", "لا يمكن ترحيل التسوية في حالتها الحالية");
  await assertOpenAccountingPeriod(tx, adjustment.adjustmentDate);
  const journal = await createBalancedJournal(tx, { entryDate: adjustment.adjustmentDate, description: adjustment.description,
    referenceType: "ACCOUNTING_ADJUSTMENT", referenceId: adjustment.id, referenceNumber: adjustment.adjustmentNumber,
    lines: adjustment.lines.map((line) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit, partyId: line.partyId,
      costCenter: line.costCenter, description: line.description ?? adjustment.description })) });
  const posted = await tx.accountingAdjustment.update({ where: { id }, data: { status: "POSTED", journalEntryId: journal.id, postedAt: new Date() }, include: { journalEntry: { include: { lines: true } }, lines: { include: { account: true } } } });
  await audit(tx, { action: "POST", entityType: "ACCOUNTING_ADJUSTMENT", entityId: id, userId: actor(userId), metadata: { journalId: journal.id } });
  return posted;
}

export async function cancelAccountingAdjustment(tx: Tx, id: number, reason: unknown, userId?: string | number | null) {
  const adjustment = await tx.accountingAdjustment.findUnique({ where: { id } });
  if (!adjustment) throw new FinancialAdjustmentError("NOT_FOUND", "قيد التسوية غير موجود");
  if (adjustment.status === "CANCELLED") return adjustment;
  if (adjustment.status !== "POSTED" || !adjustment.journalEntryId) throw new FinancialAdjustmentError("INVALID_STATUS", "يمكن إلغاء التسوية المرحلة فقط");
  const explanation = text(reason);
  if (!explanation) throw new FinancialAdjustmentError("INVALID_INPUT", "سبب الإلغاء مطلوب");
  await reverseJournalEntry(tx, { originalId: adjustment.journalEntryId, referenceType: "ACCOUNTING_ADJUSTMENT_REVERSAL", referenceId: adjustment.id,
    referenceNumber: adjustment.adjustmentNumber, description: `عكس ${adjustment.adjustmentNumber}: ${explanation}` });
  const cancelled = await tx.accountingAdjustment.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: `${adjustment.notes ?? ""}\nسبب الإلغاء: ${explanation}`.trim() } });
  await audit(tx, { action: "CANCEL", entityType: "ACCOUNTING_ADJUSTMENT", entityId: id, userId: actor(userId), metadata: { reason: explanation } });
  return cancelled;
}

export function financialAdjustmentErrorResponse(error: unknown) {
  if (error instanceof FinancialAdjustmentError) return { status: error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_STATUS" ? 409 : 400, message: error.message };
  return { status: 500, message: "تعذر تنفيذ الإجراء المالي" };
}
