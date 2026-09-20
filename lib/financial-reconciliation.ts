import { Prisma } from "@prisma/client";
import { assertOpenAccountingPeriod, createBalancedJournal, ensureAccountingFoundation } from "@/lib/accounting";
import { audit } from "@/lib/audit";
import { ensureFinanceFoundation, recordBankMovement } from "@/lib/finance";
import { nextDocumentNumber } from "@/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export class ReconciliationError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS" | "VARIANCE", message: string) {
    super(message);
    this.name = "ReconciliationError";
  }
}

const value = (input: unknown, label: string) => {
  try { return new Prisma.Decimal(String(input ?? 0)).toDecimalPlaces(2); }
  catch { throw new ReconciliationError("INVALID_INPUT", `${label} غير صحيح`); }
};
const date = (input: unknown, end = false) => {
  const raw = String(input ?? "");
  const parsed = new Date(raw.includes("T") ? raw : `${raw}T${end ? "23:59:59.999" : "00:00:00.000"}`);
  if (!raw || Number.isNaN(parsed.getTime())) throw new ReconciliationError("INVALID_INPUT", "التاريخ غير صحيح");
  return parsed;
};
const text = (input: unknown) => String(input ?? "").trim() || null;
const actor = (input: string | number | null | undefined) => input == null ? "system" : String(input);

export async function createBankReconciliation(tx: Tx, input: Record<string, unknown>, userId?: string | number | null) {
  const bankAccountId = Number(input.bankAccountId), periodStart = date(input.periodStart), periodEnd = date(input.periodEnd, true);
  if (!Number.isInteger(bankAccountId) || periodStart > periodEnd) throw new ReconciliationError("INVALID_INPUT", "بيانات فترة التسوية غير صحيحة");
  const statementOpeningBalance = value(input.statementOpeningBalance, "رصيد كشف أول المدة");
  const statementClosingBalance = value(input.statementClosingBalance, "رصيد كشف آخر المدة");
  const transactionIds = [...new Set(Array.isArray(input.transactionIds) ? input.transactionIds.map(Number) : [])];
  if (transactionIds.some((id) => !Number.isInteger(id) || id < 1)) throw new ReconciliationError("INVALID_INPUT", "قائمة الحركات غير صحيحة");

  const [bank, overlapping] = await Promise.all([
    tx.bankAccount.findUnique({ where: { id: bankAccountId } }),
    tx.bankReconciliation.findFirst({ where: { bankAccountId, status: { not: "CANCELLED" }, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } } }),
  ]);
  if (!bank) throw new ReconciliationError("NOT_FOUND", "الحساب البنكي غير موجود");
  if (overlapping) throw new ReconciliationError("INVALID_INPUT", "توجد تسوية بنكية متداخلة مع هذه الفترة");

  const selected = transactionIds.length ? await tx.bankTransaction.findMany({
    where: { id: { in: transactionIds }, bankAccountId, transactionDate: { gte: periodStart, lte: periodEnd }, reconciliationLine: null },
  }) : [];
  if (selected.length !== transactionIds.length) throw new ReconciliationError("INVALID_INPUT", "إحدى الحركات لا تخص الحساب أو الفترة أو سبق تسويتها");
  const throughEnd = await tx.bankTransaction.findMany({ where: { bankAccountId, transactionDate: { lte: periodEnd } }, select: { amountIn: true, amountOut: true } });
  const matchedNet = selected.reduce((sum, row) => sum.plus(row.amountIn).minus(row.amountOut), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const calculatedStatementBalance = statementOpeningBalance.plus(matchedNet).toDecimalPlaces(2);
  const bookClosingBalance = throughEnd.length
    ? throughEnd.reduce((sum, row) => sum.plus(row.amountIn).minus(row.amountOut), new Prisma.Decimal(0)).toDecimalPlaces(2)
    : new Prisma.Decimal(bank.openingBalance).toDecimalPlaces(2);
  const difference = statementClosingBalance.minus(calculatedStatementBalance).toDecimalPlaces(2);
  const reconciliationNumber = await nextDocumentNumber(tx, "BR", periodEnd);
  const row = await tx.bankReconciliation.create({ data: {
    reconciliationNumber, bankAccountId, periodStart, periodEnd, statementOpeningBalance, statementClosingBalance,
    matchedNet, calculatedStatementBalance, bookClosingBalance, difference, notes: text(input.notes),
    lines: { create: selected.map((movement) => ({ bankTransactionId: movement.id, matchedAmount: movement.amountIn.minus(movement.amountOut) })) },
  }, include: { bankAccount: true, lines: { include: { bankTransaction: true } } } });
  await audit(tx, { action: "CREATE", entityType: "BANK_RECONCILIATION", entityId: row.id, userId: actor(userId), metadata: { difference: difference.toString(), matched: selected.length } });
  return row;
}

