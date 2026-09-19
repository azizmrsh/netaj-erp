-- Replace the overly broad transaction reference constraint so the two sides
-- of one transfer can be recorded safely in different bank accounts.
DROP INDEX "BankTransaction_referenceType_referenceId_key";

CREATE TABLE "BankTransfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "transferNumber" TEXT NOT NULL,
    "transferDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromBankAccountId" INTEGER NOT NULL,
    "toBankAccountId" INTEGER NOT NULL,
    "amount" DECIMAL NOT NULL,
    "fees" DECIMAL NOT NULL DEFAULT 0,
    "referenceNumber" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransfer_fromBankAccountId_fkey" FOREIGN KEY ("fromBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankTransfer_toBankAccountId_fkey" FOREIGN KEY ("toBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BankTransfer_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "BankTransfer_transferNumber_key" ON "BankTransfer"("transferNumber");
CREATE UNIQUE INDEX "BankTransfer_journalEntryId_key" ON "BankTransfer"("journalEntryId");
CREATE INDEX "BankTransfer_transferDate_idx" ON "BankTransfer"("transferDate");
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_referenceType_referenceId_key" ON "BankTransaction"("bankAccountId", "referenceType", "referenceId");
