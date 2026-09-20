-- CreateTable
CREATE TABLE "VehicleOdometerReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "truckId" INTEGER NOT NULL,
    "readingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reading" DECIMAL NOT NULL,
    "sourceType" TEXT NOT NULL DEFAULT 'MANUAL',
    "sourceId" INTEGER,
    "sourceNumber" TEXT,
    "recordedBy" TEXT,
    "correctionReason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleOdometerReading_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleTireRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "truckId" INTEGER NOT NULL,
    "vehiclePart" TEXT NOT NULL DEFAULT 'TRACTOR',
    "axle" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "serialNumber" TEXT,
    "brand" TEXT,
    "size" TEXT,
    "installedAt" DATETIME NOT NULL,
    "installationOdometer" DECIMAL,
    "removedAt" DATETIME,
    "removalOdometer" DECIMAL,
    "replacementReason" TEXT,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "supplier" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INSTALLED',
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleTireRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleBatteryRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "truckId" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "serialNumber" TEXT,
    "brand" TEXT,
    "specification" TEXT,
    "installedAt" DATETIME NOT NULL,
    "installationOdometer" DECIMAL,
    "replacedAt" DATETIME,
    "replacementOdometer" DECIMAL,
    "warrantyExpiry" DATETIME,
    "supplier" TEXT,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'INSTALLED',
    "replacementReason" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleBatteryRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleFuelTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "truckId" INTEGER NOT NULL,
    "driverId" INTEGER,
    "tripId" INTEGER,
    "transactionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometer" DECIMAL,
    "liters" DECIMAL NOT NULL,
    "pricePerLiter" DECIMAL NOT NULL,
    "totalAmount" DECIMAL NOT NULL,
    "expectedLiters" DECIMAL,
    "varianceLiters" DECIMAL,
    "variancePercent" DECIMAL,
    "supplier" TEXT,
    "referenceNumber" TEXT,
    "paymentSource" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleFuelTransaction_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "VehicleFuelTransaction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VehicleMaintenanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "truckId" INTEGER NOT NULL,
    "maintenanceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometer" DECIMAL,
    "maintenanceType" TEXT NOT NULL,
    "issue" TEXT,
    "workDone" TEXT,
    "workshop" TEXT,
    "partsAndServices" TEXT,
    "cost" DECIMAL NOT NULL DEFAULT 0,
    "downtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "nextDate" DATETIME,
    "nextOdometer" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleMaintenanceRecord_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportReceipt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "receiptNumber" TEXT NOT NULL,
    "tripId" INTEGER NOT NULL,
    "receiptDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "truckId" INTEGER,
    "driverId" INTEGER,
    "source" TEXT,
    "destination" TEXT,
    "material" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "rate" DECIMAL NOT NULL DEFAULT 0,
    "calculationBasis" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "journalEntryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportReceipt_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TransportReceipt_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportReceipt_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Truck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "plateNumber" TEXT NOT NULL,
    "truckType" TEXT,
    "model" TEXT,
    "modelYear" INTEGER,
    "trailerType" TEXT,
    "capacity" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fleetCode" TEXT,
    "make" TEXT,
    "vin" TEXT,
    "serialNumber" TEXT,
    "color" TEXT,
    "ownershipType" TEXT,
    "branchName" TEXT,
    "assignedDriverId" INTEGER,
    "currentOdometer" DECIMAL NOT NULL DEFAULT 0,
    "acquisitionDate" DATETIME,
    "acquisitionCost" DECIMAL,
    "fuelTankCapacity" DECIMAL,
    "outOfServiceReason" TEXT,
    "fuelType" TEXT,
    "fuelConsumption" DECIMAL,
    "fuelPrice" DECIMAL,
    "maintenancePerKm" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Truck_assignedDriverId_fkey" FOREIGN KEY ("assignedDriverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Truck" ("capacity", "companyId", "createdAt", "fuelConsumption", "fuelPrice", "fuelType", "id", "maintenancePerKm", "model", "modelYear", "notes", "plateNumber", "status", "tenantId", "trailerType", "truckType", "updatedAt") SELECT "capacity", "companyId", "createdAt", "fuelConsumption", "fuelPrice", "fuelType", "id", "maintenancePerKm", "model", "modelYear", "notes", "plateNumber", "status", "tenantId", "trailerType", "truckType", "updatedAt" FROM "Truck";
DROP TABLE "Truck";
ALTER TABLE "new_Truck" RENAME TO "Truck";
CREATE UNIQUE INDEX "Truck_plateNumber_key" ON "Truck"("plateNumber");
CREATE UNIQUE INDEX "Truck_fleetCode_key" ON "Truck"("fleetCode");
CREATE INDEX "Truck_tenantId_companyId_idx" ON "Truck"("tenantId", "companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "VehicleOdometerReading_tenantId_companyId_truckId_readingDate_idx" ON "VehicleOdometerReading"("tenantId", "companyId", "truckId", "readingDate");

-- CreateIndex
CREATE INDEX "VehicleTireRecord_tenantId_companyId_truckId_status_idx" ON "VehicleTireRecord"("tenantId", "companyId", "truckId", "status");

-- CreateIndex
CREATE INDEX "VehicleTireRecord_truckId_vehiclePart_axle_position_idx" ON "VehicleTireRecord"("truckId", "vehiclePart", "axle", "position");

-- CreateIndex
CREATE INDEX "VehicleBatteryRecord_tenantId_companyId_truckId_status_idx" ON "VehicleBatteryRecord"("tenantId", "companyId", "truckId", "status");

-- CreateIndex
CREATE INDEX "VehicleFuelTransaction_tenantId_companyId_truckId_transactionDate_idx" ON "VehicleFuelTransaction"("tenantId", "companyId", "truckId", "transactionDate");

-- CreateIndex
CREATE INDEX "VehicleFuelTransaction_tripId_idx" ON "VehicleFuelTransaction"("tripId");

-- CreateIndex
CREATE INDEX "VehicleMaintenanceRecord_tenantId_companyId_truckId_maintenanceDate_idx" ON "VehicleMaintenanceRecord"("tenantId", "companyId", "truckId", "maintenanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportReceipt_receiptNumber_key" ON "TransportReceipt"("receiptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportReceipt_tripId_key" ON "TransportReceipt"("tripId");

-- CreateIndex
CREATE INDEX "TransportReceipt_tenantId_companyId_receiptDate_status_idx" ON "TransportReceipt"("tenantId", "companyId", "receiptDate", "status");
