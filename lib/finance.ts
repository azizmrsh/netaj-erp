import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import {
  AccountingError,
  assertOpenAccountingPeriod,
  createBalancedJournal,
  ensureAccountingFoundation,
  reverseJournalEntry,
} from "@/lib/accounting";
import { nextDocumentNumber } from "@/lib/document-numbering";

type Tx = Prisma.TransactionClient;

export class FinanceError extends Error {
  constructor(public readonly code: "INVALID_INPUT" | "NOT_FOUND" | "INVALID_STATUS", message: string) {
    super(message);
    this.name = "FinanceError";
  }
}

const expenseCategories = [
  ["DIESEL", "ديزل"], ["MAINTENANCE", "صيانة"], ["SALARIES", "رواتب وأجور"], ["RENT", "إيجار"],
  ["ELECTRICITY", "كهرباء"], ["WATER", "مياه"], ["TELECOM", "اتصالات"], ["INSURANCE", "تأمين"],
  ["GOV_FEES", "رسوم حكومية"], ["BANK_FEES", "رسوم بنكية"], ["TRANSPORT", "نقل"],
  ["SPARE_PARTS", "قطع غيار"], ["OPERATING_MATERIALS", "مواد تشغيل"], ["MARKETING", "تسويق"],
  ["TRAVEL", "سفر"], ["HOSPITALITY", "ضيافة"], ["ADMIN", "إدارة"], ["FACTORY", "مصنع"], ["OTHER", "أخرى"],
] as const;
const revenueCategories = [
  ["PRODUCT_SALES", "مبيعات المنتجات"], ["TRANSPORT", "إيرادات النقل"],
  ["MANUFACTURING", "رسوم التصنيع والتحسين"], ["STORAGE", "التخزين"],
  ["OTHER_SERVICES", "خدمات أخرى"], ["MISC", "إيرادات متنوعة"],
] as const;
const costCenters = [["ADMIN","الإدارة"],["FACTORY","المصنع"],["WAREHOUSE","المستودع"],["TRANSPORT","النقل"],["SALES","المبيعات"],["PURCHASING","المشتريات"],["PROJECTS","المشاريع"]] as const;

const money = (value: unknown, label = "المبلغ") => {
  try {
    const amount = new Prisma.Decimal(String(value ?? 0)).toDecimalPlaces(2);
    if (amount.isNegative()) throw new Error();
    return amount;
  } catch { throw new FinanceError("INVALID_INPUT", `${label} غير صحيح`); }
};
const clean = (value: unknown) => String(value ?? "").trim() || null;
const parsedDate = (value: unknown) => {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) throw new FinanceError("INVALID_INPUT", "التاريخ غير صحيح");
  return date;
};

export async function ensureFinanceFoundation(tx: Tx) {
  await ensureAccountingFoundation(tx);
  for (const [code, nameAr] of costCenters) {
    await tx.costCenter.upsert({ where: { code }, create: { code, nameAr }, update: {} });
  }
  for (const [index, [code, nameAr]] of expenseCategories.entries()) {
    const account = await tx.account.upsert({ where: { code: `52${String(index + 1).padStart(4, "0")}` },
      create: { code: `52${String(index + 1).padStart(4, "0")}`, nameAr, accountType: "EXPENSE" }, update: {} });
    await tx.expenseCategory.upsert({ where: { code }, create: { code, nameAr, accountId: account.id }, update: {} });
  }
  for (const [index, [code, nameAr]] of revenueCategories.entries()) {
    const account = await tx.account.upsert({ where: { code: `42${String(index + 1).padStart(4, "0")}` },
      create: { code: `42${String(index + 1).padStart(4, "0")}`, nameAr, accountType: "REVENUE" }, update: {} });
    await tx.revenueCategory.upsert({ where: { code }, create: { code, nameAr, accountId: account.id }, update: {} });
  }
}

