import { Prisma, type PrismaClient } from "@prisma/client";
import { audit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { getVerifiedDataScope } from "@/lib/data-scope";
import { exchangeRateAt, functionalAmount } from "@/lib/currency";

type TransactionClient = Prisma.TransactionClient;

const defaults = [
  { key: "ACCOUNTS_RECEIVABLE", code: "110100", nameAr: "الذمم المدينة", type: "ASSET" },
  { key: "ACCOUNTS_PAYABLE", code: "210100", nameAr: "الذمم الدائنة", type: "LIABILITY" },
  { key: "SALES_REVENUE", code: "410100", nameAr: "إيرادات المبيعات", type: "REVENUE" },
  { key: "VAT_PAYABLE", code: "210200", nameAr: "ضريبة القيمة المضافة المستحقة", type: "LIABILITY" },
  { key: "INPUT_VAT", code: "110200", nameAr: "ضريبة القيمة المضافة المدخلة", type: "ASSET" },
  { key: "VAT_SETTLEMENT", code: "210210", nameAr: "تسوية ضريبة القيمة المضافة", type: "LIABILITY" },
  { key: "VAT_RECEIVABLE", code: "110210", nameAr: "ضريبة قيمة مضافة مستردة", type: "ASSET" },
  { key: "INVENTORY_PURCHASES", code: "120100", nameAr: "المخزون والمشتريات", type: "ASSET" },
  { key: "INVENTORY_ASSET", code: "120100", nameAr: "المخزون والمشتريات", type: "ASSET" },
  { key: "COST_OF_GOODS_SOLD", code: "510100", nameAr: "تكلفة البضاعة المباعة", type: "EXPENSE" },
  { key: "OPENING_BALANCE_EQUITY", code: "310100", nameAr: "حقوق الملكية - أرصدة افتتاحية", type: "EQUITY" },
  { key: "RETAINED_EARNINGS", code: "310200", nameAr: "الأرباح المبقاة", type: "EQUITY" },
  { key: "REALIZED_FX_GAIN", code: "430100", nameAr: "أرباح فروق عملة محققة", type: "REVENUE" },
  { key: "REALIZED_FX_LOSS", code: "530100", nameAr: "خسائر فروق عملة محققة", type: "EXPENSE" },
  { key: "UNREALIZED_FX_GAIN", code: "430200", nameAr: "أرباح فروق عملة غير محققة", type: "REVENUE" },
  { key: "UNREALIZED_FX_LOSS", code: "530200", nameAr: "خسائر فروق عملة غير محققة", type: "EXPENSE" },
  { key: "FACTORY_MANUFACTURING_REVENUE", code: "420003", nameAr: "رسوم التصنيع والتحسين", type: "REVENUE" },
  { key: "FACTORY_FUEL_EXPENSE", code: "520013", nameAr: "مواد تشغيل ووقود المصنع", type: "EXPENSE" },
  { key: "EMPLOYEE_ADVANCES", code: "110300", nameAr: "سلف الموظفين", type: "ASSET" },
  { key: "SALARIES_PAYABLE", code: "210300", nameAr: "رواتب مستحقة", type: "LIABILITY" },
  { key: "SALARY_EXPENSE", code: "520003", nameAr: "رواتب وأجور", type: "EXPENSE" },
] as const;

export class AccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountingError";
  }
}

export async function ensureAccountingFoundation(tx: TransactionClient) {
  for (const entry of defaults) {
    const account = await tx.account.upsert({
      where: { code: entry.code },
      create: { code: entry.code, nameAr: entry.nameAr, accountType: entry.type },
      update: {},
    });
    await tx.accountingMapping.upsert({
      where: { key: entry.key },
      create: { key: entry.key, accountId: account.id, description: entry.nameAr },
      update: {},
    });
  }
  const year = new Date().getFullYear();
  await tx.accountingPeriod.upsert({
    where: {
      startDate_endDate: {
        startDate: new Date(`${year}-01-01T00:00:00.000Z`),
        endDate: new Date(`${year}-12-31T23:59:59.999Z`),
      },
    },
    create: {
      name: `السنة المالية ${year}`,
      startDate: new Date(`${year}-01-01T00:00:00.000Z`),
      endDate: new Date(`${year}-12-31T23:59:59.999Z`),
    },
    update: {},
  });
  await ensureFiscalCalendar(tx, new Date());
}

