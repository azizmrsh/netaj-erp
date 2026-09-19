-- CreateTable
CREATE TABLE "BusinessDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentNumber" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "documentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" DATETIME,
    "neededDate" DATETIME,
    "partyId" INTEGER NOT NULL,
    "sourceDocumentId" INTEGER,
    "referenceNumber" TEXT,
    "salesperson" TEXT,
    "requester" TEXT,
    "department" TEXT,
    "costCenter" TEXT,
    "priority" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "bankDetails" TEXT,
    "paymentTerms" TEXT,
    "deliveryTime" TEXT,
    "deliveryPlace" TEXT,
    "deliveryTerms" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessDocument_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocument_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusinessDocumentLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'ITEM',
    "itemId" INTEGER,
    "description" TEXT,
    "materialGrade" TEXT,
    "specifications" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "BusinessDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "BusinessDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocumentLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentSequence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "prefix" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadedBy" TEXT,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "userId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "accountType" TEXT NOT NULL,
    "parentId" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "allowPosting" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DeliveryReceiptNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "noteNumber" TEXT NOT NULL,
    "noteType" TEXT NOT NULL,
    "noteDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceDocumentId" INTEGER,
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
    CONSTRAINT "DeliveryReceiptNote_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNote_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryReceiptNote" ("accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "status", "stockOwnership", "stockPostedAt", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt") SELECT "accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "status", "stockOwnership", "stockPostedAt", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt" FROM "DeliveryReceiptNote";
DROP TABLE "DeliveryReceiptNote";
ALTER TABLE "new_DeliveryReceiptNote" RENAME TO "DeliveryReceiptNote";
CREATE UNIQUE INDEX "DeliveryReceiptNote_noteNumber_key" ON "DeliveryReceiptNote"("noteNumber");
CREATE INDEX "DeliveryReceiptNote_noteDate_idx" ON "DeliveryReceiptNote"("noteDate");
CREATE INDEX "DeliveryReceiptNote_partyId_idx" ON "DeliveryReceiptNote"("partyId");
CREATE INDEX "DeliveryReceiptNote_sourceDocumentId_idx" ON "DeliveryReceiptNote"("sourceDocumentId");
CREATE TABLE "new_JournalEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entryNumber" TEXT NOT NULL,
    "entryDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "referenceNumber" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalDebit" DECIMAL NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL NOT NULL DEFAULT 0,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_JournalEntry" ("createdAt", "description", "entryDate", "entryNumber", "id", "referenceId", "referenceNumber", "referenceType", "status", "updatedAt") SELECT "createdAt", "description", "entryDate", "entryNumber", "id", "referenceId", "referenceNumber", "referenceType", "status", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE UNIQUE INDEX "JournalEntry_referenceType_referenceId_key" ON "JournalEntry"("referenceType", "referenceId");
CREATE TABLE "new_JournalEntryLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "journalEntryId" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountId" INTEGER,
    "debit" DECIMAL NOT NULL DEFAULT 0,
    "credit" DECIMAL NOT NULL DEFAULT 0,
    "partyId" INTEGER,
    "costCenter" TEXT,
    "description" TEXT,
    CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JournalEntryLine" ("accountCode", "accountName", "costCenter", "credit", "debit", "description", "id", "journalEntryId", "partyId") SELECT "accountCode", "accountName", "costCenter", "credit", "debit", "description", "id", "journalEntryId", "partyId" FROM "JournalEntryLine";
DROP TABLE "JournalEntryLine";
ALTER TABLE "new_JournalEntryLine" RENAME TO "JournalEntryLine";
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");
CREATE INDEX "JournalEntryLine_partyId_idx" ON "JournalEntryLine"("partyId");
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");
CREATE TABLE "new_Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "receiptNoteId" INTEGER,
    "dueDate" DATETIME,
    "paymentMethod" TEXT,
    "supplierInvoiceNumber" TEXT,
    "referenceNumber" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_receiptNoteId_fkey" FOREIGN KEY ("receiptNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("createdAt", "discount", "id", "notes", "partyId", "purchaseDate", "purchaseNumber", "referenceNumber", "status", "subtotal", "supplierInvoiceNumber", "totalAmount", "updatedAt", "vatAmount") SELECT "createdAt", "discount", "id", "notes", "partyId", "purchaseDate", "purchaseNumber", "referenceNumber", "status", "subtotal", "supplierInvoiceNumber", "totalAmount", "updatedAt", "vatAmount" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");
CREATE UNIQUE INDEX "Purchase_receiptNoteId_key" ON "Purchase"("receiptNoteId");
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
CREATE INDEX "Purchase_partyId_idx" ON "Purchase"("partyId");
CREATE INDEX "Purchase_sourceOrderId_idx" ON "Purchase"("sourceOrderId");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "deliveryNoteId" INTEGER,
    "referenceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "paymentMethod" TEXT,
    "dueDate" DATETIME,
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
    CONSTRAINT "Sale_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "discount", "dueDate", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount") SELECT "createdAt", "discount", "dueDate", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_deliveryNoteId_key" ON "Sale"("deliveryNoteId");
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");
CREATE INDEX "Sale_partyId_idx" ON "Sale"("partyId");
CREATE INDEX "Sale_sourceOrderId_idx" ON "Sale"("sourceOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_documentNumber_key" ON "BusinessDocument"("documentNumber");

-- CreateIndex
CREATE INDEX "BusinessDocument_documentType_documentDate_idx" ON "BusinessDocument"("documentType", "documentDate");

-- CreateIndex
CREATE INDEX "BusinessDocument_partyId_idx" ON "BusinessDocument"("partyId");

-- CreateIndex
CREATE INDEX "BusinessDocument_status_idx" ON "BusinessDocument"("status");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDocument_sourceDocumentId_documentType_key" ON "BusinessDocument"("sourceDocumentId", "documentType");

-- CreateIndex
CREATE INDEX "BusinessDocumentLine_documentId_idx" ON "BusinessDocumentLine"("documentId");

-- CreateIndex
CREATE INDEX "BusinessDocumentLine_itemId_idx" ON "BusinessDocumentLine"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentSequence_code_year_key" ON "DocumentSequence"("code", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storedName_key" ON "Attachment"("storedName");

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingMapping_key_key" ON "AccountingMapping"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingPeriod_startDate_endDate_key" ON "AccountingPeriod"("startDate", "endDate");
