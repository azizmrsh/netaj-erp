import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { assertOpenAccountingPeriod, createBalancedJournal, ensureAccountingFoundation, reverseJournalEntry } from "@/lib/accounting";
import { exchangeRateAt, companyCurrency, functionalAmount } from "@/lib/currency";
import { nextDocumentNumber } from "@/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export class FxRevaluationError extends Error {
  constructor(message: string) { super(message); this.name = "FxRevaluationError"; }
}

const asDate = (value: unknown) => {
  const date = new Date(String(value ?? ""));
  if (Number.isNaN(date.getTime())) throw new FxRevaluationError("تاريخ إعادة التقييم غير صحيح");
  return date;
};

export async function previewFxRevaluation(tx: Tx, input: Record<string, unknown>) {
  const revaluationDate = asDate(input.revaluationDate);
  const currencyCode = String(input.currencyCode ?? "").trim().toUpperCase();
  const fx = await exchangeRateAt(tx, currencyCode, revaluationDate);
  if (currencyCode === fx.company.baseCurrencyCode) throw new FxRevaluationError("لا يعاد تقييم العملة الوظيفية");
  const [ar, ap, sales, purchases, banks, notes] = await Promise.all([
    tx.accountingMapping.findUnique({ where: { key: "ACCOUNTS_RECEIVABLE" } }),
    tx.accountingMapping.findUnique({ where: { key: "ACCOUNTS_PAYABLE" } }),
    tx.sale.findMany({ where: { currency: currencyCode, status: "COMPLETED", invoiceDate: { lte: revaluationDate } }, include: { allocations: { where: { voucher: { status: "POSTED", voucherDate: { lte: revaluationDate } } } } } }),
    tx.purchase.findMany({ where: { currency: currencyCode, status: "COMPLETED", purchaseDate: { lte: revaluationDate } }, include: { allocations: { where: { voucher: { status: "POSTED", voucherDate: { lte: revaluationDate } } } } } }),
    tx.bankAccount.findMany({ where: { currency: currencyCode, isActive: true }, include: { transactions: { where: { transactionDate: { lte: revaluationDate } }, orderBy: [{ transactionDate: "asc" }, { id: "asc" }] } } }),
    tx.creditDebitNote.findMany({ where: { currency: currencyCode, status: "POSTED", noteDate: { lte: revaluationDate } } }),
  ]);
  if (!ar || !ap) throw new FxRevaluationError("حسابات الذمم غير مهيأة");
  const lines: Array<{ accountId: number; partyId: number | null; sourceType: string; sourceId: number; sourceNumber: string; transactionBalance: Prisma.Decimal; carryingFunctionalAmount: Prisma.Decimal; revaluedFunctionalAmount: Prisma.Decimal; difference: Prisma.Decimal }> = [];
  const noteTotals = (sourceType: "SALE" | "PURCHASE", sourceId: number) => notes.filter((note) => sourceType === "SALE" ? note.saleId === sourceId : note.purchaseId === sourceId).reduce((sum, note) => {
    const sign = note.noteType === "DEBIT_NOTE" ? 1 : -1;
    return { transaction: sum.transaction.plus(new Prisma.Decimal(note.totalAmount).mul(sign)), functional: sum.functional.plus(new Prisma.Decimal(note.functionalTotalAmount).mul(sign)) };
  }, { transaction: new Prisma.Decimal(0), functional: new Prisma.Decimal(0) });
  for (const sale of sales) {
    const paid = sale.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const carryingPaid = sale.allocations.reduce((sum, row) => sum.plus(row.carryingFunctionalAmount), new Prisma.Decimal(0));
    const noteTotal = noteTotals("SALE", sale.id);
    const transactionBalance = new Prisma.Decimal(sale.totalAmount).plus(noteTotal.transaction).minus(paid).toDecimalPlaces(2);
    if (transactionBalance.isZero()) continue;
    const carrying = new Prisma.Decimal(sale.functionalTotalAmount || functionalAmount(sale.totalAmount, sale.exchangeRate)).plus(noteTotal.functional).minus(carryingPaid).toDecimalPlaces(2);
    const revalued = functionalAmount(transactionBalance, fx.rate);
    lines.push({ accountId: ar.accountId, partyId: sale.partyId, sourceType: "SALE", sourceId: sale.id, sourceNumber: sale.invoiceNumber, transactionBalance, carryingFunctionalAmount: carrying, revaluedFunctionalAmount: revalued, difference: revalued.minus(carrying).toDecimalPlaces(2) });
  }
  for (const purchase of purchases) {
    const paid = purchase.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
    const carryingPaid = purchase.allocations.reduce((sum, row) => sum.plus(row.carryingFunctionalAmount), new Prisma.Decimal(0));
    const noteTotal = noteTotals("PURCHASE", purchase.id);
    const transactionBalance = new Prisma.Decimal(purchase.totalAmount).plus(noteTotal.transaction).minus(paid).toDecimalPlaces(2);
    if (transactionBalance.isZero()) continue;
    const carrying = new Prisma.Decimal(purchase.functionalTotalAmount || functionalAmount(purchase.totalAmount, purchase.exchangeRate)).plus(noteTotal.functional).minus(carryingPaid).toDecimalPlaces(2);
    const revalued = functionalAmount(transactionBalance, fx.rate);
    lines.push({ accountId: ap.accountId, partyId: purchase.partyId, sourceType: "PURCHASE", sourceId: purchase.id, sourceNumber: purchase.purchaseNumber, transactionBalance, carryingFunctionalAmount: carrying, revaluedFunctionalAmount: revalued, difference: revalued.minus(carrying).toDecimalPlaces(2) });
  }
  for (const bank of banks) {
    const last = bank.transactions.at(-1);
    const transactionBalance = new Prisma.Decimal(last?.balanceAfter ?? bank.openingBalance);
    if (transactionBalance.isZero()) continue;
    const carrying = bank.transactions.length
      ? bank.transactions.reduce((sum, row) => sum.plus(row.functionalAmountIn).minus(row.functionalAmountOut), new Prisma.Decimal(0)).toDecimalPlaces(2)
      : functionalAmount(bank.openingBalance, bank.transactions[0]?.exchangeRate ?? 1);
    const revalued = functionalAmount(transactionBalance, fx.rate);
    lines.push({ accountId: bank.ledgerAccountId, partyId: null, sourceType: "BANK_ACCOUNT", sourceId: bank.id, sourceNumber: bank.name, transactionBalance, carryingFunctionalAmount: carrying, revaluedFunctionalAmount: revalued, difference: revalued.minus(carrying).toDecimalPlaces(2) });
  }
  return { revaluationDate, currencyCode, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate, lines: lines.filter((line) => !line.difference.isZero()) };
}

