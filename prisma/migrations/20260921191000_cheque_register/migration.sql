CREATE TABLE "ChequeBook" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "code" TEXT NOT NULL,
  "bankAccountId" INTEGER NOT NULL,
  "issueDate" DATETIME NOT NULL,
  "firstNumber" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "createdBy" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX "ChequeBook_tenantId_companyId_code_key" ON "ChequeBook"("tenantId", "companyId", "code");
CREATE INDEX "ChequeBook_tenantId_companyId_bankAccountId_idx" ON "ChequeBook"("tenantId", "companyId", "bankAccountId");
CREATE TABLE "Cheque" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "internalNumber" TEXT NOT NULL,
  "registrationKey" TEXT NOT NULL,
  "direction" TEXT NOT NULL,
  "chequeNumber" TEXT NOT NULL,
  "bankAccountId" INTEGER NOT NULL,
  "draweeBank" TEXT NOT NULL DEFAULT '',
  "draweeAccount" TEXT NOT NULL DEFAULT '',
  "chequeBookId" INTEGER,
  "partyId" INTEGER NOT NULL,
  "counterAccountId" INTEGER NOT NULL,
  "suspenseAccountId" INTEGER NOT NULL,
  "branchId" INTEGER,
  "amount" DECIMAL NOT NULL,
  "currency" TEXT NOT NULL,
  "issueDate" DATETIME NOT NULL,
  "dueDate" DATETIME NOT NULL,
  "description" TEXT NOT NULL,
  "referenceNumber" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "issueJournalId" INTEGER,
  "clearingJournalId" INTEGER,
  "reversalJournalId" INTEGER,
  "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
  "functionalAmount" DECIMAL NOT NULL DEFAULT 0,
  "clearingFunctionalAmount" DECIMAL,
  "clearedAt" DATETIME,
  "cancelledAt" DATETIME,
  "cancellationReason" TEXT,
  "createdBy" TEXT NOT NULL,
  "approvedBy" TEXT,
  "approvedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Cheque_chequeBookId_fkey" FOREIGN KEY ("chequeBookId") REFERENCES "ChequeBook"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Cheque_tenantId_companyId_internalNumber_key" ON "Cheque"("tenantId", "companyId", "internalNumber");
CREATE UNIQUE INDEX "Cheque_tenantId_companyId_registrationKey_key" ON "Cheque"("tenantId", "companyId", "registrationKey");
CREATE UNIQUE INDEX "Cheque_tenantId_companyId_direction_bankAccountId_draweeBank_draweeAccount_chequeNumber_key" ON "Cheque"("tenantId", "companyId", "direction", "bankAccountId", "draweeBank", "draweeAccount", "chequeNumber");
CREATE UNIQUE INDEX "Cheque_issueJournalId_key" ON "Cheque"("issueJournalId");
CREATE UNIQUE INDEX "Cheque_clearingJournalId_key" ON "Cheque"("clearingJournalId");
CREATE UNIQUE INDEX "Cheque_reversalJournalId_key" ON "Cheque"("reversalJournalId");
CREATE INDEX "Cheque_tenantId_companyId_direction_status_dueDate_idx" ON "Cheque"("tenantId", "companyId", "direction", "status", "dueDate");