export async function completeBankReconciliation(tx: Tx, id: number, userId?: string | number | null) {
  const row = await tx.bankReconciliation.findUnique({ where: { id }, include: { lines: { include: { bankTransaction: true } }, bankAccount: true } });
  if (!row) throw new ReconciliationError("NOT_FOUND", "التسوية البنكية غير موجودة");
  if (row.status === "COMPLETED") return row;
  if (row.status !== "DRAFT") throw new ReconciliationError("INVALID_STATUS", "لا يمكن إقفال التسوية في حالتها الحالية");
  const matchedNet = row.lines.reduce((sum, line) => sum.plus(line.bankTransaction.amountIn).minus(line.bankTransaction.amountOut), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const calculated = row.statementOpeningBalance.plus(matchedNet).toDecimalPlaces(2);
  const difference = row.statementClosingBalance.minus(calculated).toDecimalPlaces(2);
  if (difference.abs().gt(0.004)) throw new ReconciliationError("VARIANCE", `لا يمكن إقفال التسوية؛ الفرق ${difference.toFixed(2)}`);
  const completed = await tx.bankReconciliation.update({ where: { id }, data: { status: "COMPLETED", matchedNet, calculatedStatementBalance: calculated, difference, completedAt: new Date(), completedBy: actor(userId) }, include: { bankAccount: true, lines: { include: { bankTransaction: true } } } });
  await audit(tx, { action: "COMPLETE", entityType: "BANK_RECONCILIATION", entityId: id, userId: actor(userId), metadata: { matched: row.lines.length } });
  return completed;
}

export async function deleteDraftBankReconciliation(tx: Tx, id: number, userId?: string | number | null) {
  const row = await tx.bankReconciliation.findUnique({ where: { id }, include: { lines: true } });
  if (!row) throw new ReconciliationError("NOT_FOUND", "التسوية البنكية غير موجودة");
  if (row.status !== "DRAFT") throw new ReconciliationError("INVALID_STATUS", "يمكن حذف مسودة التسوية فقط قبل الاعتماد");
  await tx.bankReconciliation.delete({ where: { id } });
  await audit(tx, { action: "DELETE_DRAFT", entityType: "BANK_RECONCILIATION", entityId: id, userId: actor(userId), metadata: { reconciliationNumber: row.reconciliationNumber, releasedTransactions: row.lines.length } });
  return { deleted: true, id, reconciliationNumber: row.reconciliationNumber };
}

type VatSnapshotLine = { direction: "OUTPUT" | "INPUT"; sourceType: string; sourceId: number; sourceNumber: string; sourceDate: Date; netAmount: Prisma.Decimal; documentVat: Prisma.Decimal; ledgerVat: Prisma.Decimal; variance: Prisma.Decimal; journalEntryId: number | null };

export async function buildVatSnapshot(tx: Tx, periodStart: Date, periodEnd: Date) {
  const [sales, purchases, expenses, revenues, notes, journals] = await Promise.all([
    tx.sale.findMany({ where: { status: { in: ["POSTED", "COMPLETED"] }, invoiceDate: { gte: periodStart, lte: periodEnd }, vatAmount: { not: 0 } } }),
    tx.purchase.findMany({ where: { status: { in: ["POSTED", "COMPLETED"] }, purchaseDate: { gte: periodStart, lte: periodEnd }, vatAmount: { not: 0 } } }),
    tx.expense.findMany({ where: { status: "POSTED", expenseDate: { gte: periodStart, lte: periodEnd }, vatAmount: { not: 0 } } }),
    tx.revenue.findMany({ where: { status: "POSTED", revenueDate: { gte: periodStart, lte: periodEnd }, vatAmount: { not: 0 } } }),
    tx.creditDebitNote.findMany({ where: { status: "POSTED", noteDate: { gte: periodStart, lte: periodEnd }, vatAmount: { not: 0 } } }),
    tx.journalEntry.findMany({ where: { status: "POSTED", referenceType: { in: ["SALES_INVOICE", "SUPPLIER_INVOICE", "EXPENSE", "REVENUE", "CREDIT_DEBIT_NOTE"] } }, include: { lines: { include: { account: { include: { mappings: true } } } } } }),
  ]);
  const byReference = new Map(journals.map((journal) => [`${journal.referenceType}:${journal.referenceId}`, journal]));
  const sourceRows = [
    ...sales.map((row) => ({ direction: "OUTPUT" as const, sourceType: "SALES_INVOICE", sourceId: row.id, sourceNumber: row.invoiceNumber, sourceDate: row.invoiceDate,
      netAmount: row.functionalTotalAmount.isZero() && !row.totalAmount.isZero() ? new Prisma.Decimal(row.subtotal).minus(row.discount).mul(row.exchangeRate) : new Prisma.Decimal(row.functionalSubtotal).minus(row.functionalDiscount),
      documentVat: row.functionalVatAmount.isZero() && !row.vatAmount.isZero() ? row.vatAmount.mul(row.exchangeRate).toDecimalPlaces(2) : row.functionalVatAmount })),
    ...revenues.map((row) => ({ direction: "OUTPUT" as const, sourceType: "REVENUE", sourceId: row.id, sourceNumber: row.voucherNumber, sourceDate: row.revenueDate, netAmount: row.functionalAmountBeforeVat, documentVat: row.functionalVatAmount })),
    ...purchases.map((row) => ({ direction: "INPUT" as const, sourceType: "SUPPLIER_INVOICE", sourceId: row.id, sourceNumber: row.purchaseNumber, sourceDate: row.purchaseDate,
      netAmount: row.functionalTotalAmount.isZero() && !row.totalAmount.isZero() ? new Prisma.Decimal(row.subtotal).minus(row.discount).mul(row.exchangeRate) : new Prisma.Decimal(row.functionalSubtotal).minus(row.functionalDiscount),
      documentVat: row.functionalVatAmount.isZero() && !row.vatAmount.isZero() ? row.vatAmount.mul(row.exchangeRate).toDecimalPlaces(2) : row.functionalVatAmount })),
    ...expenses.map((row) => ({ direction: "INPUT" as const, sourceType: "EXPENSE", sourceId: row.id, sourceNumber: row.voucherNumber, sourceDate: row.expenseDate, netAmount: row.functionalAmountBeforeVat, documentVat: row.functionalVatAmount })),
    ...notes.map((row) => ({ direction: (row.direction === "SALES" ? "OUTPUT" : "INPUT") as "OUTPUT" | "INPUT", sourceType: "CREDIT_DEBIT_NOTE", sourceId: row.id, sourceNumber: row.noteNumber, sourceDate: row.noteDate,
      netAmount: (row.noteType === "CREDIT_NOTE" ? row.functionalAmountBeforeVat.negated() : row.functionalAmountBeforeVat), documentVat: (row.noteType === "CREDIT_NOTE" ? row.functionalVatAmount.negated() : row.functionalVatAmount) })),
  ];
  const lines: VatSnapshotLine[] = sourceRows.map((source) => {
    const journal = byReference.get(`${source.sourceType}:${source.sourceId}`);
    const mappingKey = source.direction === "OUTPUT" ? "VAT_PAYABLE" : "INPUT_VAT";
    const ledgerVat = (journal?.lines ?? []).reduce((sum, line) => {
      if (!line.account?.mappings.some((mapping) => mapping.key === mappingKey)) return sum;
      return source.direction === "OUTPUT" ? sum.plus(line.credit).minus(line.debit) : sum.plus(line.debit).minus(line.credit);
    }, new Prisma.Decimal(0)).toDecimalPlaces(2);
    const documentVat = new Prisma.Decimal(source.documentVat).toDecimalPlaces(2);
    return { ...source, netAmount: new Prisma.Decimal(source.netAmount).toDecimalPlaces(2), documentVat, ledgerVat, variance: documentVat.minus(ledgerVat).toDecimalPlaces(2), journalEntryId: journal?.id ?? null };
  });
  const sum = (direction: "OUTPUT" | "INPUT", field: "documentVat" | "ledgerVat") => lines.filter((line) => line.direction === direction).reduce((total, line) => total.plus(line[field]), new Prisma.Decimal(0)).toDecimalPlaces(2);
  const documentOutputVat = sum("OUTPUT", "documentVat"), documentInputVat = sum("INPUT", "documentVat");
  const ledgerOutputVat = sum("OUTPUT", "ledgerVat"), ledgerInputVat = sum("INPUT", "ledgerVat");
  return { lines, documentOutputVat, documentInputVat, ledgerOutputVat, ledgerInputVat,
    netVatDue: documentOutputVat.minus(documentInputVat).toDecimalPlaces(2),
    variance: documentOutputVat.minus(ledgerOutputVat).abs().plus(documentInputVat.minus(ledgerInputVat).abs()).toDecimalPlaces(2) };
}

export async function createVatReturn(tx: Tx, input: Record<string, unknown>, userId?: string | number | null) {
  await ensureAccountingFoundation(tx);
  const periodStart = date(input.periodStart), periodEnd = date(input.periodEnd, true);
  if (periodStart > periodEnd) throw new ReconciliationError("INVALID_INPUT", "فترة الإقرار غير صحيحة");
  const overlapping = await tx.vatReturn.findFirst({ where: { status: { not: "CANCELLED" }, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } } });
  if (overlapping) throw new ReconciliationError("INVALID_INPUT", "يوجد إقرار ضريبي متداخل مع هذه الفترة");
  const snapshot = await buildVatSnapshot(tx, periodStart, periodEnd);
  const returnNumber = await nextDocumentNumber(tx, "VAT", periodEnd);
  const row = await tx.vatReturn.create({ data: { returnNumber, periodStart, periodEnd,
    documentOutputVat: snapshot.documentOutputVat, documentInputVat: snapshot.documentInputVat,
    ledgerOutputVat: snapshot.ledgerOutputVat, ledgerInputVat: snapshot.ledgerInputVat,
    netVatDue: snapshot.netVatDue, variance: snapshot.variance, notes: text(input.notes),
    lines: { create: snapshot.lines },
  }, include: { lines: true } });
  await audit(tx, { action: "CREATE", entityType: "VAT_RETURN", entityId: row.id, userId: actor(userId), metadata: { variance: snapshot.variance.toString(), sources: snapshot.lines.length } });
  return row;
}

