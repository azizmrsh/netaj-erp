-- AlterTable
ALTER TABLE "UnifiedApprovalRequest" ADD COLUMN "assignedRoleCode" TEXT;
ALTER TABLE "UnifiedApprovalRequest" ADD COLUMN "assignedUserId" INTEGER;

-- CreateTable
CREATE TABLE "PartyStockValuationRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "partyId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "effectiveAt" DATETIME NOT NULL,
    "unitValue" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PartyStockValuationRate_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PartyStockValuationRate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FactoryProductSetting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "productItemId" INTEGER NOT NULL,
    "rawItemId" INTEGER NOT NULL,
    "fuelItemId" INTEGER,
    "defaultFuelPercentage" DECIMAL NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExpenseAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "expenseId" INTEGER NOT NULL,
    "costCenterId" INTEGER NOT NULL,
    "percentage" DECIMAL NOT NULL,
    "amountBeforeVat" DECIMAL NOT NULL,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExpenseAllocation_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExpenseAllocation_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InventoryCount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "countNumber" TEXT NOT NULL,
    "countDate" DATETIME NOT NULL,
    "frequency" TEXT NOT NULL,
    "ownershipType" TEXT NOT NULL DEFAULT 'COMPANY',
    "partyId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "InventoryCountLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "inventoryCountId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "systemQuantity" DECIMAL NOT NULL,
    "countedQuantity" DECIMAL NOT NULL,
    "variance" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "adjustmentMovementId" INTEGER,
    "notes" TEXT,
    CONSTRAINT "InventoryCountLine_inventoryCountId_fkey" FOREIGN KEY ("inventoryCountId") REFERENCES "InventoryCount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InventoryCountLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

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
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "amendedAt" DATETIME,
    "amendedBy" TEXT,
    "amendmentReason" TEXT,
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
INSERT INTO "new_DeliveryReceiptNote" ("accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "companyId", "costCenterId", "costCodeId", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "projectId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "sourceDocumentId", "status", "stockOwnership", "stockPostedAt", "tenantId", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt") SELECT "accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "companyId", "costCenterId", "costCodeId", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "projectId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "sourceDocumentId", "status", "stockOwnership", "stockPostedAt", "tenantId", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt" FROM "DeliveryReceiptNote";
DROP TABLE "DeliveryReceiptNote";
ALTER TABLE "new_DeliveryReceiptNote" RENAME TO "DeliveryReceiptNote";
CREATE UNIQUE INDEX "DeliveryReceiptNote_noteNumber_key" ON "DeliveryReceiptNote"("noteNumber");
CREATE INDEX "DeliveryReceiptNote_noteDate_idx" ON "DeliveryReceiptNote"("noteDate");
CREATE INDEX "DeliveryReceiptNote_partyId_idx" ON "DeliveryReceiptNote"("partyId");
CREATE INDEX "DeliveryReceiptNote_sourceDocumentId_idx" ON "DeliveryReceiptNote"("sourceDocumentId");
CREATE INDEX "DeliveryReceiptNote_projectId_costCodeId_idx" ON "DeliveryReceiptNote"("projectId", "costCodeId");
CREATE INDEX "DeliveryReceiptNote_tenantId_companyId_idx" ON "DeliveryReceiptNote"("tenantId", "companyId");
CREATE TABLE "new_Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "beneficiary" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalAmountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "cashBankAccount" TEXT,
    "costCenter" TEXT,
    "responsibleEmployee" TEXT,
    "project" TEXT,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "truckId" INTEGER,
    "categoryId" INTEGER,
    "bankAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "companyId", "costCenter", "costCenterId", "costCodeId", "createdAt", "currency", "description", "exchangeRate", "expenseDate", "expenseType", "functionalAmountBeforeVat", "functionalTotalAmount", "functionalVatAmount", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "projectId", "rateDate", "referenceNumber", "responsibleEmployee", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "companyId", "costCenter", "costCenterId", "costCodeId", "createdAt", "currency", "description", "exchangeRate", "expenseDate", "expenseType", "functionalAmountBeforeVat", "functionalTotalAmount", "functionalVatAmount", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "projectId", "rateDate", "referenceNumber", "responsibleEmployee", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_voucherNumber_key" ON "Expense"("voucherNumber");
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_expenseType_idx" ON "Expense"("expenseType");
CREATE INDEX "Expense_projectId_costCodeId_idx" ON "Expense"("projectId", "costCodeId");
CREATE INDEX "Expense_tenantId_companyId_idx" ON "Expense"("tenantId", "companyId");
CREATE TABLE "new_FactoryTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "transactionNumber" TEXT NOT NULL,
    "transactionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER,
    "itemId" INTEGER,
    "transactionType" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "rawItemId" INTEGER,
    "productItemId" INTEGER,
    "fuelItemId" INTEGER,
    "fuelPercentage" DECIMAL NOT NULL DEFAULT 0,
    "rawQuantity" DECIMAL NOT NULL DEFAULT 0,
    "fuelQuantity" DECIMAL NOT NULL DEFAULT 0,
    "manufacturingFeePerTon" DECIMAL NOT NULL DEFAULT 0,
    "manufacturingFeeTotal" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "description" TEXT,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "referenceNumber" TEXT,
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryTransaction_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FactoryTransaction_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FactoryTransaction_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FactoryTransaction" ("cancelledAt", "companyId", "createdAt", "description", "id", "itemId", "journalEntryId", "manufacturingFeePerTon", "manufacturingFeeTotal", "notes", "partyId", "postedAt", "quantity", "referenceId", "referenceNumber", "referenceType", "status", "tenantId", "totalAmount", "transactionDate", "transactionNumber", "transactionType", "updatedAt", "vatAmount", "vatRate") SELECT "cancelledAt", "companyId", "createdAt", "description", "id", "itemId", "journalEntryId", "manufacturingFeePerTon", "manufacturingFeeTotal", "notes", "partyId", "postedAt", "quantity", "referenceId", "referenceNumber", "referenceType", "status", "tenantId", "totalAmount", "transactionDate", "transactionNumber", "transactionType", "updatedAt", "vatAmount", "vatRate" FROM "FactoryTransaction";
DROP TABLE "FactoryTransaction";
ALTER TABLE "new_FactoryTransaction" RENAME TO "FactoryTransaction";
CREATE UNIQUE INDEX "FactoryTransaction_transactionNumber_key" ON "FactoryTransaction"("transactionNumber");
CREATE UNIQUE INDEX "FactoryTransaction_journalEntryId_key" ON "FactoryTransaction"("journalEntryId");
CREATE INDEX "FactoryTransaction_transactionDate_idx" ON "FactoryTransaction"("transactionDate");
CREATE INDEX "FactoryTransaction_partyId_idx" ON "FactoryTransaction"("partyId");
CREATE INDEX "FactoryTransaction_itemId_idx" ON "FactoryTransaction"("itemId");
CREATE INDEX "FactoryTransaction_tenantId_companyId_idx" ON "FactoryTransaction"("tenantId", "companyId");
CREATE TABLE "new_FiscalPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fiscalYearId" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "closedBy" TEXT,
    "reopenedAt" DATETIME,
    "closeWarningsJson" TEXT NOT NULL DEFAULT '[]',
    "closeOverrideReason" TEXT,
    "closeApprovedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FiscalPeriod" ("closedAt", "closedBy", "createdAt", "endDate", "fiscalYearId", "id", "name", "periodNumber", "reopenedAt", "startDate", "status") SELECT "closedAt", "closedBy", "createdAt", "endDate", "fiscalYearId", "id", "name", "periodNumber", "reopenedAt", "startDate", "status" FROM "FiscalPeriod";
DROP TABLE "FiscalPeriod";
ALTER TABLE "new_FiscalPeriod" RENAME TO "FiscalPeriod";
CREATE INDEX "FiscalPeriod_startDate_endDate_idx" ON "FiscalPeriod"("startDate", "endDate");
CREATE UNIQUE INDEX "FiscalPeriod_fiscalYearId_periodNumber_key" ON "FiscalPeriod"("fiscalYearId", "periodNumber");
CREATE TABLE "new_ImportBatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "batchNumber" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "importMode" TEXT NOT NULL DEFAULT 'FULL',
    "duplicateStrategy" TEXT NOT NULL DEFAULT 'SKIP',
    "sourceSystemId" INTEGER,
    "legacySystem" TEXT NOT NULL DEFAULT 'GENERIC',
    "sourceFile" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "cutoverDate" DATETIME,
    "mappingJson" TEXT NOT NULL DEFAULT '{}',
    "sheetsJson" TEXT NOT NULL DEFAULT '[]',
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "impactJson" TEXT NOT NULL DEFAULT '{}',
    "reconciliationJson" TEXT NOT NULL DEFAULT '{}',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "warningRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "dryRunAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "executedAt" DATETIME,
    "rolledBackAt" DATETIME,
    "rollbackStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "rollbackBlockedReason" TEXT,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportBatch_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "LegacySourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ImportBatch" ("approvedAt", "approvedBy", "batchNumber", "companyId", "createdAt", "createdBy", "createdRows", "cutoverDate", "dryRunAt", "duplicateRows", "duplicateStrategy", "executedAt", "failureReason", "fileHash", "id", "impactJson", "importMode", "invalidRows", "legacySystem", "mappingJson", "reconciliationJson", "rollbackBlockedReason", "rollbackStatus", "rolledBackAt", "sheetsJson", "skippedRows", "sourceFile", "sourceSystemId", "status", "summaryJson", "targetType", "tenantId", "totalRows", "updatedAt", "updatedRows", "validRows", "warningRows") SELECT "approvedAt", "approvedBy", "batchNumber", "companyId", "createdAt", "createdBy", "createdRows", "cutoverDate", "dryRunAt", "duplicateRows", "duplicateStrategy", "executedAt", "failureReason", "fileHash", "id", "impactJson", "importMode", "invalidRows", "legacySystem", "mappingJson", "reconciliationJson", "rollbackBlockedReason", "rollbackStatus", "rolledBackAt", "sheetsJson", "skippedRows", "sourceFile", "sourceSystemId", "status", "summaryJson", "targetType", "tenantId", "totalRows", "updatedAt", "updatedRows", "validRows", "warningRows" FROM "ImportBatch";
DROP TABLE "ImportBatch";
ALTER TABLE "new_ImportBatch" RENAME TO "ImportBatch";
CREATE UNIQUE INDEX "ImportBatch_batchNumber_key" ON "ImportBatch"("batchNumber");
CREATE INDEX "ImportBatch_tenantId_companyId_createdAt_idx" ON "ImportBatch"("tenantId", "companyId", "createdAt");
CREATE INDEX "ImportBatch_tenantId_companyId_status_idx" ON "ImportBatch"("tenantId", "companyId", "status");
CREATE INDEX "ImportBatch_fileHash_targetType_idx" ON "ImportBatch"("fileHash", "targetType");
CREATE INDEX "ImportBatch_sourceSystemId_targetType_idx" ON "ImportBatch"("sourceSystemId", "targetType");
CREATE TABLE "new_ImportTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "targetType" TEXT NOT NULL,
    "sourceSystemId" INTEGER,
    "headerFingerprint" TEXT,
    "name" TEXT NOT NULL,
    "mappingJson" TEXT NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ImportTemplate_sourceSystemId_fkey" FOREIGN KEY ("sourceSystemId") REFERENCES "LegacySourceSystem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ImportTemplate" ("companyId", "createdAt", "createdBy", "headerFingerprint", "id", "isDefault", "mappingJson", "name", "sourceSystemId", "targetType", "tenantId", "updatedAt") SELECT "companyId", "createdAt", "createdBy", "headerFingerprint", "id", "isDefault", "mappingJson", "name", "sourceSystemId", "targetType", "tenantId", "updatedAt" FROM "ImportTemplate";
DROP TABLE "ImportTemplate";
ALTER TABLE "new_ImportTemplate" RENAME TO "ImportTemplate";
CREATE INDEX "ImportTemplate_tenantId_companyId_targetType_idx" ON "ImportTemplate"("tenantId", "companyId", "targetType");
CREATE INDEX "ImportTemplate_sourceSystemId_targetType_headerFingerprint_idx" ON "ImportTemplate"("sourceSystemId", "targetType", "headerFingerprint");
CREATE UNIQUE INDEX "ImportTemplate_tenantId_companyId_targetType_name_key" ON "ImportTemplate"("tenantId", "companyId", "targetType", "name");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "deliveryNoteId" INTEGER,
    "factoryTransactionId" INTEGER,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "referenceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "paymentMethod" TEXT,
    "transportMode" TEXT NOT NULL DEFAULT 'NONE',
    "includedTransportRevenue" DECIMAL NOT NULL DEFAULT 0,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "functionalDiscount" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_factoryTransactionId_fkey" FOREIGN KEY ("factoryTransactionId") REFERENCES "FactoryTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("companyId", "costCenterId", "costCodeId", "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "exchangeRate", "factoryTransactionId", "functionalDiscount", "functionalSubtotal", "functionalTotalAmount", "functionalVatAmount", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "projectId", "purchaseOrderNumber", "rateDate", "referenceNumber", "sourceOrderId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "companyId", "costCenterId", "costCodeId", "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "exchangeRate", "factoryTransactionId", "functionalDiscount", "functionalSubtotal", "functionalTotalAmount", "functionalVatAmount", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "projectId", "purchaseOrderNumber", "rateDate", "referenceNumber", "sourceOrderId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_deliveryNoteId_key" ON "Sale"("deliveryNoteId");
CREATE UNIQUE INDEX "Sale_factoryTransactionId_key" ON "Sale"("factoryTransactionId");
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");
CREATE INDEX "Sale_partyId_idx" ON "Sale"("partyId");
CREATE INDEX "Sale_sourceOrderId_idx" ON "Sale"("sourceOrderId");
CREATE INDEX "Sale_projectId_costCodeId_idx" ON "Sale"("projectId", "costCodeId");
CREATE INDEX "Sale_tenantId_companyId_invoiceDate_status_idx" ON "Sale"("tenantId", "companyId", "invoiceDate", "status");
CREATE INDEX "Sale_tenantId_companyId_partyId_dueDate_idx" ON "Sale"("tenantId", "companyId", "partyId", "dueDate");
CREATE INDEX "Sale_tenantId_companyId_idx" ON "Sale"("tenantId", "companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "PartyStockValuationRate_tenantId_companyId_effectiveAt_idx" ON "PartyStockValuationRate"("tenantId", "companyId", "effectiveAt");

-- CreateIndex
CREATE UNIQUE INDEX "PartyStockValuationRate_partyId_itemId_effectiveAt_key" ON "PartyStockValuationRate"("partyId", "itemId", "effectiveAt");

-- CreateIndex
CREATE INDEX "FactoryProductSetting_tenantId_companyId_idx" ON "FactoryProductSetting"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "FactoryProductSetting_companyId_productItemId_key" ON "FactoryProductSetting"("companyId", "productItemId");

-- CreateIndex
CREATE INDEX "ExpenseAllocation_tenantId_companyId_costCenterId_idx" ON "ExpenseAllocation"("tenantId", "companyId", "costCenterId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseAllocation_expenseId_costCenterId_key" ON "ExpenseAllocation"("expenseId", "costCenterId");

-- CreateIndex
CREATE INDEX "InventoryCount_tenantId_companyId_countDate_status_idx" ON "InventoryCount"("tenantId", "companyId", "countDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCount_tenantId_companyId_countNumber_key" ON "InventoryCount"("tenantId", "companyId", "countNumber");

-- CreateIndex
CREATE INDEX "InventoryCountLine_tenantId_companyId_itemId_idx" ON "InventoryCountLine"("tenantId", "companyId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryCountLine_inventoryCountId_itemId_key" ON "InventoryCountLine"("inventoryCountId", "itemId");
