CREATE TABLE "VehicleTireOdometerReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "tireRecordId" INTEGER NOT NULL,
    "readingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometer" DECIMAL NOT NULL,
    "recordedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleTireOdometerReading_tireRecordId_fkey" FOREIGN KEY ("tireRecordId") REFERENCES "VehicleTireRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "VehicleBatteryOdometerReading" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "batteryRecordId" INTEGER NOT NULL,
    "readingDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometer" DECIMAL NOT NULL,
    "recordedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VehicleBatteryOdometerReading_batteryRecordId_fkey" FOREIGN KEY ("batteryRecordId") REFERENCES "VehicleBatteryRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "VehicleTireOdometerReading_tenantId_companyId_tireRecordId_readingDate_idx" ON "VehicleTireOdometerReading"("tenantId", "companyId", "tireRecordId", "readingDate");
CREATE INDEX "VehicleBatteryOdometerReading_tenantId_companyId_batteryRecordId_readingDate_idx" ON "VehicleBatteryOdometerReading"("tenantId", "companyId", "batteryRecordId", "readingDate");