export async function createBankAccount(tx: Tx, input: Record<string, unknown>) {
  const name = clean(input.name);
  if (!name) throw new FinanceError("INVALID_INPUT", "اسم الحساب مطلوب");
  const currency = String(input.currency ?? "SAR").toUpperCase();
  if (!["SAR", "USD"].includes(currency)) throw new FinanceError("INVALID_INPUT", "العملة غير مدعومة");
  const ledgerCode = `1020${String((await tx.bankAccount.count()) + 1).padStart(3, "0")}`;
  const ledger = await tx.account.create({ data: { code: ledgerCode, nameAr: name, accountType: "ASSET" } });
  const openingBalance = money(input.openingBalance);
  const bank = await tx.bankAccount.create({ data: { name, bankName: clean(input.bankName), accountNumber: clean(input.accountNumber),
    iban: clean(input.iban), currency, openingBalance, currentBalance: 0, ledgerAccountId: ledger.id, notes: clean(input.notes) }, include: { ledgerAccount: true } });
  if (openingBalance.gt(0)) {
    const openedAt = new Date();
    await assertOpenAccountingPeriod(tx, openedAt);
    await createBalancedJournal(tx, { entryDate: openedAt, description: `رصيد افتتاحي ${name}`, referenceType: "BANK_OPENING_BALANCE",
      referenceId: bank.id, referenceNumber: `BANK-${bank.id}`, lines: [{ accountId: ledger.id, debit: openingBalance }, { mappingKey: "OPENING_BALANCE_EQUITY", credit: openingBalance }] });
    await recordBankMovement(tx, { bankAccountId: bank.id, date: openedAt, type: "OPENING_BALANCE", amountIn: openingBalance,
      referenceType: "BANK_OPENING_BALANCE", referenceId: bank.id, referenceNumber: `BANK-${bank.id}`, description: `رصيد افتتاحي ${name}` });
  }
  await audit(tx, { action: "CREATE", entityType: "BANK_ACCOUNT", entityId: bank.id, metadata: { name, currency } });
  return tx.bankAccount.findUniqueOrThrow({ where: { id: bank.id }, include: { ledgerAccount: true } });
}

type AllocationInput = { saleId?: number | null; purchaseId?: number | null; amount: Prisma.Decimal };
export async function createVoucher(tx: Tx, input: Record<string, unknown>) {
  const voucherType = String(input.voucherType ?? "").toUpperCase();
  if (!["CUSTOMER_RECEIPT", "SUPPLIER_PAYMENT"].includes(voucherType)) throw new FinanceError("INVALID_INPUT", "نوع السند المالي غير صحيح");
  const voucherDate = parsedDate(input.voucherDate);
  const partyId = Number(input.partyId);
  const bankAccountId = Number(input.bankAccountId);
  const amount = money(input.amount);
  if (!amount.gt(0) || !Number.isInteger(partyId) || !Number.isInteger(bankAccountId)) throw new FinanceError("INVALID_INPUT", "بيانات السند المالي غير مكتملة");
  const [party, bank] = await Promise.all([tx.party.findUnique({ where: { id: partyId } }), tx.bankAccount.findUnique({ where: { id: bankAccountId } })]);
  if (!party || !bank?.isActive) throw new FinanceError("NOT_FOUND", "الجهة أو الحساب البنكي غير موجود");
  const rawAllocations = Array.isArray(input.allocations) ? input.allocations : [];
  const allocations: AllocationInput[] = rawAllocations.map((raw) => {
    const row = raw as Record<string, unknown>;
    return { saleId: row.saleId ? Number(row.saleId) : null, purchaseId: row.purchaseId ? Number(row.purchaseId) : null, amount: money(row.amount, "مبلغ التخصيص") };
  });
  const allocated = allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  if (allocated.gt(amount)) throw new FinanceError("INVALID_INPUT", "مجموع التخصيصات أكبر من مبلغ السند");
  if (voucherType === "CUSTOMER_RECEIPT" && allocations.some((row) => !row.saleId || row.purchaseId)) throw new FinanceError("INVALID_INPUT", "تخصيص سند القبض يجب أن يكون لفواتير مبيعات");
  if (voucherType === "SUPPLIER_PAYMENT" && allocations.some((row) => !row.purchaseId || row.saleId)) throw new FinanceError("INVALID_INPUT", "تخصيص سند الصرف يجب أن يكون لفواتير موردين");
  if (allocations.length) {
    const saleIds = allocations.flatMap((row) => row.saleId ? [row.saleId] : []);
    const purchaseIds = allocations.flatMap((row) => row.purchaseId ? [row.purchaseId] : []);
    const [sales, purchases] = await Promise.all([
      tx.sale.findMany({ where: { id: { in: saleIds } }, include: { allocations: { where: { voucher: { status: "POSTED" } } } } }),
      tx.purchase.findMany({ where: { id: { in: purchaseIds } }, include: { allocations: { where: { voucher: { status: "POSTED" } } } } }),
    ]);
    const salesById = new Map(sales.map((row) => [row.id, row]));
    const purchasesById = new Map(purchases.map((row) => [row.id, row]));
    for (const allocation of allocations) {
      if (allocation.saleId) {
        const invoice = salesById.get(allocation.saleId);
        if (!invoice || invoice.partyId !== partyId || invoice.status !== "COMPLETED") throw new FinanceError("INVALID_INPUT", "فاتورة المبيعات غير صالحة لهذا العميل");
        const paid = invoice.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
        if (paid.plus(allocation.amount).gt(invoice.totalAmount)) throw new FinanceError("INVALID_INPUT", `التخصيص يتجاوز رصيد الفاتورة ${invoice.invoiceNumber}`);
      }
      if (allocation.purchaseId) {
        const invoice = purchasesById.get(allocation.purchaseId);
        if (!invoice || invoice.partyId !== partyId || invoice.status !== "COMPLETED") throw new FinanceError("INVALID_INPUT", "فاتورة المورد غير صالحة لهذا المورد");
        const paid = invoice.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
        if (paid.plus(allocation.amount).gt(invoice.totalAmount)) throw new FinanceError("INVALID_INPUT", `التخصيص يتجاوز رصيد الفاتورة ${invoice.purchaseNumber}`);
      }
    }
  }
  const voucherNumber = await nextDocumentNumber(tx, voucherType === "CUSTOMER_RECEIPT" ? "RV" : "PV", voucherDate);
  const voucher = await tx.financialVoucher.create({ data: { voucherNumber, voucherType, voucherDate, partyId, amount,
    paymentMethod: String(input.paymentMethod ?? "BANK").toUpperCase(), bankAccountId, referenceNumber: clean(input.referenceNumber),
    description: clean(input.description), notes: clean(input.notes), allocations: { create: allocations } },
    include: { party: true, bankAccount: true, allocations: true } });
  await audit(tx, { action: "CREATE", entityType: "FINANCIAL_VOUCHER", entityId: voucher.id, metadata: { voucherNumber, voucherType } });
  return voucher;
}

