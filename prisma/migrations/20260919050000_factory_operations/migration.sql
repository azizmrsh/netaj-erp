CREATE TABLE "FactoryFeeRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "partyId" INTEGER NOT NULL, "itemId" INTEGER NOT NULL,
    "feePerTon" DECIMAL NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryFeeRate_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FactoryFeeRate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "FactoryFuelMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "movementNumber" TEXT NOT NULL,
    "movementDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "itemId" INTEGER NOT NULL, "movementType" TEXT NOT NULL,
    "quantityIn" DECIMAL NOT NULL DEFAULT 0, "quantityOut" DECIMAL NOT NULL DEFAULT 0, "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL DEFAULT 0, "balanceAfter" DECIMAL NOT NULL, "balanceValue" DECIMAL NOT NULL,
    "productionItemId" INTEGER, "stockMovementId" INTEGER NOT NULL, "journalEntryId" INTEGER,
    "referenceType" TEXT, "referenceId" INTEGER, "referenceNumber" TEXT, "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FactoryFuelMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FactoryFuelMovement_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FactoryFuelMovement_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "FactoryMaintenance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "maintenanceNumber" TEXT NOT NULL,
    "maintenanceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "equipment" TEXT NOT NULL, "maintenanceType" TEXT NOT NULL,
    "spareParts" TEXT, "laborDescription" TEXT, "vendor" TEXT, "description" TEXT, "amount" DECIMAL NOT NULL DEFAULT 0,
    "expenseId" INTEGER, "status" TEXT NOT NULL DEFAULT 'POSTED', "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryMaintenance_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_FactoryTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT, "transactionNumber" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "partyId" INTEGER, "itemId" INTEGER,
    "transactionType" TEXT NOT NULL, "quantity" DECIMAL NOT NULL DEFAULT 0,
    "manufacturingFeePerTon" DECIMAL NOT NULL DEFAULT 0, "manufacturingFeeTotal" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT, "notes" TEXT, "status" TEXT NOT NULL DEFAULT 'POSTED', "referenceType" TEXT,
    "referenceId" INTEGER, "referenceNumber" TEXT, "journalEntryId" INTEGER, "postedAt" DATETIME, "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryTransaction_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FactoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FactoryTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FactoryTransaction" ("createdAt", "description", "id", "itemId", "manufacturingFeePerTon", "manufacturingFeeTotal", "notes", "partyId", "quantity", "transactionDate", "transactionNumber", "transactionType", "updatedAt") SELECT "createdAt", "description", "id", "itemId", "manufacturingFeePerTon", "manufacturingFeeTotal", "notes", "partyId", "quantity", "transactionDate", "transactionNumber", "transactionType", "updatedAt" FROM "FactoryTransaction";
DROP TABLE "FactoryTransaction";
ALTER TABLE "new_FactoryTransaction" RENAME TO "FactoryTransaction";
CREATE UNIQUE INDEX "FactoryTransaction_transactionNumber_key" ON "FactoryTransaction"("transactionNumber");
CREATE UNIQUE INDEX "FactoryTransaction_journalEntryId_key" ON "FactoryTransaction"("journalEntryId");
CREATE INDEX "FactoryTransaction_transactionDate_idx" ON "FactoryTransaction"("transactionDate");
CREATE INDEX "FactoryTransaction_partyId_idx" ON "FactoryTransaction"("partyId");
CREATE INDEX "FactoryTransaction_itemId_idx" ON "FactoryTransaction"("itemId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE UNIQUE INDEX "FactoryFeeRate_partyId_itemId_key" ON "FactoryFeeRate"("partyId", "itemId");
CREATE UNIQUE INDEX "FactoryFuelMovement_movementNumber_key" ON "FactoryFuelMovement"("movementNumber");
CREATE UNIQUE INDEX "FactoryFuelMovement_stockMovementId_key" ON "FactoryFuelMovement"("stockMovementId");
CREATE UNIQUE INDEX "FactoryFuelMovement_journalEntryId_key" ON "FactoryFuelMovement"("journalEntryId");
CREATE INDEX "FactoryFuelMovement_movementDate_idx" ON "FactoryFuelMovement"("movementDate");
CREATE INDEX "FactoryFuelMovement_itemId_idx" ON "FactoryFuelMovement"("itemId");
CREATE INDEX "FactoryFuelMovement_productionItemId_idx" ON "FactoryFuelMovement"("productionItemId");
CREATE UNIQUE INDEX "FactoryMaintenance_maintenanceNumber_key" ON "FactoryMaintenance"("maintenanceNumber");
CREATE UNIQUE INDEX "FactoryMaintenance_expenseId_key" ON "FactoryMaintenance"("expenseId");
CREATE INDEX "FactoryMaintenance_maintenanceDate_idx" ON "FactoryMaintenance"("maintenanceDate");
