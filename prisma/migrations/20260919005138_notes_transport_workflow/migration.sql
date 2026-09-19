-- AlterTable
ALTER TABLE "DeliveryReceiptNoteItem" ADD COLUMN "weight" DECIMAL;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryReceiptNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noteNumber" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
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
    CONSTRAINT "DeliveryReceiptNote_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryReceiptNote" ("accountantName", "carrierName", "createdAt", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "recipientName", "referenceNumber", "source", "status", "transportMethod", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName") SELECT "accountantName", "carrierName", "createdAt", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "recipientName", "referenceNumber", "source", "status", "transportMethod", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName" FROM "DeliveryReceiptNote";
DROP TABLE "DeliveryReceiptNote";
ALTER TABLE "new_DeliveryReceiptNote" RENAME TO "DeliveryReceiptNote";
CREATE UNIQUE INDEX "DeliveryReceiptNote_noteNumber_key" ON "DeliveryReceiptNote"("noteNumber");
CREATE INDEX "DeliveryReceiptNote_noteDate_idx" ON "DeliveryReceiptNote"("noteDate");
CREATE INDEX "DeliveryReceiptNote_partyId_idx" ON "DeliveryReceiptNote"("partyId");
CREATE TABLE "new_TransportTrip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tripNumber" TEXT NOT NULL,
    "tripDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noteId" INTEGER,
    "partyId" INTEGER,
    "itemId" INTEGER,
    "truckId" INTEGER,
    "driverId" INTEGER,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "weight" DECIMAL,
    "source" TEXT,
    "loadingPoint" TEXT,
    "unloadingPoint" TEXT,
    "estimatedKm" DECIMAL,
    "actualKm" DECIMAL,
    "transportRevenue" DECIMAL NOT NULL DEFAULT 0,
    "transportPricePerTon" DECIMAL,
    "fuelLiters" DECIMAL NOT NULL DEFAULT 0,
    "fuelPricePerLiter" DECIMAL NOT NULL DEFAULT 0,
    "fuelCost" DECIMAL NOT NULL DEFAULT 0,
    "driverTripFee" DECIMAL NOT NULL DEFAULT 0,
    "driverPaidAmount" DECIMAL NOT NULL DEFAULT 0,
    "driverPaymentStatus" TEXT NOT NULL DEFAULT 'DUE',
    "maintenanceCost" DECIMAL NOT NULL DEFAULT 0,
    "administrativeCost" DECIMAL NOT NULL DEFAULT 0,
    "roadPermitCost" DECIMAL NOT NULL DEFAULT 0,
    "otherCost" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "netProfit" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrip_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransportTrip" ("actualKm", "administrativeCost", "createdAt", "driverId", "driverPaidAmount", "driverPaymentStatus", "driverTripFee", "estimatedKm", "fuelCost", "fuelLiters", "fuelPricePerLiter", "id", "itemId", "loadingPoint", "maintenanceCost", "netProfit", "noteId", "notes", "otherCost", "partyId", "quantity", "roadPermitCost", "source", "status", "totalCost", "transportPricePerTon", "transportRevenue", "tripDate", "tripNumber", "truckId", "unloadingPoint", "updatedAt", "weight") SELECT "actualKm", "administrativeCost", "createdAt", "driverId", "driverPaidAmount", "driverPaymentStatus", "driverTripFee", "estimatedKm", "fuelCost", "fuelLiters", "fuelPricePerLiter", "id", "itemId", "loadingPoint", "maintenanceCost", "netProfit", "noteId", "notes", "otherCost", "partyId", "quantity", "roadPermitCost", "source", "status", "totalCost", "transportPricePerTon", "transportRevenue", "tripDate", "tripNumber", "truckId", "unloadingPoint", "updatedAt", "weight" FROM "TransportTrip";
DROP TABLE "TransportTrip";
ALTER TABLE "new_TransportTrip" RENAME TO "TransportTrip";
CREATE UNIQUE INDEX "TransportTrip_tripNumber_key" ON "TransportTrip"("tripNumber");
CREATE UNIQUE INDEX "TransportTrip_noteId_key" ON "TransportTrip"("noteId");
CREATE INDEX "TransportTrip_tripDate_idx" ON "TransportTrip"("tripDate");
CREATE INDEX "TransportTrip_partyId_idx" ON "TransportTrip"("partyId");
CREATE INDEX "TransportTrip_itemId_idx" ON "TransportTrip"("itemId");
CREATE INDEX "TransportTrip_truckId_idx" ON "TransportTrip"("truckId");
CREATE INDEX "TransportTrip_driverId_idx" ON "TransportTrip"("driverId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