export async function recordBankMovement(tx: Tx, input: { bankAccountId: number; date: Date; type: string; amountIn?: Prisma.Decimal; amountOut?: Prisma.Decimal; referenceType: string; referenceId: number; referenceNumber: string; description?: string | null }) {
  const existing = await tx.bankTransaction.findFirst({ where: { referenceType: input.referenceType, referenceId: input.referenceId } });
  if (existing) return existing;
  const bank = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId } });
  if (!bank) throw new FinanceError("NOT_FOUND", "الحساب البنكي غير موجود");
  const amountIn = input.amountIn ?? new Prisma.Decimal(0), amountOut = input.amountOut ?? new Prisma.Decimal(0);
  const balanceAfter = new Prisma.Decimal(bank.currentBalance).plus(amountIn).minus(amountOut).toDecimalPlaces(2);
  await tx.bankAccount.update({ where: { id: bank.id }, data: { currentBalance: balanceAfter } });
  return tx.bankTransaction.create({ data: { bankAccountId: bank.id, transactionDate: input.date, transactionType: input.type,
    amountIn, amountOut, balanceAfter, referenceType: input.referenceType, referenceId: input.referenceId,
    referenceNumber: input.referenceNumber, description: input.description } });
}

export async function postVoucher(tx: Tx, voucherId: number) {
  const voucher = await tx.financialVoucher.findUnique({ where: { id: voucherId }, include: { bankAccount: true, allocations: true } });
  if (!voucher) throw new FinanceError("NOT_FOUND", "السند المالي غير موجود");
  if (voucher.status === "POSTED") return tx.financialVoucher.findUniqueOrThrow({ where: { id: voucher.id }, include: { journalEntry: { include: { lines: true } }, allocations: true } });
  if (voucher.status !== "DRAFT") throw new FinanceError("INVALID_STATUS", "لا يمكن ترحيل السند في حالته الحالية");
  await assertOpenAccountingPeriod(tx, voucher.voucherDate);
  const receipt = voucher.voucherType === "CUSTOMER_RECEIPT";
  const journal = await createBalancedJournal(tx, { entryDate: voucher.voucherDate,
    description: receipt ? `سند قبض ${voucher.voucherNumber}` : `سند صرف ${voucher.voucherNumber}`,
    referenceType: "FINANCIAL_VOUCHER", referenceId: voucher.id, referenceNumber: voucher.voucherNumber,
    lines: receipt
      ? [{ accountId: voucher.bankAccount.ledgerAccountId, debit: voucher.amount }, { mappingKey: "ACCOUNTS_RECEIVABLE", credit: voucher.amount, partyId: voucher.partyId }]
      : [{ mappingKey: "ACCOUNTS_PAYABLE", debit: voucher.amount, partyId: voucher.partyId }, { accountId: voucher.bankAccount.ledgerAccountId, credit: voucher.amount }],
  });
  await recordBankMovement(tx, { bankAccountId: voucher.bankAccountId, date: voucher.voucherDate, type: voucher.voucherType,
    ...(receipt ? { amountIn: voucher.amount } : { amountOut: voucher.amount }), referenceType: "FINANCIAL_VOUCHER", referenceId: voucher.id,
    referenceNumber: voucher.voucherNumber, description: voucher.description });
  const posted = await tx.financialVoucher.update({ where: { id: voucher.id }, data: { status: "POSTED", journalEntryId: journal.id, postedAt: new Date() }, include: { journalEntry: { include: { lines: true } }, allocations: true } });
  await audit(tx, { action: "POST", entityType: "FINANCIAL_VOUCHER", entityId: voucher.id, metadata: { journalId: journal.id } });
  return posted;
}

