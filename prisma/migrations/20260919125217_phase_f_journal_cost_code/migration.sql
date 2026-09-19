-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "costCodeId" INTEGER,
    "departmentId" INTEGER,
    "projectCode" TEXT,
    "description" TEXT,
    CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "JournalEntryLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntryLine" ("accountCode", "accountId", "accountName", "companyId", "costCenter", "costCenterId", "credit", "debit", "departmentId", "description", "exchangeRate", "id", "journalEntryId", "partyId", "projectCode", "tenantId", "transactionCredit", "transactionCurrencyCode", "transactionDebit") SELECT "accountCode", "accountId", "accountName", "companyId", "costCenter", "costCenterId", "credit", "debit", "departmentId", "description", "exchangeRate", "id", "journalEntryId", "partyId", "projectCode", "tenantId", "transactionCredit", "transactionCurrencyCode", "transactionDebit" FROM "JournalEntryLine";
DROP TABLE "JournalEntryLine";
ALTER TABLE "new_JournalEntryLine" RENAME TO "JournalEntryLine";
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");
CREATE INDEX "JournalEntryLine_partyId_idx" ON "JournalEntryLine"("partyId");
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");
CREATE INDEX "JournalEntryLine_costCodeId_idx" ON "JournalEntryLine"("costCodeId");
CREATE INDEX "JournalEntryLine_tenantId_companyId_idx" ON "JournalEntryLine"("tenantId", "companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
