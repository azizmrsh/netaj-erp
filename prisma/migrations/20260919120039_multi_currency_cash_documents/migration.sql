-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "beneficiary" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalAmountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_Expense" ("amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "companyId", "costCenter", "createdAt", "description", "expenseDate", "expenseType", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "referenceNumber", "responsibleEmployee", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "companyId", "costCenter", "createdAt", "description", "expenseDate", "expenseType", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "referenceNumber", "responsibleEmployee", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_voucherNumber_key" ON "Expense"("voucherNumber");
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_expenseType_idx" ON "Expense"("expenseType");
CREATE INDEX "Expense_tenantId_companyId_idx" ON "Expense"("tenantId", "companyId");
CREATE TABLE "new_Revenue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "revenueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revenueType" TEXT NOT NULL,
    "partyId" INTEGER,
    "description" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalAmountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_Revenue" ("activity", "amountBeforeVat", "bankAccountId", "cancelledAt", "cashBankAccount", "categoryId", "collectionMethod", "companyId", "costCenter", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "postedAt", "referenceNumber", "revenueDate", "revenueType", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "activity", "amountBeforeVat", "bankAccountId", "cancelledAt", "cashBankAccount", "categoryId", "collectionMethod", "companyId", "costCenter", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "postedAt", "referenceNumber", "revenueDate", "revenueType", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Revenue";
DROP TABLE "Revenue";
ALTER TABLE "new_Revenue" RENAME TO "Revenue";
CREATE UNIQUE INDEX "Revenue_voucherNumber_key" ON "Revenue"("voucherNumber");
CREATE UNIQUE INDEX "Revenue_journalEntryId_key" ON "Revenue"("journalEntryId");
CREATE INDEX "Revenue_revenueDate_idx" ON "Revenue"("revenueDate");
CREATE INDEX "Revenue_partyId_idx" ON "Revenue"("partyId");
CREATE INDEX "Revenue_tenantId_companyId_idx" ON "Revenue"("tenantId", "companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Legacy cash documents were posted in functional currency.
UPDATE "Expense" SET "currency" = COALESCE((SELECT "baseCurrencyCode" FROM "Company" WHERE "Company"."id" = "Expense"."companyId"), 'SAR'),
  "exchangeRate" = 1, "rateDate" = "expenseDate", "functionalAmountBeforeVat" = "amountBeforeVat", "functionalVatAmount" = "vatAmount", "functionalTotalAmount" = "totalAmount";
UPDATE "Revenue" SET "currency" = COALESCE((SELECT "baseCurrencyCode" FROM "Company" WHERE "Company"."id" = "Revenue"."companyId"), 'SAR'),
  "exchangeRate" = 1, "rateDate" = "revenueDate", "functionalAmountBeforeVat" = "amountBeforeVat", "functionalVatAmount" = "vatAmount", "functionalTotalAmount" = "totalAmount";
