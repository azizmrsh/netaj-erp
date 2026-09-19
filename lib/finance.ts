import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import {
  AccountingError,
  assertOpenAccountingPeriod,
  createBalancedJournal,
  ensureAccountingFoundation,
  reverseJournalEntry,
  type JournalLineInput,
} from "@/lib/accounting";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { exchangeRateAt, functionalAmount } from "@/lib/currency";

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
  if (!(await tx.currency.findUnique({ where: { code: currency } }))?.isActive) throw new FinanceError("INVALID_INPUT", "العملة غير مدعومة");
  const ledgerCode = `1020${String((await tx.bankAccount.count()) + 1).padStart(3, "0")}`;
  const ledger = await tx.account.create({ data: { code: ledgerCode, nameAr: name, accountType: "ASSET" } });
  const openingBalance = money(input.openingBalance);
  const bank = await tx.bankAccount.create({ data: { name, bankName: clean(input.bankName), accountNumber: clean(input.accountNumber),
    iban: clean(input.iban), currency, openingBalance, currentBalance: 0, ledgerAccountId: ledger.id, notes: clean(input.notes) }, include: { ledgerAccount: true } });
  if (openingBalance.gt(0)) {
    const openedAt = new Date();
    await assertOpenAccountingPeriod(tx, openedAt);
    const fx = await exchangeRateAt(tx, currency, openedAt);
    const functionalOpening = functionalAmount(openingBalance, fx.rate);
    await createBalancedJournal(tx, { entryDate: openedAt, description: `رصيد افتتاحي ${name}`, referenceType: "BANK_OPENING_BALANCE",
      referenceId: bank.id, referenceNumber: `BANK-${bank.id}`, transactionCurrencyCode: currency,
      functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate,
      lines: [{ accountId: ledger.id, debit: functionalOpening, transactionDebit: openingBalance }, { mappingKey: "OPENING_BALANCE_EQUITY", credit: functionalOpening, transactionCredit: openingBalance }] });
    await recordBankMovement(tx, { bankAccountId: bank.id, date: openedAt, type: "OPENING_BALANCE", amountIn: openingBalance,
      referenceType: "BANK_OPENING_BALANCE", referenceId: bank.id, referenceNumber: `BANK-${bank.id}`, description: `رصيد افتتاحي ${name}` });
  }
  await audit(tx, { action: "CREATE", entityType: "BANK_ACCOUNT", entityId: bank.id, metadata: { name, currency } });
  return tx.bankAccount.findUniqueOrThrow({ where: { id: bank.id }, include: { ledgerAccount: true } });
}

