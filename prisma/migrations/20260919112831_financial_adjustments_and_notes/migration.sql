-- CreateTable
CREATE TABLE "CreditDebitNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "noteNumber" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noteType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "partyId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "purchaseId" INTEGER,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CreditDebitNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CreditDebitNote_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditDebitNote_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CreditDebitNote_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "adjustmentNumber" TEXT NOT NULL,
    "adjustmentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "adjustmentType" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "referenceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingAdjustment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingAdjustmentLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "adjustmentId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "partyId" INTEGER,
    "costCenter" TEXT,
    "description" TEXT,
    CONSTRAINT "AccountingAdjustmentLine_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "AccountingAdjustment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountingAdjustmentLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "CreditDebitNote_noteNumber_key" ON "CreditDebitNote"("noteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "CreditDebitNote_journalEntryId_key" ON "CreditDebitNote"("journalEntryId");

-- CreateIndex
CREATE INDEX "CreditDebitNote_tenantId_companyId_idx" ON "CreditDebitNote"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "CreditDebitNote_direction_noteDate_idx" ON "CreditDebitNote"("direction", "noteDate");

-- CreateIndex
CREATE INDEX "CreditDebitNote_partyId_idx" ON "CreditDebitNote"("partyId");

-- CreateIndex
CREATE INDEX "CreditDebitNote_saleId_idx" ON "CreditDebitNote"("saleId");

-- CreateIndex
CREATE INDEX "CreditDebitNote_purchaseId_idx" ON "CreditDebitNote"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAdjustment_adjustmentNumber_key" ON "AccountingAdjustment"("adjustmentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingAdjustment_journalEntryId_key" ON "AccountingAdjustment"("journalEntryId");

-- CreateIndex
CREATE INDEX "AccountingAdjustment_tenantId_companyId_idx" ON "AccountingAdjustment"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "AccountingAdjustment_adjustmentType_adjustmentDate_idx" ON "AccountingAdjustment"("adjustmentType", "adjustmentDate");

-- CreateIndex
CREATE INDEX "AccountingAdjustmentLine_tenantId_companyId_idx" ON "AccountingAdjustmentLine"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "AccountingAdjustmentLine_adjustmentId_idx" ON "AccountingAdjustmentLine"("adjustmentId");

-- CreateIndex
CREATE INDEX "AccountingAdjustmentLine_accountId_idx" ON "AccountingAdjustmentLine"("accountId");
