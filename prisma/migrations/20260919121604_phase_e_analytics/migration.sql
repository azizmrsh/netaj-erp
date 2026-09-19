-- CreateTable
CREATE TABLE "FactoryProductionTarget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "targetTons" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryProductionTarget_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EquipmentReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "readingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assetType" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "readingType" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "openingValue" DECIMAL,
    "usedValue" DECIMAL,
    "closingValue" DECIMAL,
    "readingValue" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "FactoryProductionTarget_tenantId_companyId_idx" ON "FactoryProductionTarget"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryProductionTarget_tenantId_companyId_year_month_itemId_key" ON "FactoryProductionTarget"("tenantId", "companyId", "year", "month", "itemId");

-- CreateIndex
CREATE INDEX "EquipmentReading_readingDate_idx" ON "EquipmentReading"("readingDate");

-- CreateIndex
CREATE INDEX "EquipmentReading_assetType_assetName_idx" ON "EquipmentReading"("assetType", "assetName");

-- CreateIndex
CREATE INDEX "EquipmentReading_tenantId_companyId_idx" ON "EquipmentReading"("tenantId", "companyId");