type AllocationInput = { saleId?: number | null; purchaseId?: number | null; amount: Prisma.Decimal; functionalAmount?: Prisma.Decimal; carryingFunctionalAmount?: Prisma.Decimal; realizedFxAmount?: Prisma.Decimal };
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
  const currency = String(input.currency ?? bank.currency).trim().toUpperCase();
  if (currency !== bank.currency) throw new FinanceError("INVALID_INPUT", "عملة السند يجب أن تطابق عملة الحساب البنكي");
  const fx = await exchangeRateAt(tx, currency, voucherDate);
  const voucherFunctionalAmount = functionalAmount(amount, fx.rate);
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
        if (invoice.currency !== currency) throw new FinanceError("INVALID_INPUT", `عملة السند لا تطابق الفاتورة ${invoice.invoiceNumber}`);
        allocation.functionalAmount = functionalAmount(allocation.amount, fx.rate);
        allocation.carryingFunctionalAmount = functionalAmount(allocation.amount, invoice.exchangeRate);
        allocation.realizedFxAmount = allocation.functionalAmount.minus(allocation.carryingFunctionalAmount).toDecimalPlaces(2);
      }
      if (allocation.purchaseId) {
        const invoice = purchasesById.get(allocation.purchaseId);
        if (!invoice || invoice.partyId !== partyId || invoice.status !== "COMPLETED") throw new FinanceError("INVALID_INPUT", "فاتورة المورد غير صالحة لهذا المورد");
        const paid = invoice.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
        if (paid.plus(allocation.amount).gt(invoice.totalAmount)) throw new FinanceError("INVALID_INPUT", `التخصيص يتجاوز رصيد الفاتورة ${invoice.purchaseNumber}`);
        if (invoice.currency !== currency) throw new FinanceError("INVALID_INPUT", `عملة السند لا تطابق الفاتورة ${invoice.purchaseNumber}`);
        allocation.functionalAmount = functionalAmount(allocation.amount, fx.rate);
        allocation.carryingFunctionalAmount = functionalAmount(allocation.amount, invoice.exchangeRate);
        allocation.realizedFxAmount = allocation.functionalAmount.minus(allocation.carryingFunctionalAmount).toDecimalPlaces(2);
      }
    }
  }
  const voucherNumber = await nextDocumentNumber(tx, voucherType === "CUSTOMER_RECEIPT" ? "RV" : "PV", voucherDate);
  const voucher = await tx.financialVoucher.create({ data: { voucherNumber, voucherType, voucherDate, partyId, amount, currency,
    exchangeRate: fx.rate, rateDate: fx.rateDate, functionalAmount: voucherFunctionalAmount,
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
  const fx = await exchangeRateAt(tx, bank.currency, input.date);
  const balanceAfter = new Prisma.Decimal(bank.currentBalance).plus(amountIn).minus(amountOut).toDecimalPlaces(2);
  const functionalAmountIn = functionalAmount(amountIn, fx.rate), functionalAmountOut = functionalAmount(amountOut, fx.rate);
  const functionalBalanceAfter = functionalAmount(balanceAfter, fx.rate);
  await tx.bankAccount.update({ where: { id: bank.id }, data: { currentBalance: balanceAfter } });
  return tx.bankTransaction.create({ data: { bankAccountId: bank.id, transactionDate: input.date, transactionType: input.type,
    amountIn, amountOut, balanceAfter, functionalAmountIn, functionalAmountOut, functionalBalanceAfter, exchangeRate: fx.rate,
    referenceType: input.referenceType, referenceId: input.referenceId,
    referenceNumber: input.referenceNumber, description: input.description } });
}

export async function postVoucher(tx: Tx, voucherId: number) {
  const voucher = await tx.financialVoucher.findUnique({ where: { id: voucherId }, include: { bankAccount: true, allocations: true } });
  if (!voucher) throw new FinanceError("NOT_FOUND", "السند المالي غير موجود");
  if (voucher.status === "POSTED") return tx.financialVoucher.findUniqueOrThrow({ where: { id: voucher.id }, include: { journalEntry: { include: { lines: true } }, allocations: true } });
  if (voucher.status !== "DRAFT") throw new FinanceError("INVALID_STATUS", "لا يمكن ترحيل السند في حالته الحالية");
  await assertOpenAccountingPeriod(tx, voucher.voucherDate);
  const receipt = voucher.voucherType === "CUSTOMER_RECEIPT";
  const allocatedTransaction = voucher.allocations.reduce((sum, row) => sum.plus(row.amount), new Prisma.Decimal(0));
  const carryingAllocated = voucher.allocations.reduce((sum, row) => sum.plus(row.carryingFunctionalAmount), new Prisma.Decimal(0));
  const unallocatedFunctional = functionalAmount(new Prisma.Decimal(voucher.amount).minus(allocatedTransaction), voucher.exchangeRate);
  const carryingFunctional = carryingAllocated.plus(unallocatedFunctional).toDecimalPlaces(2);
  const realizedFx = new Prisma.Decimal(voucher.functionalAmount).minus(carryingFunctional).toDecimalPlaces(2);
  const transactionLines = receipt
    ? [
        { accountId: voucher.bankAccount.ledgerAccountId, debit: voucher.functionalAmount, transactionDebit: voucher.amount },
        { mappingKey: "ACCOUNTS_RECEIVABLE", credit: carryingFunctional, transactionCredit: voucher.amount, partyId: voucher.partyId },
        ...(realizedFx.gt(0) ? [{ mappingKey: "REALIZED_FX_GAIN", credit: realizedFx, transactionCredit: 0 }] : []),
        ...(realizedFx.lt(0) ? [{ mappingKey: "REALIZED_FX_LOSS", debit: realizedFx.abs(), transactionDebit: 0 }] : []),
      ]
    : [
        { mappingKey: "ACCOUNTS_PAYABLE", debit: carryingFunctional, transactionDebit: voucher.amount, partyId: voucher.partyId },
        ...(realizedFx.gt(0) ? [{ mappingKey: "REALIZED_FX_LOSS", debit: realizedFx, transactionDebit: 0 }] : []),
        ...(realizedFx.lt(0) ? [{ mappingKey: "REALIZED_FX_GAIN", credit: realizedFx.abs(), transactionCredit: 0 }] : []),
        { accountId: voucher.bankAccount.ledgerAccountId, credit: voucher.functionalAmount, transactionCredit: voucher.amount },
      ];
  const journal = await createBalancedJournal(tx, { entryDate: voucher.voucherDate,
    description: receipt ? `سند قبض ${voucher.voucherNumber}` : `سند صرف ${voucher.voucherNumber}`,
    referenceType: "FINANCIAL_VOUCHER", referenceId: voucher.id, referenceNumber: voucher.voucherNumber,
    transactionCurrencyCode: voucher.currency, functionalCurrencyCode: (await exchangeRateAt(tx, voucher.currency, voucher.voucherDate)).company.baseCurrencyCode,
    exchangeRate: voucher.exchangeRate, rateDate: voucher.rateDate, lines: transactionLines,
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
  const requestedAllocations = Array.isArray(input.allocations) ? input.allocations : [];
  const legacyCenter = clean(input.costCenter) ?? "ADMIN";
  const allocationInput = requestedAllocations.length
    ? requestedAllocations.map((value) => {
        const row = value as Record<string, unknown>;
        return { costCenterId: Number(row.costCenterId), percentage: new Prisma.Decimal(String(row.percentage ?? 0)) };
      })
    : [{ code: legacyCenter, percentage: new Prisma.Decimal(100) }];
  if (allocationInput.some((row) => !row.percentage.gt(0)) || !allocationInput.reduce((sum, row) => sum.plus(row.percentage), new Prisma.Decimal(0)).equals(100)) {
    throw new FinanceError("INVALID_INPUT", "يجب أن يكون مجموع توزيع المصروف 100٪ بالضبط");
  }
  const resolvedCenters = [] as { id: number; code: string; percentage: Prisma.Decimal }[];
  for (const row of allocationInput) {
    const center = "costCenterId" in row
      ? await tx.costCenter.findUnique({ where: { id: row.costCenterId } })
      : await tx.costCenter.findUnique({ where: { code: row.code } });
    if (!center?.isActive || resolvedCenters.some((value) => value.id === center.id)) throw new FinanceError("INVALID_INPUT", "مركز تكلفة غير صالح أو مكرر");
    resolvedCenters.push({ id: center.id, code: center.code, percentage: row.percentage });
  }
  const fx = await exchangeRateAt(tx, bank.currency, expenseDate), functionalBeforeVat = functionalAmount(beforeVat, fx.rate), functionalVat = functionalAmount(vat, fx.rate), functionalTotal = functionalAmount(total, fx.rate);
  const distributed = resolvedCenters.map((row, index) => {
    const isLast = index === resolvedCenters.length - 1;
    const priorBefore = resolvedCenters.slice(0, index).reduce((sum, item) => sum.plus(beforeVat.mul(item.percentage).div(100).toDecimalPlaces(2)), new Prisma.Decimal(0));
    const priorVat = resolvedCenters.slice(0, index).reduce((sum, item) => sum.plus(vat.mul(item.percentage).div(100).toDecimalPlaces(2)), new Prisma.Decimal(0));
    const amountBeforeVat = isLast ? beforeVat.minus(priorBefore) : beforeVat.mul(row.percentage).div(100).toDecimalPlaces(2);
    const vatAmount = isLast ? vat.minus(priorVat) : vat.mul(row.percentage).div(100).toDecimalPlaces(2);
    return { ...row, amountBeforeVat, vatAmount, totalAmount: amountBeforeVat.plus(vatAmount) };
  });
  const voucherNumber = await nextDocumentNumber(tx, "PV", expenseDate);
  const expense = await tx.expense.create({ data: { voucherNumber, expenseDate, expenseType: category.code, categoryId, description: clean(input.description),
    beneficiary: clean(input.beneficiary), amountBeforeVat: beforeVat, vatAmount: vat, totalAmount: total,
    currency: bank.currency, exchangeRate: fx.rate, rateDate: fx.rateDate, functionalAmountBeforeVat: functionalBeforeVat, functionalVatAmount: functionalVat, functionalTotalAmount: functionalTotal, paymentMethod: clean(input.paymentMethod),
    bankAccountId, cashBankAccount: bank.name, costCenter: resolvedCenters.length === 1 ? resolvedCenters[0].code : "MULTI", project: clean(input.project),
    responsibleEmployee: clean(input.responsibleEmployee), referenceNumber: clean(input.referenceNumber), notes: clean(input.notes), status: "POSTED", postedAt: new Date(),
    allocations: { create: distributed.map((row) => ({ costCenterId: row.id, percentage: row.percentage, amountBeforeVat: row.amountBeforeVat, vatAmount: row.vatAmount, totalAmount: row.totalAmount })) } } });
  const lines: JournalLineInput[] = distributed.flatMap((row) => {
    const allocatedBefore = functionalAmount(row.amountBeforeVat, fx.rate), allocatedVat = functionalAmount(row.vatAmount, fx.rate);
    const dimension = { costCenter: row.code, costCenterId: row.id, projectCode: clean(input.project) };
    return [{ accountId: category.accountId, debit: allocatedBefore, transactionDebit: row.amountBeforeVat, ...dimension }, ...(row.vatAmount.isZero() ? [] : [{ mappingKey: "INPUT_VAT", debit: allocatedVat, transactionDebit: row.vatAmount, ...dimension }])];
  });
  lines.push({ accountId: bank.ledgerAccountId, credit: functionalTotal, transactionCredit: total, costCenter: "MULTI", costCenterId: null, projectCode: clean(input.project) });
  const journal = await createBalancedJournal(tx, { entryDate: expenseDate, description: `مصروف ${voucherNumber}`, referenceType: "EXPENSE", referenceId: expense.id, referenceNumber: voucherNumber,
    transactionCurrencyCode: bank.currency, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate, lines });
  await tx.expense.update({ where: { id: expense.id }, data: { journalEntryId: journal.id } });
  await recordBankMovement(tx, { bankAccountId, date: expenseDate, type: "EXPENSE", amountOut: total, referenceType: "EXPENSE", referenceId: expense.id, referenceNumber: voucherNumber, description: expense.description });
  await audit(tx, { action: "POST", entityType: "EXPENSE", entityId: expense.id, metadata: { journalId: journal.id } });
  return tx.expense.findUniqueOrThrow({ where: { id: expense.id }, include: { category: true, bankAccount: true, journalEntry: { include: { lines: true } }, allocations: { include: { costCenter: true } } } });
}

export async function createAndPostRevenue(tx: Tx, input: Record<string, unknown>) {
  await ensureFinanceFoundation(tx);
  const revenueDate = parsedDate(input.revenueDate), categoryId = Number(input.categoryId), bankAccountId = Number(input.bankAccountId);
  const beforeVat = money(input.amountBeforeVat), vat = money(input.vatAmount), total = beforeVat.plus(vat).toDecimalPlaces(2);
  if (!beforeVat.gt(0) || !Number.isInteger(categoryId) || !Number.isInteger(bankAccountId)) throw new FinanceError("INVALID_INPUT", "بيانات الإيراد غير مكتملة");
  await assertOpenAccountingPeriod(tx, revenueDate);
  const [category, bank] = await Promise.all([tx.revenueCategory.findUnique({ where: { id: categoryId } }), tx.bankAccount.findUnique({ where: { id: bankAccountId } })]);
  if (!category || !bank) throw new FinanceError("NOT_FOUND", "التصنيف أو الحساب البنكي غير موجود");
  const fx = await exchangeRateAt(tx, bank.currency, revenueDate), functionalBeforeVat = functionalAmount(beforeVat, fx.rate), functionalVat = functionalAmount(vat, fx.rate), functionalTotal = functionalAmount(total, fx.rate);
  const voucherNumber = await nextDocumentNumber(tx, "RV", revenueDate);
  const partyId = input.partyId ? Number(input.partyId) : null;
  const revenue = await tx.revenue.create({ data: { voucherNumber, revenueDate, revenueType: category.code, categoryId, partyId, description: clean(input.description),
    amountBeforeVat: beforeVat, vatAmount: vat, totalAmount: total, currency: bank.currency, exchangeRate: fx.rate, rateDate: fx.rateDate,
    functionalAmountBeforeVat: functionalBeforeVat, functionalVatAmount: functionalVat, functionalTotalAmount: functionalTotal, collectionMethod: clean(input.collectionMethod), bankAccountId,
    cashBankAccount: bank.name, activity: clean(input.activity), costCenter: clean(input.costCenter), referenceNumber: clean(input.referenceNumber),
    notes: clean(input.notes), status: "POSTED", postedAt: new Date() } });
  const dimension = { costCenter: clean(input.costCenter) };
  const lines = [{ accountId: bank.ledgerAccountId, debit: functionalTotal, transactionDebit: total, ...dimension }, { accountId: category.accountId, credit: functionalBeforeVat, transactionCredit: beforeVat, ...dimension }, ...(vat.isZero() ? [] : [{ mappingKey: "VAT_PAYABLE", credit: functionalVat, transactionCredit: vat, ...dimension }])];
  const journal = await createBalancedJournal(tx, { entryDate: revenueDate, description: `إيراد ${voucherNumber}`, referenceType: "REVENUE", referenceId: revenue.id, referenceNumber: voucherNumber,
    transactionCurrencyCode: bank.currency, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate, lines });
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
  if (fromBank.currency !== toBank.currency) throw new FinanceError("INVALID_INPUT", "التحويل بين عملتين مختلفتين يتطلب عملية صرف مستقلة ولا يجوز ترحيله كمبلغ متماثل");
  const fx = await exchangeRateAt(tx, fromBank.currency, transferDate), functionalTransfer = functionalAmount(amount, fx.rate), functionalFees = functionalAmount(fees, fx.rate);
  const transferNumber = await nextDocumentNumber(tx, "BT", transferDate);
  const transfer = await tx.bankTransfer.create({ data: { transferNumber, transferDate, fromBankAccountId, toBankAccountId, amount, fees,
    referenceNumber: clean(input.referenceNumber), description: clean(input.description), postedAt: new Date() } });
  const journal = await createBalancedJournal(tx, { entryDate: transferDate, description: `تحويل بنكي ${transferNumber}`,
    referenceType: "BANK_TRANSFER", referenceId: transfer.id, referenceNumber: transferNumber,
    transactionCurrencyCode: fromBank.currency, functionalCurrencyCode: fx.company.baseCurrencyCode, exchangeRate: fx.rate, rateDate: fx.rateDate,
    lines: [{ accountId: toBank.ledgerAccountId, debit: functionalTransfer, transactionDebit: amount }, ...(fees.isZero() ? [] : [{ accountId: feeCategory.accountId, debit: functionalFees, transactionDebit: fees }]),
      { accountId: fromBank.ledgerAccountId, credit: functionalTransfer.plus(functionalFees), transactionCredit: amount.plus(fees) }] });
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