export async function cancelVoucher(tx: Tx, voucherId: number, reason?: string | null) {
  const voucher = await tx.financialVoucher.findUnique({ where: { id: voucherId }, include: { bankAccount: true } });
  if (!voucher) throw new FinanceError("NOT_FOUND", "السند المالي غير موجود");
  if (voucher.status === "CANCELLED") return voucher;
  if (voucher.status !== "POSTED" || !voucher.journalEntryId) throw new FinanceError("INVALID_STATUS", "يمكن إلغاء السند المرحل فقط");
  const receipt = voucher.voucherType === "CUSTOMER_RECEIPT";
  await reverseJournalEntry(tx, { originalId: voucher.journalEntryId, referenceType: "FINANCIAL_VOUCHER_REVERSAL", referenceId: voucher.id,
    referenceNumber: voucher.voucherNumber, description: `عكس السند ${voucher.voucherNumber}` });
  await recordBankMovement(tx, { bankAccountId: voucher.bankAccountId, date: new Date(), type: "REVERSAL",
    ...(receipt ? { amountOut: voucher.amount } : { amountIn: voucher.amount }), referenceType: "FINANCIAL_VOUCHER_REVERSAL",
    referenceId: voucher.id, referenceNumber: voucher.voucherNumber, description: reason });
  const cancelled = await tx.financialVoucher.update({ where: { id: voucher.id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: reason ? `${voucher.notes ?? ""}\nسبب الإلغاء: ${reason}`.trim() : voucher.notes } });
  await audit(tx, { action: "CANCEL", entityType: "FINANCIAL_VOUCHER", entityId: voucher.id, metadata: { reason } });
  return cancelled;
}

export async function createAndPostExpense(tx: Tx, input: Record<string, unknown>) {
  await ensureFinanceFoundation(tx);
  const expenseDate = parsedDate(input.expenseDate), categoryId = Number(input.categoryId), bankAccountId = Number(input.bankAccountId);
  const beforeVat = money(input.amountBeforeVat), vat = money(input.vatAmount), total = beforeVat.plus(vat).toDecimalPlaces(2);
  if (!beforeVat.gt(0) || !Number.isInteger(categoryId) || !Number.isInteger(bankAccountId)) throw new FinanceError("INVALID_INPUT", "بيانات المصروف غير مكتملة");
  await assertOpenAccountingPeriod(tx, expenseDate);
  const [category, bank] = await Promise.all([tx.expenseCategory.findUnique({ where: { id: categoryId } }), tx.bankAccount.findUnique({ where: { id: bankAccountId } })]);
  if (!category || !bank) throw new FinanceError("NOT_FOUND", "التصنيف أو الحساب البنكي غير موجود");
  const voucherNumber = await nextDocumentNumber(tx, "PV", expenseDate);
  const expense = await tx.expense.create({ data: { voucherNumber, expenseDate, expenseType: category.code, categoryId, description: clean(input.description),
    beneficiary: clean(input.beneficiary), amountBeforeVat: beforeVat, vatAmount: vat, totalAmount: total, paymentMethod: clean(input.paymentMethod),
    bankAccountId, cashBankAccount: bank.name, costCenter: clean(input.costCenter), project: clean(input.project),
    responsibleEmployee: clean(input.responsibleEmployee), referenceNumber: clean(input.referenceNumber), notes: clean(input.notes), status: "POSTED", postedAt: new Date() } });
  const lines = [{ accountId: category.accountId, debit: beforeVat }, ...(vat.isZero() ? [] : [{ mappingKey: "INPUT_VAT", debit: vat }]), { accountId: bank.ledgerAccountId, credit: total }];
  const journal = await createBalancedJournal(tx, { entryDate: expenseDate, description: `مصروف ${voucherNumber}`, referenceType: "EXPENSE", referenceId: expense.id, referenceNumber: voucherNumber, lines });
  await tx.expense.update({ where: { id: expense.id }, data: { journalEntryId: journal.id } });
  await recordBankMovement(tx, { bankAccountId, date: expenseDate, type: "EXPENSE", amountOut: total, referenceType: "EXPENSE", referenceId: expense.id, referenceNumber: voucherNumber, description: expense.description });
  await audit(tx, { action: "POST", entityType: "EXPENSE", entityId: expense.id, metadata: { journalId: journal.id } });
  return tx.expense.findUniqueOrThrow({ where: { id: expense.id }, include: { category: true, bankAccount: true, journalEntry: true } });
}

