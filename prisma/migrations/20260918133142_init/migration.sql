-- CreateTable
CREATE TABLE "Party" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "unifiedNumber" TEXT,
    "vatNumber" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "isCustomer" BOOLEAN NOT NULL DEFAULT false,
    "isSupplier" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PartyAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partyId" INTEGER NOT NULL,
    "buildingNumber" TEXT,
    "street" TEXT,
    "secondaryNumber" TEXT,
    "district" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "region" TEXT,
    "shortAddress" TEXT,
    "mapLink" TEXT,
    CONSTRAINT "PartyAddress_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ItemCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "categoryId" INTEGER,
    "unitId" INTEGER NOT NULL,
    "specification" TEXT,
    "manufacturer" TEXT,
    "countryOfOrigin" TEXT,
    "batchNumber" TEXT,
    "costPrice" DECIMAL NOT NULL DEFAULT 0,
    "salePrice" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 15,
    "minimumStock" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ItemCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Item_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "averageCost" DECIMAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PartyStockAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "partyId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "averageValue" DECIMAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartyStockAccount_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartyStockAccount_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "movementNumber" TEXT NOT NULL,
    "movementDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" INTEGER NOT NULL,
    "partyId" INTEGER,
    "ownershipType" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantityIn" DECIMAL NOT NULL DEFAULT 0,
    "quantityOut" DECIMAL NOT NULL DEFAULT 0,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryReceiptNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noteNumber" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "invoiceNumber" TEXT,
    "orderNumber" TEXT,
    "referenceNumber" TEXT,
    "transportMethod" TEXT,
    "carrierName" TEXT,
    "vehiclePlate" TEXT,
    "driverName" TEXT,
    "driverIdNumber" TEXT,
    "driverPhone" TEXT,
    "source" TEXT,
    "loadingPoint" TEXT,
    "unloadingPoint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "recipientName" TEXT,
    "purchasingName" TEXT,
    "warehouseName" TEXT,
    "accountantName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DeliveryReceiptNote_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeliveryReceiptNoteItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noteId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT,
    "materialGrade" TEXT,
    "orderNumber" TEXT,
    "quantity" DECIMAL NOT NULL,
    CONSTRAINT "DeliveryReceiptNoteItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNoteItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Truck" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "plateNumber" TEXT NOT NULL,
    "truckType" TEXT,
    "model" TEXT,
    "modelYear" INTEGER,
    "trailerType" TEXT,
    "capacity" DECIMAL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "fuelType" TEXT,
    "fuelConsumption" DECIMAL,
    "fuelPrice" DECIMAL,
    "maintenancePerKm" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TruckDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "truckId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issueDate" DATETIME,
    "expiryDate" DATETIME,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TruckDocument_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "idNumber" TEXT,
    "phone" TEXT,
    "nationality" TEXT,
    "licenseNumber" TEXT,
    "licenseExpiry" DATETIME,
    "passportNumber" TEXT,
    "passportExpiry" DATETIME,
    "driverCardNumber" TEXT,
    "driverCardExpiry" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "DriverDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "driverId" INTEGER NOT NULL,
    "documentType" TEXT NOT NULL,
    "documentNumber" TEXT,
    "issueDate" DATETIME,
    "expiryDate" DATETIME,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DriverDocument_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportTrip" (
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
    CONSTRAINT "TransportTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransportTripExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tripId" INTEGER NOT NULL,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "attachmentUrl" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransportTripExpense_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "TransportTrip" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Party_unifiedNumber_key" ON "Party"("unifiedNumber");

-- CreateIndex
CREATE UNIQUE INDEX "PartyAddress_partyId_key" ON "PartyAddress"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyStock_itemId_key" ON "CompanyStock"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "PartyStockAccount_partyId_itemId_key" ON "PartyStockAccount"("partyId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_movementNumber_key" ON "StockMovement"("movementNumber");

-- CreateIndex
CREATE INDEX "StockMovement_movementDate_idx" ON "StockMovement"("movementDate");

-- CreateIndex
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");

-- CreateIndex
CREATE INDEX "StockMovement_partyId_idx" ON "StockMovement"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryReceiptNote_noteNumber_key" ON "DeliveryReceiptNote"("noteNumber");

-- CreateIndex
CREATE INDEX "DeliveryReceiptNote_noteDate_idx" ON "DeliveryReceiptNote"("noteDate");

-- CreateIndex
CREATE INDEX "DeliveryReceiptNote_partyId_idx" ON "DeliveryReceiptNote"("partyId");

-- CreateIndex
CREATE INDEX "DeliveryReceiptNoteItem_noteId_idx" ON "DeliveryReceiptNoteItem"("noteId");

-- CreateIndex
CREATE INDEX "DeliveryReceiptNoteItem_itemId_idx" ON "DeliveryReceiptNoteItem"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "Truck_plateNumber_key" ON "Truck"("plateNumber");

-- CreateIndex
CREATE INDEX "TruckDocument_truckId_idx" ON "TruckDocument"("truckId");

-- CreateIndex
CREATE INDEX "TruckDocument_expiryDate_idx" ON "TruckDocument"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_idNumber_key" ON "Driver"("idNumber");

-- CreateIndex
CREATE INDEX "DriverDocument_driverId_idx" ON "DriverDocument"("driverId");

-- CreateIndex
CREATE INDEX "DriverDocument_expiryDate_idx" ON "DriverDocument"("expiryDate");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTrip_tripNumber_key" ON "TransportTrip"("tripNumber");

-- CreateIndex
CREATE UNIQUE INDEX "TransportTrip_noteId_key" ON "TransportTrip"("noteId");

-- CreateIndex
CREATE INDEX "TransportTrip_tripDate_idx" ON "TransportTrip"("tripDate");

-- CreateIndex
CREATE INDEX "TransportTrip_partyId_idx" ON "TransportTrip"("partyId");

-- CreateIndex
CREATE INDEX "TransportTrip_itemId_idx" ON "TransportTrip"("itemId");

-- CreateIndex
CREATE INDEX "TransportTrip_truckId_idx" ON "TransportTrip"("truckId");

-- CreateIndex
CREATE INDEX "TransportTrip_driverId_idx" ON "TransportTrip"("driverId");

-- CreateIndex
CREATE INDEX "TransportTripExpense_tripId_idx" ON "TransportTripExpense"("tripId");