export async function ensureFiscalCalendar(tx: TransactionClient, referenceDate = new Date()) {
  const { companyId } = await getVerifiedDataScope();
  const company = await tx.company.findUnique({ where: { id: companyId } });
  if (!company) throw new AccountingError("الشركة الحالية غير مهيأة محاسبيًا");
  const startMonth = Math.min(12, Math.max(1, company.fiscalYearStartMonth));
  const currentMonth = referenceDate.getUTCMonth() + 1;
  const startYear = currentMonth >= startMonth ? referenceDate.getUTCFullYear() : referenceDate.getUTCFullYear() - 1;
  const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1));
  const endDate = new Date(Date.UTC(startYear + 1, startMonth - 1, 1) - 1);
  const fiscalYear = await tx.fiscalYear.upsert({
    where: { companyId_startDate_endDate: { companyId, startDate, endDate } },
    create: { companyId, name: startMonth === 1 ? `السنة المالية ${startYear}` : `السنة المالية ${startYear}/${startYear + 1}`, startDate, endDate },
    update: {},
  });
  for (let index = 0; index < 12; index += 1) {
    const periodStart = new Date(Date.UTC(startYear, startMonth - 1 + index, 1));
    const periodEnd = new Date(Date.UTC(startYear, startMonth + index, 1) - 1);
    await tx.fiscalPeriod.upsert({
      where: { fiscalYearId_periodNumber: { fiscalYearId: fiscalYear.id, periodNumber: index + 1 } },
      create: { fiscalYearId: fiscalYear.id, periodNumber: index + 1, name: periodStart.toLocaleDateString("ar-SA", { month: "long", year: "numeric", timeZone: "UTC" }), startDate: periodStart, endDate: periodEnd },
      update: {},
    });
  }
  return tx.fiscalYear.findUniqueOrThrow({ where: { id: fiscalYear.id }, include: { periods: { orderBy: { periodNumber: "asc" } }, closingJournal: true } });
}

async function mappedAccount(tx: TransactionClient, key: string) {
  const mapping = await tx.accountingMapping.findUnique({
    where: { key },
    include: { account: true },
  });
  if (!mapping?.account.isActive || !mapping.account.allowPosting) {
    throw new AccountingError(`الحساب المحاسبي ${key} غير مهيأ للترحيل`);
  }
  return mapping.account;
}

export type JournalLineInput = {
  mappingKey?: string;
  accountId?: number;
  debit?: Prisma.Decimal.Value;
  credit?: Prisma.Decimal.Value;
  transactionDebit?: Prisma.Decimal.Value;
  transactionCredit?: Prisma.Decimal.Value;
  partyId?: number | null;
  costCenter?: string | null;
  costCenterId?: number | null;
  costCodeId?: number | null;
  departmentId?: number | null;
  projectCode?: string | null;
  description?: string;
};

