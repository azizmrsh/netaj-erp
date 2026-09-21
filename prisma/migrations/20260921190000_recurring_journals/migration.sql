CREATE TABLE "RecurringJournal" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "branchId" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'SAR',
  "frequency" TEXT NOT NULL,
  "runDay" INTEGER,
  "startDate" DATETIME NOT NULL,
  "endDate" DATETIME,
  "nextRunAt" DATETIME,
  "lastRunAt" DATETIME,
  "retryAt" DATETIME,
  "lastError" TEXT,
  "executionCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "RecurringJournal_tenantId_companyId_code_key" ON "RecurringJournal"("tenantId", "companyId", "code");
CREATE INDEX "RecurringJournal_tenantId_companyId_status_nextRunAt_idx" ON "RecurringJournal"("tenantId", "companyId", "status", "nextRunAt");

CREATE TABLE "RecurringJournalLine" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "recurringJournalId" INTEGER NOT NULL,
  "accountId" INTEGER NOT NULL,
  "debit" DECIMAL NOT NULL DEFAULT 0,
  "credit" DECIMAL NOT NULL DEFAULT 0,
  "description" TEXT,
  "costCenterId" INTEGER,
  "projectCode" TEXT,
  CONSTRAINT "RecurringJournalLine_recurringJournalId_fkey" FOREIGN KEY ("recurringJournalId") REFERENCES "RecurringJournal"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "RecurringJournalLine_tenantId_companyId_recurringJournalId_idx" ON "RecurringJournalLine"("tenantId", "companyId", "recurringJournalId");

CREATE TABLE "RecurringJournalRun" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "recurringJournalId" INTEGER NOT NULL,
  "scheduledFor" DATETIME NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "journalEntryId" INTEGER,
  "entryNumber" TEXT,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "error" TEXT,
  "executedBy" TEXT,
  "executedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RecurringJournalRun_recurringJournalId_fkey" FOREIGN KEY ("recurringJournalId") REFERENCES "RecurringJournal"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "RecurringJournalRun_journalEntryId_key" ON "RecurringJournalRun"("journalEntryId");
CREATE UNIQUE INDEX "RecurringJournalRun_tenantId_companyId_recurringJournalId_scheduledFor_key" ON "RecurringJournalRun"("tenantId", "companyId", "recurringJournalId", "scheduledFor");
CREATE INDEX "RecurringJournalRun_tenantId_companyId_recurringJournalId_idx" ON "RecurringJournalRun"("tenantId", "companyId", "recurringJournalId");
