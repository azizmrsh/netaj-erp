-- AlterTable
ALTER TABLE "FiscalPeriod" ADD COLUMN "closedBy" TEXT;
ALTER TABLE "FiscalPeriod" ADD COLUMN "reopenedAt" DATETIME;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FiscalYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closingJournalEntryId" INTEGER,
    "closedAt" DATETIME,
    "closedBy" TEXT,
    "reopenedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FiscalYear_closingJournalEntryId_fkey" FOREIGN KEY ("closingJournalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FiscalYear" ("closedAt", "companyId", "createdAt", "endDate", "id", "name", "startDate", "status") SELECT "closedAt", "companyId", "createdAt", "endDate", "id", "name", "startDate", "status" FROM "FiscalYear";
DROP TABLE "FiscalYear";
ALTER TABLE "new_FiscalYear" RENAME TO "FiscalYear";
CREATE UNIQUE INDEX "FiscalYear_closingJournalEntryId_key" ON "FiscalYear"("closingJournalEntryId");
CREATE INDEX "FiscalYear_companyId_status_idx" ON "FiscalYear"("companyId", "status");
CREATE UNIQUE INDEX "FiscalYear_companyId_startDate_endDate_key" ON "FiscalYear"("companyId", "startDate", "endDate");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
