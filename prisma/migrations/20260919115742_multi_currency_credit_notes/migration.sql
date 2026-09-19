-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CreditDebitNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "noteNumber" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noteType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "partyId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "purchaseId" INTEGER,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalAmountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
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
INSERT INTO "new_CreditDebitNote" ("amountBeforeVat", "cancelledAt", "companyId", "createdAt", "direction", "id", "journalEntryId", "noteDate", "noteNumber", "noteType", "notes", "partyId", "postedAt", "purchaseId", "reason", "saleId", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "amountBeforeVat", "cancelledAt", "companyId", "createdAt", "direction", "id", "journalEntryId", "noteDate", "noteNumber", "noteType", "notes", "partyId", "postedAt", "purchaseId", "reason", "saleId", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "CreditDebitNote";
DROP TABLE "CreditDebitNote";
ALTER TABLE "new_CreditDebitNote" RENAME TO "CreditDebitNote";
CREATE UNIQUE INDEX "CreditDebitNote_noteNumber_key" ON "CreditDebitNote"("noteNumber");
CREATE UNIQUE INDEX "CreditDebitNote_journalEntryId_key" ON "CreditDebitNote"("journalEntryId");
CREATE INDEX "CreditDebitNote_tenantId_companyId_idx" ON "CreditDebitNote"("tenantId", "companyId");
CREATE INDEX "CreditDebitNote_direction_noteDate_idx" ON "CreditDebitNote"("direction", "noteDate");
CREATE INDEX "CreditDebitNote_partyId_idx" ON "CreditDebitNote"("partyId");
CREATE INDEX "CreditDebitNote_saleId_idx" ON "CreditDebitNote"("saleId");
CREATE INDEX "CreditDebitNote_purchaseId_idx" ON "CreditDebitNote"("purchaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Legacy notes were posted directly in the functional currency.
UPDATE "CreditDebitNote"
SET "currency" = COALESCE((SELECT "baseCurrencyCode" FROM "Company" WHERE "Company"."id" = "CreditDebitNote"."companyId"), 'SAR'),
    "exchangeRate" = 1, "rateDate" = "noteDate",
    "functionalAmountBeforeVat" = "amountBeforeVat",
    "functionalVatAmount" = "vatAmount",
    "functionalTotalAmount" = "totalAmount";
