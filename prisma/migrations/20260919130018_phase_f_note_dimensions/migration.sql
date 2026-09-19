-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryReceiptNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "noteNumber" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceDocumentId" INTEGER,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "stockOwnership" TEXT NOT NULL DEFAULT 'PARTY',
    "invoiceNumber" TEXT,
    "orderNumber" TEXT,
    "referenceNumber" TEXT,
    "transportMethod" TEXT,
    "truckId" INTEGER,
    "driverId" INTEGER,
    "carrierName" TEXT,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "driverIdNumber" TEXT,
    "driverPhone" TEXT,
    "source" TEXT,
    "loadingPoint" TEXT,
    "unloadingPoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "stockPostedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "recipientName" TEXT,
    "recipientSignature" TEXT,
    "recipientSignedAt" DATETIME,
    "purchasingName" TEXT,
    "purchasingSignature" TEXT,
    "purchasingSignedAt" DATETIME,
    "warehouseName" TEXT,
    "warehouseSignature" TEXT,
    "warehouseSignedAt" DATETIME,
    "accountantName" TEXT,
    "accountantSignature" TEXT,
    "accountantSignedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryReceiptNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryReceiptNote" ("accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "companyId", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "sourceDocumentId", "status", "stockOwnership", "stockPostedAt", "tenantId", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt") SELECT "accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "companyId", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "sourceDocumentId", "status", "stockOwnership", "stockPostedAt", "tenantId", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt" FROM "DeliveryReceiptNote";
DROP TABLE "DeliveryReceiptNote";
ALTER TABLE "new_DeliveryReceiptNote" RENAME TO "DeliveryReceiptNote";
CREATE UNIQUE INDEX "DeliveryReceiptNote_noteNumber_key" ON "DeliveryReceiptNote"("noteNumber");
CREATE INDEX "DeliveryReceiptNote_noteDate_idx" ON "DeliveryReceiptNote"("noteDate");
CREATE INDEX "DeliveryReceiptNote_partyId_idx" ON "DeliveryReceiptNote"("partyId");
CREATE INDEX "DeliveryReceiptNote_sourceDocumentId_idx" ON "DeliveryReceiptNote"("sourceDocumentId");
CREATE INDEX "DeliveryReceiptNote_projectId_costCodeId_idx" ON "DeliveryReceiptNote"("projectId", "costCodeId");
CREATE INDEX "DeliveryReceiptNote_tenantId_companyId_idx" ON "DeliveryReceiptNote"("tenantId", "companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