export async function createAndPostRevenue(tx: Tx, input: Record<string, unknown>) {
  await ensureFinanceFoundation(tx);
  const revenueDate = parsedDate(input.revenueDate), categoryId = Number(input.categoryId), bankAccountId = Number(input.bankAccountId);
  const beforeVat = money(input.amountBeforeVat), vat = money(input.vatAmount), total = beforeVat.plus(vat).toDecimalPlaces(2);
  if (!beforeVat.gt(0) || !Number.isInteger(categoryId) || !Number.isInteger(bankAccountId)) throw new FinanceError("INVALID_INPUT", "بيانات الإيراد غير مكتملة");
  await assertOpenAccountingPeriod(tx, revenueDate);
  const [category, bank] = await Promise.all([tx.revenueCategory.findUnique({ where: { id: categoryId } }), tx.bankAccount.findUnique({ where: { id: bankAccountId } })]);
  if (!category || !bank) throw new FinanceError("NOT_FOUND", "التصنيف أو الحساب البنكي غير موجود");
  const voucherNumber = await nextDocumentNumber(tx, "RV", revenueDate);
  const partyId = input.partyId ? Number(input.partyId) : null;
  const revenue = await tx.revenue.create({ data: { voucherNumber, revenueDate, revenueType: category.code, categoryId, partyId, description: clean(input.description),
    amountBeforeVat: beforeVat, vatAmount: vat, totalAmount: total, collectionMethod: clean(input.collectionMethod), bankAccountId,
    cashBankAccount: bank.name, activity: clean(input.activity), costCenter: clean(input.costCenter), referenceNumber: clean(input.referenceNumber),
    notes: clean(input.notes), status: "POSTED", postedAt: new Date() } });
  const lines = [{ accountId: bank.ledgerAccountId, debit: total }, { accountId: category.accountId, credit: beforeVat }, ...(vat.isZero() ? [] : [{ mappingKey: "VAT_PAYABLE", credit: vat }])];
  const journal = await createBalancedJournal(tx, { entryDate: revenueDate, description: `إيراد ${voucherNumber}`, referenceType: "REVENUE", referenceId: revenue.id, referenceNumber: voucherNumber, lines });
  await tx.revenue.update({ where: { id: revenue.id }, data: { journalEntryId: journal.id } });
  await recordBankMovement(tx, { bankAccountId, date: revenueDate, type: "REVENUE", amountIn: total, referenceType: "REVENUE", referenceId: revenue.id, referenceNumber: voucherNumber, description: revenue.description });
  await audit(tx, { action: "POST", entityType: "REVENUE", entityId: revenue.id, metadata: { journalId: journal.id } });
  return tx.revenue.findUniqueOrThrow({ where: { id: revenue.id }, include: { category: true, bankAccount: true, journalEntry: true } });
}