export async function fileVatReturn(tx: Tx, id: number, userId?: string | number | null) {
  await ensureAccountingFoundation(tx);
  const row = await tx.vatReturn.findUnique({ where: { id }, include: { lines: true } });
  if (!row) throw new ReconciliationError("NOT_FOUND", "الإقرار الضريبي غير موجود");
  if (row.status === "FILED" || row.status === "SETTLED") return row;
  if (row.status !== "DRAFT") throw new ReconciliationError("INVALID_STATUS", "لا يمكن اعتماد الإقرار في حالته الحالية");
  if (row.variance.abs().gt(0.004) || row.lines.some((line) => line.variance.abs().gt(0.004) || !line.journalEntryId)) {
    throw new ReconciliationError("VARIANCE", "لا يمكن اعتماد الإقرار قبل مطابقة ضريبة المستندات مع الأستاذ بالكامل");
  }
  const filedAt = new Date();
  await assertOpenAccountingPeriod(tx, filedAt);
  const output = new Prisma.Decimal(row.documentOutputVat), input = new Prisma.Decimal(row.documentInputVat), net = new Prisma.Decimal(row.netVatDue);
  const lines = [
    ...(output.isZero() ? [] : [{ mappingKey: "VAT_PAYABLE", debit: output }]),
    ...(input.isZero() ? [] : [{ mappingKey: "INPUT_VAT", credit: input }]),
    ...(net.gt(0) ? [{ mappingKey: "VAT_SETTLEMENT", credit: net }] : net.lt(0) ? [{ mappingKey: "VAT_RECEIVABLE", debit: net.abs() }] : []),
  ];
  const journal = lines.length ? await createBalancedJournal(tx, { entryDate: filedAt, description: `تسوية الإقرار الضريبي ${row.returnNumber}`, referenceType: "VAT_RETURN_FILE", referenceId: row.id, referenceNumber: row.returnNumber, lines }) : null;
  const filed = await tx.vatReturn.update({ where: { id }, data: { status: "FILED", filingJournalEntryId: journal?.id ?? null, filedAt, filedBy: actor(userId) }, include: { lines: true, filingJournal: { include: { lines: true } } } });
  await audit(tx, { action: "FILE", entityType: "VAT_RETURN", entityId: id, userId: actor(userId), metadata: { journalId: journal?.id ?? null, internalRecord: true } });
  return filed;
}

