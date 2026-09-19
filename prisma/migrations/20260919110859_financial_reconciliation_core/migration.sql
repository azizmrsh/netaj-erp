-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "reconciliationNumber" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "statementOpeningBalance" DECIMAL NOT NULL DEFAULT 0,
    "statementClosingBalance" DECIMAL NOT NULL DEFAULT 0,
    "matchedNet" DECIMAL NOT NULL DEFAULT 0,
    "calculatedStatementBalance" DECIMAL NOT NULL DEFAULT 0,
    "bookClosingBalance" DECIMAL NOT NULL DEFAULT 0,
    "difference" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "completedAt" DATETIME,
    "completedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankReconciliationLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "reconciliationId" INTEGER NOT NULL,
    "bankTransactionId" INTEGER NOT NULL,
    "statementReference" TEXT,
    "matchedAmount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankReconciliationLine_reconciliationId_fkey" FOREIGN KEY ("reconciliationId") REFERENCES "BankReconciliation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BankReconciliationLine_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VatReturn" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "returnNumber" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "periodEnd" DATETIME NOT NULL,
    "documentOutputVat" DECIMAL NOT NULL DEFAULT 0,
    "documentInputVat" DECIMAL NOT NULL DEFAULT 0,
    "ledgerOutputVat" DECIMAL NOT NULL DEFAULT 0,
    "ledgerInputVat" DECIMAL NOT NULL DEFAULT 0,
    "netVatDue" DECIMAL NOT NULL DEFAULT 0,
    "variance" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "filingJournalEntryId" INTEGER,
    "settlementJournalEntryId" INTEGER,
    "bankAccountId" INTEGER,
    "filedAt" DATETIME,
    "filedBy" TEXT,
    "settledAt" DATETIME,
    "settledBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VatReturn_filingJournalEntryId_fkey" FOREIGN KEY ("filingJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VatReturn_settlementJournalEntryId_fkey" FOREIGN KEY ("settlementJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VatReturn_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VatReturnLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "vatReturnId" INTEGER NOT NULL,
    "direction" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" INTEGER NOT NULL,
    "sourceNumber" TEXT NOT NULL,
    "sourceDate" DATETIME NOT NULL,
    "netAmount" DECIMAL NOT NULL DEFAULT 0,
    "documentVat" DECIMAL NOT NULL DEFAULT 0,
    "ledgerVat" DECIMAL NOT NULL DEFAULT 0,
    "variance" DECIMAL NOT NULL DEFAULT 0,
    "journalEntryId" INTEGER,
    CONSTRAINT "VatReturnLine_vatReturnId_fkey" FOREIGN KEY ("vatReturnId") REFERENCES "VatReturn" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_reconciliationNumber_key" ON "BankReconciliation"("reconciliationNumber");

-- CreateIndex
CREATE INDEX "BankReconciliation_tenantId_companyId_idx" ON "BankReconciliation"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "BankReconciliation_bankAccountId_periodEnd_idx" ON "BankReconciliation"("bankAccountId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_tenantId_companyId_bankAccountId_periodStart_periodEnd_key" ON "BankReconciliation"("tenantId", "companyId", "bankAccountId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliationLine_bankTransactionId_key" ON "BankReconciliationLine"("bankTransactionId");

-- CreateIndex
CREATE INDEX "BankReconciliationLine_tenantId_companyId_idx" ON "BankReconciliationLine"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "BankReconciliationLine_reconciliationId_idx" ON "BankReconciliationLine"("reconciliationId");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturn_returnNumber_key" ON "VatReturn"("returnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturn_filingJournalEntryId_key" ON "VatReturn"("filingJournalEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturn_settlementJournalEntryId_key" ON "VatReturn"("settlementJournalEntryId");

-- CreateIndex
CREATE INDEX "VatReturn_tenantId_companyId_idx" ON "VatReturn"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "VatReturn_status_periodEnd_idx" ON "VatReturn"("status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturn_tenantId_companyId_periodStart_periodEnd_key" ON "VatReturn"("tenantId", "companyId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "VatReturnLine_tenantId_companyId_idx" ON "VatReturnLine"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "VatReturnLine_sourceType_sourceId_idx" ON "VatReturnLine"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "VatReturnLine_vatReturnId_sourceType_sourceId_key" ON "VatReturnLine"("vatReturnId", "sourceType", "sourceId");