export async function createBankTransfer(tx: Tx, input: Record<string, unknown>) {
  await ensureFinanceFoundation(tx);
  const transferDate = parsedDate(input.transferDate), fromBankAccountId = Number(input.fromBankAccountId), toBankAccountId = Number(input.toBankAccountId);
  const amount = money(input.amount), fees = money(input.fees);
  if (!amount.gt(0) || !Number.isInteger(fromBankAccountId) || !Number.isInteger(toBankAccountId) || fromBankAccountId === toBankAccountId) {
    throw new FinanceError("INVALID_INPUT", "بيانات التحويل البنكي غير صحيحة");
  }
  await assertOpenAccountingPeriod(tx, transferDate);
  const [fromBank, toBank, feeCategory] = await Promise.all([
    tx.bankAccount.findUnique({ where: { id: fromBankAccountId } }), tx.bankAccount.findUnique({ where: { id: toBankAccountId } }),
    tx.expenseCategory.findUnique({ where: { code: "BANK_FEES" } }),
  ]);
  if (!fromBank?.isActive || !toBank?.isActive || !feeCategory) throw new FinanceError("NOT_FOUND", "أحد الحسابات البنكية غير موجود أو غير نشط");
  const transferNumber = await nextDocumentNumber(tx, "BT", transferDate);
  const transfer = await tx.bankTransfer.create({ data: { transferNumber, transferDate, fromBankAccountId, toBankAccountId, amount, fees,
    referenceNumber: clean(input.referenceNumber), description: clean(input.description), postedAt: new Date() } });
  const journal = await createBalancedJournal(tx, { entryDate: transferDate, description: `تحويل بنكي ${transferNumber}`,
    referenceType: "BANK_TRANSFER", referenceId: transfer.id, referenceNumber: transferNumber,
    lines: [{ accountId: toBank.ledgerAccountId, debit: amount }, ...(fees.isZero() ? [] : [{ accountId: feeCategory.accountId, debit: fees }]),
      { accountId: fromBank.ledgerAccountId, credit: amount.plus(fees) }] });
  await recordBankMovement(tx, { bankAccountId: fromBank.id, date: transferDate, type: "TRANSFER_OUT", amountOut: amount.plus(fees),
    referenceType: "BANK_TRANSFER_OUT", referenceId: transfer.id, referenceNumber: transferNumber, description: transfer.description });
  await recordBankMovement(tx, { bankAccountId: toBank.id, date: transferDate, type: "TRANSFER_IN", amountIn: amount,
    referenceType: "BANK_TRANSFER_IN", referenceId: transfer.id, referenceNumber: transferNumber, description: transfer.description });
  await tx.bankTransfer.update({ where: { id: transfer.id }, data: { journalEntryId: journal.id } });
  await audit(tx, { action: "POST", entityType: "BANK_TRANSFER", entityId: transfer.id, metadata: { journalId: journal.id } });
  return tx.bankTransfer.findUniqueOrThrow({ where: { id: transfer.id }, include: { fromBankAccount: true, toBankAccount: true, journalEntry: { include: { lines: true } } } });
}

export async function cancelBankTransfer(tx: Tx, transferId: number, reason?: string | null) {
  const transfer = await tx.bankTransfer.findUnique({ where: { id: transferId } });
  if (!transfer) throw new FinanceError("NOT_FOUND", "التحويل البنكي غير موجود");
  if (transfer.status === "CANCELLED") return transfer;
  if (!transfer.journalEntryId) throw new FinanceError("INVALID_STATUS", "التحويل غير مرحل");
  await reverseJournalEntry(tx, { originalId: transfer.journalEntryId, referenceType: "BANK_TRANSFER_REVERSAL", referenceId: transfer.id,
    referenceNumber: transfer.transferNumber, description: `عكس التحويل ${transfer.transferNumber}` });
  await recordBankMovement(tx, { bankAccountId: transfer.fromBankAccountId, date: new Date(), type: "TRANSFER_REVERSAL_IN",
    amountIn: transfer.amount.plus(transfer.fees), referenceType: "BANK_TRANSFER_REVERSAL_FROM", referenceId: transfer.id,
    referenceNumber: transfer.transferNumber, description: reason });
  await recordBankMovement(tx, { bankAccountId: transfer.toBankAccountId, date: new Date(), type: "TRANSFER_REVERSAL_OUT",
    amountOut: transfer.amount, referenceType: "BANK_TRANSFER_REVERSAL_TO", referenceId: transfer.id,
    referenceNumber: transfer.transferNumber, description: reason });
  const cancelled = await tx.bankTransfer.update({ where: { id: transfer.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await audit(tx, { action: "CANCEL", entityType: "BANK_TRANSFER", entityId: transfer.id, metadata: { reason } });
  return cancelled;
}

export function financeErrorResponse(error: unknown) {
  if (error instanceof FinanceError || error instanceof AccountingError) return { status: error instanceof FinanceError && error.code === "NOT_FOUND" ? 404 : 400, message: error.message };
  return { status: 500, message: "تعذر تنفيذ العملية المالية" };
}