export async function createFxRevaluation(tx: Tx, input: Record<string, unknown>, userId?: number | string | null) {
  await ensureAccountingFoundation(tx);
  const preview = await previewFxRevaluation(tx, input);
  const period = await assertOpenAccountingPeriod(tx, preview.revaluationDate);
  const existing = await tx.fxRevaluation.findFirst({ where: { fiscalPeriodId: period.id, currencyCode: preview.currencyCode } });
  if (existing) return tx.fxRevaluation.findUniqueOrThrow({ where: { id: existing.id }, include: { lines: true, journalEntry: { include: { lines: true } }, reversalJournal: true } });
  const revaluationNumber = await nextDocumentNumber(tx, "FXR", preview.revaluationDate);
  const totalGain = preview.lines.reduce((sum, line) => sum.plus(line.difference.lt(0) ? line.difference.abs() : 0), new Prisma.Decimal(0));
  const totalLoss = preview.lines.reduce((sum, line) => sum.plus(line.difference.gt(0) ? line.difference : 0), new Prisma.Decimal(0));
  const revaluation = await tx.fxRevaluation.create({ data: { revaluationNumber, revaluationDate: preview.revaluationDate,
    fiscalYearId: period.fiscalYearId, fiscalPeriodId: period.id, currencyCode: preview.currencyCode, exchangeRate: preview.exchangeRate,
    totalGain, totalLoss, reversalDate: new Date(preview.revaluationDate.getTime() + 86_400_000), notes: String(input.notes ?? "").trim() || null,
    lines: { create: preview.lines } }, include: { lines: true } });
  await audit(tx, { action: "CREATE", entityType: "FX_REVALUATION", entityId: revaluation.id, userId: userId ? String(userId) : undefined, metadata: { currency: preview.currencyCode, rate: preview.exchangeRate.toString(), lineCount: preview.lines.length } });
  return revaluation;
}