export async function createBalancedJournal(
  tx: TransactionClient,
  input: {
    entryDate: Date;
    description: string;
    referenceType: string;
    referenceId: number;
    referenceNumber: string;
    transactionCurrencyCode?: string;
    functionalCurrencyCode?: string;
    exchangeRate?: Prisma.Decimal.Value;
    rateDate?: Date | null;
    lines: JournalLineInput[];
  }
) {
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType: input.referenceType, referenceId: input.referenceId },
    include: { lines: true },
  });
  if (existing) return existing;

  const resolved = [];
  let totalDebit = new Prisma.Decimal(0);
  let totalCredit = new Prisma.Decimal(0);
  let totalTransactionDebit = new Prisma.Decimal(0);
  let totalTransactionCredit = new Prisma.Decimal(0);
  for (const line of input.lines) {
    const account = line.accountId
      ? await tx.account.findUnique({ where: { id: line.accountId } })
      : line.mappingKey
        ? await mappedAccount(tx, line.mappingKey)
        : null;
    if (!account?.isActive || !account.allowPosting) {
      throw new AccountingError("الحساب المحاسبي غير صالح للترحيل");
    }
    const debit = new Prisma.Decimal(line.debit ?? 0).toDecimalPlaces(2);
    const credit = new Prisma.Decimal(line.credit ?? 0).toDecimalPlaces(2);
    const transactionDebit = new Prisma.Decimal(line.transactionDebit ?? debit).toDecimalPlaces(2);
    const transactionCredit = new Prisma.Decimal(line.transactionCredit ?? credit).toDecimalPlaces(2);
    if (debit.isNegative() || credit.isNegative() || (debit.isZero() && credit.isZero())) {
      throw new AccountingError("قيمة سطر القيد غير صحيحة");
    }
    totalDebit = totalDebit.plus(debit);
    totalCredit = totalCredit.plus(credit);
    totalTransactionDebit = totalTransactionDebit.plus(transactionDebit);
    totalTransactionCredit = totalTransactionCredit.plus(transactionCredit);
    resolved.push({ account, debit, credit, transactionDebit, transactionCredit, line });
  }
  if (!totalDebit.equals(totalCredit)) {
    throw new AccountingError("القيد المحاسبي غير متوازن");
  }
  if (!totalTransactionDebit.equals(totalTransactionCredit)) {
    throw new AccountingError("القيد غير متوازن بعملة المعاملة");
  }
  const entryNumber = await nextDocumentNumber(tx, "JE", input.entryDate);
  const journal = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: input.entryDate,
      description: input.description,
      referenceType: input.referenceType,
      referenceId: input.referenceId,
      referenceNumber: input.referenceNumber,
      status: "POSTED",
      totalDebit,
      totalCredit,
      transactionCurrencyCode: input.transactionCurrencyCode ?? input.functionalCurrencyCode ?? "SAR",
      functionalCurrencyCode: input.functionalCurrencyCode ?? "SAR",
      exchangeRate: input.exchangeRate ?? 1,
      rateDate: input.rateDate ?? input.entryDate,
      totalTransactionDebit,
      totalTransactionCredit,
      postedAt: new Date(),
      lines: {
        create: resolved.map(({ account, debit, credit, transactionDebit, transactionCredit, line }) => ({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.nameAr,
          debit,
          credit,
          transactionDebit,
          transactionCredit,
          transactionCurrencyCode: input.transactionCurrencyCode ?? input.functionalCurrencyCode ?? "SAR",
          exchangeRate: input.exchangeRate ?? 1,
          partyId: line.partyId ?? null,
          costCenter: line.costCenter ?? null,
          costCenterId: line.costCenterId ?? null,
          costCodeId: line.costCodeId ?? null,
          departmentId: line.departmentId ?? null,
          projectCode: line.projectCode ?? null,
          description: line.description ?? input.description,
        })),
      },
    },
    include: { lines: true },
  });
  await audit(tx, { action: "ACCOUNTING_POST", entityType: "JOURNAL_ENTRY", entityId: journal.id, metadata: { referenceType: input.referenceType, referenceId: input.referenceId } });
  return journal;
}

export async function assertOpenAccountingPeriod(tx: TransactionClient, entryDate: Date) {
  await ensureAccountingFoundation(tx);
  const { companyId } = await getVerifiedDataScope();
  const period = await tx.accountingPeriod.findFirst({
    where: { startDate: { lte: entryDate }, endDate: { gte: entryDate } },
  });
  const fiscalPeriod = await tx.fiscalPeriod.findFirst({
    where: { startDate: { lte: entryDate }, endDate: { gte: entryDate }, fiscalYear: { companyId } },
    include: { fiscalYear: true },
  });
  if (!period || period.status !== "OPEN" || !fiscalPeriod || fiscalPeriod.status !== "OPEN" || fiscalPeriod.fiscalYear.status !== "OPEN") {
    throw new AccountingError("الفترة المحاسبية مغلقة أو غير معرفة لهذا التاريخ");
  }
  return fiscalPeriod;
}

