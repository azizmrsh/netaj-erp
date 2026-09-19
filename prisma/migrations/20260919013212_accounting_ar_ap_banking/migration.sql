-- CreateTable
CREATE TABLE "CostCenter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExpenseCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RevenueCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RevenueCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL NOT NULL DEFAULT 0,
    "ledgerAccountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "bankAccountId" INTEGER NOT NULL,
    "transactionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionType" TEXT NOT NULL,
    "amountIn" DECIMAL NOT NULL DEFAULT 0,
    "amountOut" DECIMAL NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FinancialVoucher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherNumber" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "voucherDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER,
    "amount" DECIMAL NOT NULL,
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

-- CreateTable
CREATE TABLE "VoucherAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoucherAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinancialVoucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VoucherAllocation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherNumber" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "beneficiary" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "cashBankAccount" TEXT,
    "costCenter" TEXT,
    "responsibleEmployee" TEXT,
    "project" TEXT,
    "categoryId" INTEGER,
    "bankAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountBeforeVat", "beneficiary", "cashBankAccount", "costCenter", "createdAt", "description", "expenseDate", "expenseType", "id", "notes", "paymentMethod", "referenceNumber", "responsibleEmployee", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "amountBeforeVat", "beneficiary", "cashBankAccount", "costCenter", "createdAt", "description", "expenseDate", "expenseType", "id", "notes", "paymentMethod", "referenceNumber", "responsibleEmployee", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_voucherNumber_key" ON "Expense"("voucherNumber");
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_expenseType_idx" ON "Expense"("expenseType");
CREATE TABLE "new_Revenue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "voucherNumber" TEXT NOT NULL,
    "revenueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revenueType" TEXT NOT NULL,
    "partyId" INTEGER,
    "description" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "collectionMethod" TEXT,
    "cashBankAccount" TEXT,
    "activity" TEXT,
    "costCenter" TEXT,
    "categoryId" INTEGER,
    "bankAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Revenue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RevenueCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Revenue" ("activity", "amountBeforeVat", "cashBankAccount", "collectionMethod", "costCenter", "createdAt", "description", "id", "notes", "partyId", "referenceNumber", "revenueDate", "revenueType", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "activity", "amountBeforeVat", "cashBankAccount", "collectionMethod", "costCenter", "createdAt", "description", "id", "notes", "partyId", "referenceNumber", "revenueDate", "revenueType", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Revenue";
DROP TABLE "Revenue";
ALTER TABLE "new_Revenue" RENAME TO "Revenue";
CREATE UNIQUE INDEX "Revenue_voucherNumber_key" ON "Revenue"("voucherNumber");
CREATE UNIQUE INDEX "Revenue_journalEntryId_key" ON "Revenue"("journalEntryId");
CREATE INDEX "Revenue_revenueDate_idx" ON "Revenue"("revenueDate");
CREATE INDEX "Revenue_partyId_idx" ON "Revenue"("partyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseCategory_code_key" ON "ExpenseCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "RevenueCategory_code_key" ON "RevenueCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_iban_key" ON "BankAccount"("iban");

-- CreateIndex
CREATE INDEX "BankTransaction_bankAccountId_transactionDate_idx" ON "BankTransaction"("bankAccountId", "transactionDate");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_referenceType_referenceId_key" ON "BankTransaction"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialVoucher_voucherNumber_key" ON "FinancialVoucher"("voucherNumber");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialVoucher_journalEntryId_key" ON "FinancialVoucher"("journalEntryId");

-- CreateIndex
CREATE INDEX "FinancialVoucher_voucherDate_idx" ON "FinancialVoucher"("voucherDate");

-- CreateIndex
CREATE INDEX "FinancialVoucher_partyId_idx" ON "FinancialVoucher"("partyId");

-- CreateIndex
CREATE INDEX "FinancialVoucher_status_idx" ON "FinancialVoucher"("status");

-- CreateIndex
CREATE INDEX "VoucherAllocation_saleId_idx" ON "VoucherAllocation"("saleId");

-- CreateIndex
CREATE INDEX "VoucherAllocation_purchaseId_idx" ON "VoucherAllocation"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherAllocation_voucherId_saleId_key" ON "VoucherAllocation"("voucherId", "saleId");

-- CreateIndex
CREATE UNIQUE INDEX "VoucherAllocation_voucherId_purchaseId_key" ON "VoucherAllocation"("voucherId", "purchaseId");