export async function postFxRevaluation(tx: Tx, id: number, userId?: number | string | null) {
  const row = await tx.fxRevaluation.findUnique({ where: { id }, include: { lines: true } });
  if (!row) throw new FxRevaluationError("إعادة التقييم غير موجودة");
  if (row.status === "POSTED" || row.status === "REVERSED") return row;
  if (row.status !== "DRAFT") throw new FxRevaluationError("حالة إعادة التقييم لا تسمح بالترحيل");
  await assertOpenAccountingPeriod(tx, row.revaluationDate);
  const journalLines: Array<{ accountId?: number; mappingKey?: string; debit?: Prisma.Decimal; credit?: Prisma.Decimal; partyId?: number | null; description: string }> = [];
  for (const line of row.lines) {
    const asset = line.sourceType !== "PURCHASE";
    if (line.difference.gt(0)) {
      if (asset) journalLines.push({ accountId: line.accountId, debit: line.difference, partyId: line.partyId, description: line.sourceNumber }, { mappingKey: "UNREALIZED_FX_GAIN", credit: line.difference, description: line.sourceNumber });
      else journalLines.push({ mappingKey: "UNREALIZED_FX_LOSS", debit: line.difference, description: line.sourceNumber }, { accountId: line.accountId, credit: line.difference, partyId: line.partyId, description: line.sourceNumber });
    } else {
      const amount = line.difference.abs();
      if (asset) journalLines.push({ mappingKey: "UNREALIZED_FX_LOSS", debit: amount, description: line.sourceNumber }, { accountId: line.accountId, credit: amount, partyId: line.partyId, description: line.sourceNumber });
      else journalLines.push({ accountId: line.accountId, debit: amount, partyId: line.partyId, description: line.sourceNumber }, { mappingKey: "UNREALIZED_FX_GAIN", credit: amount, description: line.sourceNumber });
    }
  }
  if (!journalLines.length) throw new FxRevaluationError("لا توجد فروق عملة لإعادة التقييم");
  const company = await companyCurrency(tx);
  const journal = await createBalancedJournal(tx, { entryDate: row.revaluationDate, description: `إعادة تقييم عملة ${row.currencyCode} — ${row.revaluationNumber}`,
    referenceType: "FX_REVALUATION", referenceId: row.id, referenceNumber: row.revaluationNumber,
    transactionCurrencyCode: company.baseCurrencyCode, functionalCurrencyCode: company.baseCurrencyCode, exchangeRate: 1, lines: journalLines });
  const posted = await tx.fxRevaluation.update({ where: { id: row.id }, data: { status: "POSTED", journalEntryId: journal.id, postedAt: new Date(), postedBy: userId ? String(userId) : null }, include: { lines: true, journalEntry: { include: { lines: true } } } });
  await audit(tx, { action: "POST", entityType: "FX_REVALUATION", entityId: row.id, userId: userId ? String(userId) : undefined, metadata: { journalEntryId: journal.id } });
  return posted;
}

export async function reverseFxRevaluation(tx: Tx, id: number, userId?: number | string | null) {
  const row = await tx.fxRevaluation.findUnique({ where: { id } });
  if (!row) throw new FxRevaluationError("إعادة التقييم غير موجودة");
  if (row.status === "REVERSED") return row;
  if (row.status !== "POSTED" || !row.journalEntryId || !row.reversalDate) throw new FxRevaluationError("لا يمكن عكس إعادة التقييم قبل ترحيلها");
  await assertOpenAccountingPeriod(tx, row.reversalDate);
  const reversal = await reverseJournalEntry(tx, { originalId: row.journalEntryId, referenceType: "FX_REVALUATION_REVERSAL", referenceId: row.id, referenceNumber: row.revaluationNumber, description: `عكس إعادة التقييم ${row.revaluationNumber}` });
  const reversed = await tx.fxRevaluation.update({ where: { id: row.id }, data: { status: "REVERSED", reversalJournalEntryId: reversal.id, reversedAt: new Date(), reversedBy: userId ? String(userId) : null }, include: { lines: true, journalEntry: true, reversalJournal: true } });
  await audit(tx, { action: "REVERSE", entityType: "FX_REVALUATION", entityId: row.id, userId: userId ? String(userId) : undefined, metadata: { reversalJournalEntryId: reversal.id } });
  return reversed;
}