export async function reverseJournalEntry(
  tx: TransactionClient,
  input: { originalId: number; referenceType: string; referenceId: number; referenceNumber?: string | null; description: string }
) {
  const existing = await tx.journalEntry.findFirst({ where: { referenceType: input.referenceType, referenceId: input.referenceId } });
  if (existing) return existing;
  const original = await tx.journalEntry.findUnique({ where: { id: input.originalId }, include: { lines: true } });
  if (!original) throw new AccountingError("القيد الأصلي غير موجود");
  const entryNumber = await nextDocumentNumber(tx, "JE", new Date());
  const reversal = await tx.journalEntry.create({
    data: {
      entryNumber, entryDate: new Date(), description: input.description,
      referenceType: input.referenceType, referenceId: input.referenceId,
      referenceNumber: input.referenceNumber ?? original.referenceNumber,
      status: "POSTED", totalDebit: original.totalCredit, totalCredit: original.totalDebit,
      transactionCurrencyCode: original.transactionCurrencyCode, functionalCurrencyCode: original.functionalCurrencyCode,
      exchangeRate: original.exchangeRate, rateDate: original.rateDate,
      totalTransactionDebit: original.totalTransactionCredit, totalTransactionCredit: original.totalTransactionDebit,
      postedAt: new Date(),
      lines: { create: original.lines.map((line) => ({ accountId: line.accountId, accountCode: line.accountCode,
        accountName: line.accountName, debit: line.credit, credit: line.debit, partyId: line.partyId,
        transactionDebit: line.transactionCredit, transactionCredit: line.transactionDebit,
        transactionCurrencyCode: line.transactionCurrencyCode, exchangeRate: line.exchangeRate,
        costCenter: line.costCenter, costCenterId: line.costCenterId, costCodeId: line.costCodeId, departmentId: line.departmentId, projectCode: line.projectCode,
        description: `عكس ${line.description ?? original.description ?? "القيد"}` })) },
    },
    include: { lines: true },
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED", cancelledAt: new Date() } });
  await audit(tx, { action: "ACCOUNTING_REVERSE", entityType: "JOURNAL_ENTRY", entityId: reversal.id, metadata: { originalId: original.id } });
  return reversal;
}

export async function postSalesInvoiceJournal(tx: TransactionClient, saleId: number) {
  await ensureAccountingFoundation(tx);
  const sale = await tx.sale.findUnique({ where: { id: saleId } });
  if (!sale) throw new AccountingError("فاتورة المبيعات غير موجودة");
  await assertOpenAccountingPeriod(tx, sale.invoiceDate);
  const beforeVat = new Prisma.Decimal(sale.subtotal).minus(sale.discount).toDecimalPlaces(2);
  const fx = await exchangeRateAt(tx, sale.currency, sale.invoiceDate);
  const functionalBeforeVat = functionalAmount(beforeVat, fx.rate);
  const functionalVat = functionalAmount(sale.vatAmount, fx.rate);
  const functionalTotal = functionalAmount(sale.totalAmount, fx.rate);
  const dimension = sale.projectId ? { projectCode: (await tx.project.findUnique({ where: { id: sale.projectId }, select: { projectNumber: true } }))?.projectNumber, costCenterId: sale.costCenterId, costCodeId: sale.costCodeId } : {};
  await tx.sale.update({ where: { id: sale.id }, data: { exchangeRate: fx.rate, rateDate: fx.rateDate,
    functionalSubtotal: functionalAmount(sale.subtotal, fx.rate), functionalDiscount: functionalAmount(sale.discount, fx.rate),
    functionalVatAmount: functionalVat, functionalTotalAmount: functionalTotal } });
  return createBalancedJournal(tx, {
    entryDate: sale.invoiceDate,
    description: `فاتورة مبيعات ${sale.invoiceNumber}`,
    referenceType: "SALES_INVOICE",
    referenceId: sale.id,
    referenceNumber: sale.invoiceNumber,
    transactionCurrencyCode: sale.currency,
    functionalCurrencyCode: fx.company.baseCurrencyCode,
    exchangeRate: fx.rate,
    rateDate: fx.rateDate,
    lines: [
      { mappingKey: "ACCOUNTS_RECEIVABLE", debit: functionalTotal, transactionDebit: sale.totalAmount, partyId: sale.partyId, ...dimension },
      { mappingKey: sale.factoryTransactionId ? "FACTORY_MANUFACTURING_REVENUE" : "SALES_REVENUE", credit: functionalBeforeVat, transactionCredit: beforeVat, ...dimension },
      { mappingKey: "VAT_PAYABLE", credit: functionalVat, transactionCredit: sale.vatAmount, ...dimension },
    ].filter((line) => !new Prisma.Decimal("debit" in line ? line.debit : line.credit).isZero()),
  });
}

export async function postSupplierInvoiceJournal(tx: TransactionClient, purchaseId: number) {
  await ensureAccountingFoundation(tx);
  const purchase = await tx.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) throw new AccountingError("فاتورة المورد غير موجودة");
  await assertOpenAccountingPeriod(tx, purchase.purchaseDate);
  const beforeVat = new Prisma.Decimal(purchase.subtotal).minus(purchase.discount).toDecimalPlaces(2);
  const fx = await exchangeRateAt(tx, purchase.currency, purchase.purchaseDate);
  const functionalBeforeVat = functionalAmount(beforeVat, fx.rate);
  const functionalVat = functionalAmount(purchase.vatAmount, fx.rate);
  const functionalTotal = functionalAmount(purchase.totalAmount, fx.rate);
  const dimension = purchase.projectId ? { projectCode: (await tx.project.findUnique({ where: { id: purchase.projectId }, select: { projectNumber: true } }))?.projectNumber, costCenterId: purchase.costCenterId, costCodeId: purchase.costCodeId } : {};
  await tx.purchase.update({ where: { id: purchase.id }, data: { exchangeRate: fx.rate, rateDate: fx.rateDate,
    functionalSubtotal: functionalAmount(purchase.subtotal, fx.rate), functionalDiscount: functionalAmount(purchase.discount, fx.rate),
    functionalVatAmount: functionalVat, functionalTotalAmount: functionalTotal } });
  return createBalancedJournal(tx, {
    entryDate: purchase.purchaseDate,
    description: `فاتورة مورد ${purchase.purchaseNumber}`,
    referenceType: "SUPPLIER_INVOICE",
    referenceId: purchase.id,
    referenceNumber: purchase.purchaseNumber,
    transactionCurrencyCode: purchase.currency,
    functionalCurrencyCode: fx.company.baseCurrencyCode,
    exchangeRate: fx.rate,
    rateDate: fx.rateDate,
    lines: [
      { mappingKey: "INVENTORY_PURCHASES", debit: functionalBeforeVat, transactionDebit: beforeVat, ...dimension },
      { mappingKey: "INPUT_VAT", debit: functionalVat, transactionDebit: purchase.vatAmount, ...dimension },
      { mappingKey: "ACCOUNTS_PAYABLE", credit: functionalTotal, transactionCredit: purchase.totalAmount, partyId: purchase.partyId, ...dimension },
    ].filter((line) => !new Prisma.Decimal("debit" in line ? line.debit : line.credit).isZero()),
  });
}

export async function postCogsForDeliveryNote(tx: TransactionClient, noteId: number) {
  await ensureAccountingFoundation(tx);
  const note = await tx.deliveryReceiptNote.findUnique({ where: { id: noteId } });
  if (!note) throw new AccountingError("سند التسليم غير موجود");
  if (note.noteType !== "DELIVERY" || note.stockOwnership !== "COMPANY") return null;
  await assertOpenAccountingPeriod(tx, note.noteDate);
  const movements = await tx.stockMovement.findMany({
    where: { referenceType: "DELIVERY_RECEIPT_NOTE", referenceId: noteId, ownershipType: "COMPANY" },
  });
  const value = movements.reduce(
    (sum, movement) => sum.plus(movement.totalValue),
    new Prisma.Decimal(0)
  ).toDecimalPlaces(2);
  if (value.isZero()) return null;
  return createBalancedJournal(tx, {
    entryDate: note.noteDate,
    description: `تكلفة بضاعة السند ${note.noteNumber}`,
    referenceType: "COGS_DELIVERY_NOTE",
    referenceId: note.id,
    referenceNumber: note.noteNumber,
    lines: [
      { mappingKey: "COST_OF_GOODS_SOLD", debit: value },
      { mappingKey: "INVENTORY_ASSET", credit: value },
    ],
  });
}

export async function reverseCogsForDeliveryNote(tx: TransactionClient, noteId: number) {
  const original = await tx.journalEntry.findFirst({
    where: { referenceType: "COGS_DELIVERY_NOTE", referenceId: noteId },
    include: { lines: true },
  });
  if (!original) return null;
  const existing = await tx.journalEntry.findFirst({ where: { referenceType: "COGS_REVERSAL", referenceId: noteId } });
  if (existing) return existing;
  const entryNumber = await nextDocumentNumber(tx, "JE", new Date());
  const reversal = await tx.journalEntry.create({
    data: {
      entryNumber,
      entryDate: new Date(),
      description: `عكس ${original.description ?? original.entryNumber}`,
      referenceType: "COGS_REVERSAL",
      referenceId: noteId,
      referenceNumber: original.referenceNumber,
      status: "POSTED",
      totalDebit: original.totalCredit,
      totalCredit: original.totalDebit,
      postedAt: new Date(),
      lines: {
        create: original.lines.map((line) => ({
          accountId: line.accountId,
          accountCode: line.accountCode,
          accountName: line.accountName,
          debit: line.credit,
          credit: line.debit,
          partyId: line.partyId,
          costCenter: line.costCenter,
          description: `عكس ${line.description ?? "تكلفة البضاعة"}`,
        })),
      },
    },
  });
  await tx.journalEntry.update({ where: { id: original.id }, data: { status: "REVERSED", cancelledAt: new Date() } });
  await audit(tx, { action: "ACCOUNTING_REVERSE", entityType: "JOURNAL_ENTRY", entityId: reversal.id, metadata: { originalId: original.id, noteId } });
  return reversal;
}

export async function withAccountingTransaction<T>(
  prisma: PrismaClient,
  operation: (tx: TransactionClient) => Promise<T>
) {
  return prisma.$transaction(operation);
}
