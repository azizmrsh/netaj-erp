-- CreateTable
CREATE TABLE "FxRevaluation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "revaluationNumber" TEXT NOT NULL,
    "revaluationDate" DATETIME NOT NULL,
    "fiscalYearId" INTEGER NOT NULL,
    "fiscalPeriodId" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "exchangeRate" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGain" DECIMAL NOT NULL DEFAULT 0,
    "totalLoss" DECIMAL NOT NULL DEFAULT 0,
    "journalEntryId" INTEGER,
    "reversalJournalEntryId" INTEGER,
    "reversalDate" DATETIME,
    "postedAt" DATETIME,
    "postedBy" TEXT,
    "reversedAt" DATETIME,
    "reversedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FxRevaluation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluation_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluation_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "FiscalPeriod" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluation_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FxRevaluation_reversalJournalEntryId_fkey" FOREIGN KEY ("reversalJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FxRevaluationLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "revaluationId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "partyId" INTEGER,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sourceNumber" TEXT NOT NULL,
    "transactionBalance" DECIMAL NOT NULL,
    "carryingFunctionalAmount" DECIMAL NOT NULL,
    "revaluedFunctionalAmount" DECIMAL NOT NULL,
    "difference" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FxRevaluationLine_revaluationId_fkey" FOREIGN KEY ("revaluationId") REFERENCES "FxRevaluation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "fiscalYearId" INTEGER NOT NULL,
    "budgetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Budget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Budget_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "budgetId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "fiscalPeriodId" INTEGER,
    "costCenterId" INTEGER,
    "departmentId" INTEGER,
    "projectCode" TEXT,
    "amount" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_fiscalPeriodId_fkey" FOREIGN KEY ("fiscalPeriodId") REFERENCES "FiscalPeriod" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BudgetLine_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" INTEGER NOT NULL,
    "transactionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionType" TEXT NOT NULL,
    "amountIn" DECIMAL NOT NULL DEFAULT 0,
    "amountOut" DECIMAL NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL NOT NULL,
    "functionalAmountIn" DECIMAL NOT NULL DEFAULT 0,
    "functionalAmountOut" DECIMAL NOT NULL DEFAULT 0,
    "functionalBalanceAfter" DECIMAL NOT NULL DEFAULT 0,
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "referenceType" TEXT NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("amountIn", "amountOut", "balanceAfter", "bankAccountId", "companyId", "createdAt", "description", "id", "referenceId", "referenceNumber", "referenceType", "tenantId", "transactionDate", "transactionType") SELECT "amountIn", "amountOut", "balanceAfter", "bankAccountId", "companyId", "createdAt", "description", "id", "referenceId", "referenceNumber", "referenceType", "tenantId", "transactionDate", "transactionType" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE INDEX "BankTransaction_bankAccountId_transactionDate_idx" ON "BankTransaction"("bankAccountId", "transactionDate");
CREATE INDEX "BankTransaction_tenantId_companyId_idx" ON "BankTransaction"("tenantId", "companyId");
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_referenceType_referenceId_key" ON "BankTransaction"("bankAccountId", "referenceType", "referenceId");
CREATE TABLE "new_ExchangeRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL,
    "baseCurrencyCode" TEXT NOT NULL,
    "quoteCurrencyCode" TEXT NOT NULL,
    "rateDate" DATETIME NOT NULL,
    "rate" DECIMAL NOT NULL,
    "source" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeRate_baseCurrencyCode_fkey" FOREIGN KEY ("baseCurrencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeRate_quoteCurrencyCode_fkey" FOREIGN KEY ("quoteCurrencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExchangeRate" ("baseCurrencyCode", "companyId", "createdAt", "id", "quoteCurrencyCode", "rate", "rateDate", "source") SELECT "baseCurrencyCode", "companyId", "createdAt", "id", "quoteCurrencyCode", "rate", "rateDate", "source" FROM "ExchangeRate";
DROP TABLE "ExchangeRate";
ALTER TABLE "new_ExchangeRate" RENAME TO "ExchangeRate";
CREATE INDEX "ExchangeRate_companyId_rateDate_idx" ON "ExchangeRate"("companyId", "rateDate");
CREATE INDEX "ExchangeRate_tenantId_companyId_idx" ON "ExchangeRate"("tenantId", "companyId");
CREATE UNIQUE INDEX "ExchangeRate_companyId_baseCurrencyCode_quoteCurrencyCode_rateDate_key" ON "ExchangeRate"("companyId", "baseCurrencyCode", "quoteCurrencyCode", "rateDate");
CREATE TABLE "new_FinancialVoucher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "voucherDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialVoucher_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialVoucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialVoucher_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinancialVoucher" ("amount", "bankAccountId", "cancelledAt", "companyId", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "paymentMethod", "postedAt", "referenceNumber", "status", "tenantId", "updatedAt", "voucherDate", "voucherNumber", "voucherType") SELECT "amount", "bankAccountId", "cancelledAt", "companyId", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "paymentMethod", "postedAt", "referenceNumber", "status", "tenantId", "updatedAt", "voucherDate", "voucherNumber", "voucherType" FROM "FinancialVoucher";
DROP TABLE "FinancialVoucher";
ALTER TABLE "new_FinancialVoucher" RENAME TO "FinancialVoucher";
CREATE UNIQUE INDEX "FinancialVoucher_voucherNumber_key" ON "FinancialVoucher"("voucherNumber");
CREATE UNIQUE INDEX "FinancialVoucher_journalEntryId_key" ON "FinancialVoucher"("journalEntryId");
CREATE INDEX "FinancialVoucher_voucherDate_idx" ON "FinancialVoucher"("voucherDate");
CREATE INDEX "FinancialVoucher_partyId_idx" ON "FinancialVoucher"("partyId");
CREATE INDEX "FinancialVoucher_status_idx" ON "FinancialVoucher"("status");
CREATE INDEX "FinancialVoucher_tenantId_companyId_idx" ON "FinancialVoucher"("tenantId", "companyId");
CREATE TABLE "new_JournalEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "entryNumber" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "referenceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL NOT NULL DEFAULT 0,
    "transactionCurrencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "functionalCurrencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "totalTransactionDebit" DECIMAL NOT NULL DEFAULT 0,
    "totalTransactionCredit" DECIMAL NOT NULL DEFAULT 0,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_JournalEntry" ("cancelledAt", "companyId", "createdAt", "description", "entryDate", "entryNumber", "id", "postedAt", "referenceId", "referenceNumber", "referenceType", "status", "tenantId", "totalCredit", "totalDebit", "updatedAt") SELECT "cancelledAt", "companyId", "createdAt", "description", "entryDate", "entryNumber", "id", "postedAt", "referenceId", "referenceNumber", "referenceType", "status", "tenantId", "totalCredit", "totalDebit", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE INDEX "JournalEntry_tenantId_companyId_idx" ON "JournalEntry"("tenantId", "companyId");
CREATE UNIQUE INDEX "JournalEntry_referenceType_referenceId_key" ON "JournalEntry"("referenceType", "referenceId");
CREATE TABLE "new_JournalEntryLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "journalEntryId" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountId" INTEGER,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "transactionDebit" DECIMAL NOT NULL DEFAULT 0,
    "transactionCredit" DECIMAL NOT NULL DEFAULT 0,
    "transactionCurrencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "partyId" INTEGER,
    "costCenter" TEXT,
    "costCenterId" INTEGER,
    "departmentId" INTEGER,
    "projectCode" TEXT,
    "description" TEXT,
    CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntryLine" ("accountCode", "accountId", "accountName", "companyId", "costCenter", "credit", "debit", "description", "id", "journalEntryId", "partyId", "tenantId") SELECT "accountCode", "accountId", "accountName", "companyId", "costCenter", "credit", "debit", "description", "id", "journalEntryId", "partyId", "tenantId" FROM "JournalEntryLine";
DROP TABLE "JournalEntryLine";
ALTER TABLE "new_JournalEntryLine" RENAME TO "JournalEntryLine";
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");
CREATE INDEX "JournalEntryLine_partyId_idx" ON "JournalEntryLine"("partyId");
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");
CREATE INDEX "JournalEntryLine_tenantId_companyId_idx" ON "JournalEntryLine"("tenantId", "companyId");
CREATE TABLE "new_Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "receiptNoteId" INTEGER,
    "dueDate" DATETIME,
    "paymentMethod" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "functionalDiscount" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "supplierInvoiceNumber" TEXT,
    "referenceNumber" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_receiptNoteId_fkey" FOREIGN KEY ("receiptNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("companyId", "createdAt", "currency", "discount", "dueDate", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "companyId", "createdAt", "currency", "discount", "dueDate", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");
CREATE UNIQUE INDEX "Purchase_receiptNoteId_key" ON "Purchase"("receiptNoteId");
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
CREATE INDEX "Purchase_partyId_idx" ON "Purchase"("partyId");
CREATE INDEX "Purchase_sourceOrderId_idx" ON "Purchase"("sourceOrderId");
CREATE INDEX "Purchase_tenantId_companyId_idx" ON "Purchase"("tenantId", "companyId");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "deliveryNoteId" INTEGER,
    "factoryTransactionId" INTEGER,
    "referenceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "paymentMethod" TEXT,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "functionalDiscount" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_factoryTransactionId_fkey" FOREIGN KEY ("factoryTransactionId") REFERENCES "FactoryTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("companyId", "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "factoryTransactionId", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "sourceOrderId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "companyId", "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "factoryTransactionId", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "sourceOrderId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_deliveryNoteId_key" ON "Sale"("deliveryNoteId");
CREATE UNIQUE INDEX "Sale_factoryTransactionId_key" ON "Sale"("factoryTransactionId");
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");
CREATE INDEX "Sale_partyId_idx" ON "Sale"("partyId");
CREATE INDEX "Sale_sourceOrderId_idx" ON "Sale"("sourceOrderId");
CREATE INDEX "Sale_tenantId_companyId_idx" ON "Sale"("tenantId", "companyId");
CREATE TABLE "new_VoucherAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL NOT NULL,
    "functionalAmount" DECIMAL NOT NULL DEFAULT 0,
    "carryingFunctionalAmount" DECIMAL NOT NULL DEFAULT 0,
    "realizedFxAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoucherAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinancialVoucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VoucherAllocation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VoucherAllocation" ("amount", "companyId", "createdAt", "id", "purchaseId", "saleId", "tenantId", "voucherId") SELECT "amount", "companyId", "createdAt", "id", "purchaseId", "saleId", "tenantId", "voucherId" FROM "VoucherAllocation";
DROP TABLE "VoucherAllocation";
ALTER TABLE "new_VoucherAllocation" RENAME TO "VoucherAllocation";
CREATE INDEX "VoucherAllocation_saleId_idx" ON "VoucherAllocation"("saleId");
CREATE INDEX "VoucherAllocation_purchaseId_idx" ON "VoucherAllocation"("purchaseId");
CREATE INDEX "VoucherAllocation_tenantId_companyId_idx" ON "VoucherAllocation"("tenantId", "companyId");
CREATE UNIQUE INDEX "VoucherAllocation_voucherId_saleId_key" ON "VoucherAllocation"("voucherId", "saleId");
CREATE UNIQUE INDEX "VoucherAllocation_voucherId_purchaseId_key" ON "VoucherAllocation"("voucherId", "purchaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluation_revaluationNumber_key" ON "FxRevaluation"("revaluationNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluation_journalEntryId_key" ON "FxRevaluation"("journalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluation_reversalJournalEntryId_key" ON "FxRevaluation"("reversalJournalEntryId");

-- CreateIndex
CREATE INDEX "FxRevaluation_tenantId_companyId_revaluationDate_idx" ON "FxRevaluation"("tenantId", "companyId", "revaluationDate");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluation_tenantId_companyId_fiscalPeriodId_currencyCode_key" ON "FxRevaluation"("tenantId", "companyId", "fiscalPeriodId", "currencyCode");

-- CreateIndex
CREATE INDEX "FxRevaluationLine_tenantId_companyId_idx" ON "FxRevaluationLine"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "FxRevaluationLine_revaluationId_idx" ON "FxRevaluationLine"("revaluationId");

-- CreateIndex
CREATE UNIQUE INDEX "FxRevaluationLine_revaluationId_sourceType_sourceId_accountId_key" ON "FxRevaluationLine"("revaluationId", "sourceType", "sourceId", "accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_budgetNumber_key" ON "Budget"("budgetNumber");

-- CreateIndex
CREATE INDEX "Budget_tenantId_companyId_status_idx" ON "Budget"("tenantId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_tenantId_companyId_fiscalYearId_name_key" ON "Budget"("tenantId", "companyId", "fiscalYearId", "name");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_companyId_idx" ON "BudgetLine"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "BudgetLine_budgetId_accountId_fiscalPeriodId_idx" ON "BudgetLine"("budgetId", "accountId", "fiscalPeriodId");

-- CreateIndex
CREATE INDEX "BudgetLine_costCenterId_departmentId_projectCode_idx" ON "BudgetLine"("costCenterId", "departmentId", "projectCode");

-- Safe legacy backfill: all existing NETAj postings were recorded in the company
-- functional currency, therefore the historical transaction amount equals the
-- functional amount at a rate of 1 until an explicit foreign-currency snapshot exists.
UPDATE "JournalEntry"
SET "transactionCurrencyCode" = COALESCE((SELECT "baseCurrencyCode" FROM "Company" WHERE "Company"."id" = "JournalEntry"."companyId"), 'SAR'),
    "functionalCurrencyCode" = COALESCE((SELECT "baseCurrencyCode" FROM "Company" WHERE "Company"."id" = "JournalEntry"."companyId"), 'SAR'),
    "exchangeRate" = 1,
    "rateDate" = "entryDate",
    "totalTransactionDebit" = "totalDebit",
    "totalTransactionCredit" = "totalCredit";
UPDATE "JournalEntryLine"
SET "transactionDebit" = "debit", "transactionCredit" = "credit", "exchangeRate" = 1,
    "transactionCurrencyCode" = COALESCE((SELECT "baseCurrencyCode" FROM "Company" WHERE "Company"."id" = "JournalEntryLine"."companyId"), 'SAR');
UPDATE "Sale"
SET "functionalSubtotal" = "subtotal", "functionalDiscount" = "discount",
    "functionalVatAmount" = "vatAmount", "functionalTotalAmount" = "totalAmount",
    "exchangeRate" = 1, "rateDate" = "invoiceDate";
UPDATE "Purchase"
SET "functionalSubtotal" = "subtotal", "functionalDiscount" = "discount",
    "functionalVatAmount" = "vatAmount", "functionalTotalAmount" = "totalAmount",
    "exchangeRate" = 1, "rateDate" = "purchaseDate";
UPDATE "FinancialVoucher"
SET "currency" = COALESCE((SELECT "currency" FROM "BankAccount" WHERE "BankAccount"."id" = "FinancialVoucher"."bankAccountId"), 'SAR'),
    "functionalAmount" = "amount", "exchangeRate" = 1, "rateDate" = "voucherDate";
UPDATE "VoucherAllocation"
SET "functionalAmount" = "amount", "carryingFunctionalAmount" = "amount", "realizedFxAmount" = 0;
UPDATE "BankTransaction"
SET "functionalAmountIn" = "amountIn", "functionalAmountOut" = "amountOut",
    "functionalBalanceAfter" = "balanceAfter", "exchangeRate" = 1;