export async function settleVatReturn(tx: Tx, id: number, bankAccountId: number, settlementDate: unknown, userId?: string | number | null) {
  await ensureFinanceFoundation(tx);
  const row = await tx.vatReturn.findUnique({ where: { id } });
  if (!row) throw new ReconciliationError("NOT_FOUND", "الإقرار الضريبي غير موجود");
  if (row.status === "SETTLED") return row;
  if (row.status !== "FILED") throw new ReconciliationError("INVALID_STATUS", "يجب اعتماد الإقرار قبل تسويته");
  const settledAt = date(settlementDate || new Date().toISOString());
  await assertOpenAccountingPeriod(tx, settledAt);
  const bank = await tx.bankAccount.findUnique({ where: { id: bankAccountId } });
  if (!bank?.isActive) throw new ReconciliationError("NOT_FOUND", "الحساب البنكي غير موجود أو غير نشط");
  const net = new Prisma.Decimal(row.netVatDue);
  const journal = net.isZero() ? null : await createBalancedJournal(tx, { entryDate: settledAt,
    description: `${net.gt(0) ? "سداد" : "استلام مسترد"} الإقرار الضريبي ${row.returnNumber}`,
    referenceType: "VAT_RETURN_SETTLEMENT", referenceId: row.id, referenceNumber: row.returnNumber,
    lines: net.gt(0) ? [{ mappingKey: "VAT_SETTLEMENT", debit: net }, { accountId: bank.ledgerAccountId, credit: net }]
      : [{ accountId: bank.ledgerAccountId, debit: net.abs() }, { mappingKey: "VAT_RECEIVABLE", credit: net.abs() }],
  });
  if (!net.isZero()) await recordBankMovement(tx, { bankAccountId, date: settledAt, type: net.gt(0) ? "VAT_PAYMENT" : "VAT_REFUND",
    ...(net.gt(0) ? { amountOut: net } : { amountIn: net.abs() }), referenceType: "VAT_RETURN_SETTLEMENT", referenceId: row.id,
    referenceNumber: row.returnNumber, description: `تسوية الإقرار الضريبي ${row.returnNumber}` });
  const settled = await tx.vatReturn.update({ where: { id }, data: { status: "SETTLED", settlementJournalEntryId: journal?.id ?? null,
    bankAccountId, settledAt, settledBy: actor(userId) }, include: { filingJournal: true, settlementJournal: { include: { lines: true } }, bankAccount: true, lines: true } });
  await audit(tx, { action: "SETTLE", entityType: "VAT_RETURN", entityId: id, userId: actor(userId), metadata: { journalId: journal?.id ?? null, bankAccountId } });
  return settled;
}

export function reconciliationErrorResponse(error: unknown) {
  if (error instanceof ReconciliationError) return { status: error.code === "NOT_FOUND" ? 404 : error.code === "INVALID_STATUS" || error.code === "VARIANCE" ? 409 : 400, message: error.message };
  return { status: 500, message: "تعذر تنفيذ التسوية المالية" };
}
