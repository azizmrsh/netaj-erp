-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_Account" ("accountType", "allowPosting", "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "parentId", "updatedAt") SELECT "accountType", "allowPosting", "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "parentId", "updatedAt" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");
CREATE INDEX "Account_parentId_idx" ON "Account"("parentId");
CREATE INDEX "Account_tenantId_companyId_idx" ON "Account"("tenantId", "companyId");
CREATE TABLE "new_AccountingMapping" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "key" TEXT NOT NULL,
    "accountId" INTEGER NOT NULL,
    "description" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingMapping_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AccountingMapping" ("accountId", "description", "id", "key", "updatedAt") SELECT "accountId", "description", "id", "key", "updatedAt" FROM "AccountingMapping";
DROP TABLE "AccountingMapping";
ALTER TABLE "new_AccountingMapping" RENAME TO "AccountingMapping";
CREATE UNIQUE INDEX "AccountingMapping_key_key" ON "AccountingMapping"("key");
CREATE INDEX "AccountingMapping_tenantId_companyId_idx" ON "AccountingMapping"("tenantId", "companyId");
CREATE TABLE "new_AccountingPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AccountingPeriod" ("closedAt", "createdAt", "endDate", "id", "name", "startDate", "status") SELECT "closedAt", "createdAt", "endDate", "id", "name", "startDate", "status" FROM "AccountingPeriod";
DROP TABLE "AccountingPeriod";
ALTER TABLE "new_AccountingPeriod" RENAME TO "AccountingPeriod";
CREATE INDEX "AccountingPeriod_tenantId_companyId_idx" ON "AccountingPeriod"("tenantId", "companyId");
CREATE UNIQUE INDEX "AccountingPeriod_startDate_endDate_key" ON "AccountingPeriod"("startDate", "endDate");
CREATE TABLE "new_Attachment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_Attachment" ("entityId", "entityType", "id", "mimeType", "notes", "originalName", "size", "storagePath", "storedName", "uploadedAt", "uploadedBy") SELECT "entityId", "entityType", "id", "mimeType", "notes", "originalName", "size", "storagePath", "storedName", "uploadedAt", "uploadedBy" FROM "Attachment";
DROP TABLE "Attachment";
ALTER TABLE "new_Attachment" RENAME TO "Attachment";
CREATE UNIQUE INDEX "Attachment_storedName_key" ON "Attachment"("storedName");
CREATE INDEX "Attachment_entityType_entityId_idx" ON "Attachment"("entityType", "entityId");
CREATE INDEX "Attachment_tenantId_companyId_idx" ON "Attachment"("tenantId", "companyId");
CREATE TABLE "new_AttendanceRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "employeeId" INTEGER NOT NULL,
    "attendanceDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL,
    "workHours" DECIMAL NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "fridayHours" DECIMAL NOT NULL DEFAULT 0,
    "checkIn" TEXT,
    "checkOut" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_AttendanceRecord" ("attendanceDate", "checkIn", "checkOut", "createdAt", "employeeId", "fridayHours", "id", "notes", "overtimeHours", "status", "updatedAt", "workHours") SELECT "attendanceDate", "checkIn", "checkOut", "createdAt", "employeeId", "fridayHours", "id", "notes", "overtimeHours", "status", "updatedAt", "workHours" FROM "AttendanceRecord";
DROP TABLE "AttendanceRecord";
ALTER TABLE "new_AttendanceRecord" RENAME TO "AttendanceRecord";
CREATE INDEX "AttendanceRecord_attendanceDate_idx" ON "AttendanceRecord"("attendanceDate");
CREATE INDEX "AttendanceRecord_tenantId_companyId_idx" ON "AttendanceRecord"("tenantId", "companyId");
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_attendanceDate_key" ON "AttendanceRecord"("employeeId", "attendanceDate");
CREATE TABLE "new_AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER,
    "userId" TEXT,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_AuditLog" ("action", "createdAt", "entityId", "entityType", "id", "metadata", "userId") SELECT "action", "createdAt", "entityId", "entityType", "id", "metadata", "userId" FROM "AuditLog";
DROP TABLE "AuditLog";
ALTER TABLE "new_AuditLog" RENAME TO "AuditLog";
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
CREATE INDEX "AuditLog_tenantId_companyId_idx" ON "AuditLog"("tenantId", "companyId");
CREATE TABLE "new_BankAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "iban" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "openingBalance" DECIMAL NOT NULL DEFAULT 0,
    "currentBalance" DECIMAL NOT NULL DEFAULT 0,
    "ledgerAccountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankAccount_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BankAccount" ("accountNumber", "bankName", "createdAt", "currency", "currentBalance", "iban", "id", "isActive", "ledgerAccountId", "name", "notes", "openingBalance", "updatedAt") SELECT "accountNumber", "bankName", "createdAt", "currency", "currentBalance", "iban", "id", "isActive", "ledgerAccountId", "name", "notes", "openingBalance", "updatedAt" FROM "BankAccount";
DROP TABLE "BankAccount";
ALTER TABLE "new_BankAccount" RENAME TO "BankAccount";
CREATE UNIQUE INDEX "BankAccount_iban_key" ON "BankAccount"("iban");
CREATE INDEX "BankAccount_tenantId_companyId_idx" ON "BankAccount"("tenantId", "companyId");
CREATE TABLE "new_BankTransaction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "bankAccountId" INTEGER NOT NULL,
    "transactionDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionType" TEXT NOT NULL,
    "amountIn" DECIMAL NOT NULL DEFAULT 0,
    "amountOut" DECIMAL NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransaction_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_BankTransaction" ("amountIn", "amountOut", "balanceAfter", "bankAccountId", "createdAt", "description", "id", "referenceId", "referenceNumber", "referenceType", "transactionDate", "transactionType") SELECT "amountIn", "amountOut", "balanceAfter", "bankAccountId", "createdAt", "description", "id", "referenceId", "referenceNumber", "referenceType", "transactionDate", "transactionType" FROM "BankTransaction";
DROP TABLE "BankTransaction";
ALTER TABLE "new_BankTransaction" RENAME TO "BankTransaction";
CREATE INDEX "BankTransaction_bankAccountId_transactionDate_idx" ON "BankTransaction"("bankAccountId", "transactionDate");
CREATE INDEX "BankTransaction_tenantId_companyId_idx" ON "BankTransaction"("tenantId", "companyId");
CREATE UNIQUE INDEX "BankTransaction_bankAccountId_referenceType_referenceId_key" ON "BankTransaction"("bankAccountId", "referenceType", "referenceId");
CREATE TABLE "new_BankTransfer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_BankTransfer" ("amount", "cancelledAt", "createdAt", "description", "fees", "fromBankAccountId", "id", "journalEntryId", "postedAt", "referenceNumber", "status", "toBankAccountId", "transferDate", "transferNumber") SELECT "amount", "cancelledAt", "createdAt", "description", "fees", "fromBankAccountId", "id", "journalEntryId", "postedAt", "referenceNumber", "status", "toBankAccountId", "transferDate", "transferNumber" FROM "BankTransfer";
DROP TABLE "BankTransfer";
ALTER TABLE "new_BankTransfer" RENAME TO "BankTransfer";
CREATE UNIQUE INDEX "BankTransfer_transferNumber_key" ON "BankTransfer"("transferNumber");
CREATE UNIQUE INDEX "BankTransfer_journalEntryId_key" ON "BankTransfer"("journalEntryId");
CREATE INDEX "BankTransfer_transferDate_idx" ON "BankTransfer"("transferDate");
CREATE INDEX "BankTransfer_tenantId_companyId_idx" ON "BankTransfer"("tenantId", "companyId");
CREATE TABLE "new_BusinessDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_BusinessDocument" ("approvedAt", "bankDetails", "cancelledAt", "completedAt", "costCenter", "createdAt", "currency", "deliveryPlace", "deliveryTerms", "deliveryTime", "department", "direction", "discount", "documentDate", "documentNumber", "documentType", "expiryDate", "id", "neededDate", "notes", "partyId", "paymentTerms", "priority", "referenceNumber", "requester", "salesperson", "sourceDocumentId", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount") SELECT "approvedAt", "bankDetails", "cancelledAt", "completedAt", "costCenter", "createdAt", "currency", "deliveryPlace", "deliveryTerms", "deliveryTime", "department", "direction", "discount", "documentDate", "documentNumber", "documentType", "expiryDate", "id", "neededDate", "notes", "partyId", "paymentTerms", "priority", "referenceNumber", "requester", "salesperson", "sourceDocumentId", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount" FROM "BusinessDocument";
DROP TABLE "BusinessDocument";
ALTER TABLE "new_BusinessDocument" RENAME TO "BusinessDocument";
CREATE UNIQUE INDEX "BusinessDocument_documentNumber_key" ON "BusinessDocument"("documentNumber");
CREATE INDEX "BusinessDocument_documentType_documentDate_idx" ON "BusinessDocument"("documentType", "documentDate");
CREATE INDEX "BusinessDocument_partyId_idx" ON "BusinessDocument"("partyId");
CREATE INDEX "BusinessDocument_status_idx" ON "BusinessDocument"("status");
CREATE INDEX "BusinessDocument_tenantId_companyId_idx" ON "BusinessDocument"("tenantId", "companyId");
CREATE UNIQUE INDEX "BusinessDocument_sourceDocumentId_documentType_key" ON "BusinessDocument"("sourceDocumentId", "documentType");
CREATE TABLE "new_BusinessDocumentLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_BusinessDocumentLine" ("description", "discount", "documentId", "id", "itemId", "lineType", "materialGrade", "quantity", "sequence", "specifications", "totalAmount", "unitPrice", "vatAmount", "vatRate") SELECT "description", "discount", "documentId", "id", "itemId", "lineType", "materialGrade", "quantity", "sequence", "specifications", "totalAmount", "unitPrice", "vatAmount", "vatRate" FROM "BusinessDocumentLine";
DROP TABLE "BusinessDocumentLine";
ALTER TABLE "new_BusinessDocumentLine" RENAME TO "BusinessDocumentLine";
CREATE INDEX "BusinessDocumentLine_documentId_idx" ON "BusinessDocumentLine"("documentId");
CREATE INDEX "BusinessDocumentLine_itemId_idx" ON "BusinessDocumentLine"("itemId");
CREATE INDEX "BusinessDocumentLine_tenantId_companyId_idx" ON "BusinessDocumentLine"("tenantId", "companyId");
CREATE TABLE "new_CompanyStock" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "averageCost" DECIMAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyStock_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CompanyStock" ("averageCost", "id", "itemId", "quantity", "updatedAt") SELECT "averageCost", "id", "itemId", "quantity", "updatedAt" FROM "CompanyStock";
DROP TABLE "CompanyStock";
ALTER TABLE "new_CompanyStock" RENAME TO "CompanyStock";
CREATE UNIQUE INDEX "CompanyStock_itemId_key" ON "CompanyStock"("itemId");
CREATE INDEX "CompanyStock_tenantId_companyId_idx" ON "CompanyStock"("tenantId", "companyId");
CREATE TABLE "new_CostCenter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CostCenter" ("code", "companyId", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt") SELECT "code", "companyId", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt" FROM "CostCenter";
DROP TABLE "CostCenter";
ALTER TABLE "new_CostCenter" RENAME TO "CostCenter";
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");
CREATE INDEX "CostCenter_companyId_idx" ON "CostCenter"("companyId");
CREATE INDEX "CostCenter_tenantId_companyId_idx" ON "CostCenter"("tenantId", "companyId");
CREATE TABLE "new_DeliveryReceiptNote" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_DeliveryReceiptNote" ("accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "sourceDocumentId", "status", "stockOwnership", "stockPostedAt", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt") SELECT "accountantName", "accountantSignature", "accountantSignedAt", "cancelledAt", "carrierName", "createdAt", "driverId", "driverIdNumber", "driverName", "driverPhone", "id", "invoiceNumber", "loadingPoint", "noteDate", "noteNumber", "noteType", "notes", "orderNumber", "partyId", "purchasingName", "purchasingSignature", "purchasingSignedAt", "recipientName", "recipientSignature", "recipientSignedAt", "referenceNumber", "source", "sourceDocumentId", "status", "stockOwnership", "stockPostedAt", "transportMethod", "truckId", "unloadingPoint", "updatedAt", "vehiclePlate", "warehouseName", "warehouseSignature", "warehouseSignedAt" FROM "DeliveryReceiptNote";
DROP TABLE "DeliveryReceiptNote";
ALTER TABLE "new_DeliveryReceiptNote" RENAME TO "DeliveryReceiptNote";
CREATE UNIQUE INDEX "DeliveryReceiptNote_noteNumber_key" ON "DeliveryReceiptNote"("noteNumber");
CREATE INDEX "DeliveryReceiptNote_noteDate_idx" ON "DeliveryReceiptNote"("noteDate");
CREATE INDEX "DeliveryReceiptNote_partyId_idx" ON "DeliveryReceiptNote"("partyId");
CREATE INDEX "DeliveryReceiptNote_sourceDocumentId_idx" ON "DeliveryReceiptNote"("sourceDocumentId");
CREATE INDEX "DeliveryReceiptNote_tenantId_companyId_idx" ON "DeliveryReceiptNote"("tenantId", "companyId");
CREATE TABLE "new_DeliveryReceiptNoteItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "noteId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "description" TEXT,
    "materialGrade" TEXT,
    "orderNumber" TEXT,
    "quantity" DECIMAL NOT NULL,
    "weight" DECIMAL,
    CONSTRAINT "DeliveryReceiptNoteItem_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DeliveryReceiptNoteItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DeliveryReceiptNoteItem" ("description", "id", "itemId", "materialGrade", "noteId", "orderNumber", "quantity", "sequence", "weight") SELECT "description", "id", "itemId", "materialGrade", "noteId", "orderNumber", "quantity", "sequence", "weight" FROM "DeliveryReceiptNoteItem";
DROP TABLE "DeliveryReceiptNoteItem";
ALTER TABLE "new_DeliveryReceiptNoteItem" RENAME TO "DeliveryReceiptNoteItem";
CREATE INDEX "DeliveryReceiptNoteItem_noteId_idx" ON "DeliveryReceiptNoteItem"("noteId");
CREATE INDEX "DeliveryReceiptNoteItem_itemId_idx" ON "DeliveryReceiptNoteItem"("itemId");
CREATE INDEX "DeliveryReceiptNoteItem_tenantId_companyId_idx" ON "DeliveryReceiptNoteItem"("tenantId", "companyId");
CREATE TABLE "new_DocumentSequence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "currentValue" INTEGER NOT NULL DEFAULT 0,
    "padding" INTEGER NOT NULL DEFAULT 6,
    "prefix" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_DocumentSequence" ("code", "currentValue", "id", "padding", "prefix", "updatedAt", "year") SELECT "code", "currentValue", "id", "padding", "prefix", "updatedAt", "year" FROM "DocumentSequence";
DROP TABLE "DocumentSequence";
ALTER TABLE "new_DocumentSequence" RENAME TO "DocumentSequence";
CREATE INDEX "DocumentSequence_tenantId_companyId_idx" ON "DocumentSequence"("tenantId", "companyId");
CREATE UNIQUE INDEX "DocumentSequence_code_year_key" ON "DocumentSequence"("code", "year");
CREATE TABLE "new_Driver" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
    "employeeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Driver_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Driver" ("createdAt", "driverCardExpiry", "driverCardNumber", "employeeId", "id", "idNumber", "licenseExpiry", "licenseNumber", "name", "nationality", "notes", "passportExpiry", "passportNumber", "phone", "status", "updatedAt") SELECT "createdAt", "driverCardExpiry", "driverCardNumber", "employeeId", "id", "idNumber", "licenseExpiry", "licenseNumber", "name", "nationality", "notes", "passportExpiry", "passportNumber", "phone", "status", "updatedAt" FROM "Driver";
DROP TABLE "Driver";
ALTER TABLE "new_Driver" RENAME TO "Driver";
CREATE UNIQUE INDEX "Driver_idNumber_key" ON "Driver"("idNumber");
CREATE UNIQUE INDEX "Driver_employeeId_key" ON "Driver"("employeeId");
CREATE INDEX "Driver_tenantId_companyId_idx" ON "Driver"("tenantId", "companyId");
CREATE TABLE "new_DriverDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_DriverDocument" ("attachmentUrl", "createdAt", "documentNumber", "documentType", "driverId", "expiryDate", "id", "issueDate", "notes") SELECT "attachmentUrl", "createdAt", "documentNumber", "documentType", "driverId", "expiryDate", "id", "issueDate", "notes" FROM "DriverDocument";
DROP TABLE "DriverDocument";
ALTER TABLE "new_DriverDocument" RENAME TO "DriverDocument";
CREATE INDEX "DriverDocument_driverId_idx" ON "DriverDocument"("driverId");
CREATE INDEX "DriverDocument_expiryDate_idx" ON "DriverDocument"("expiryDate");
CREATE INDEX "DriverDocument_tenantId_companyId_idx" ON "DriverDocument"("tenantId", "companyId");
CREATE TABLE "new_Employee" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "employeeNumber" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "idNumber" TEXT,
    "nationality" TEXT,
    "dateOfBirth" DATETIME,
    "phone" TEXT,
    "email" TEXT,
    "address" TEXT,
    "department" TEXT,
    "jobTitle" TEXT,
    "hireDate" DATETIME,
    "managerId" INTEGER,
    "contractType" TEXT,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowance" DECIMAL NOT NULL DEFAULT 0,
    "bankName" TEXT,
    "iban" TEXT,
    "costCenter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "idExpiry" DATETIME,
    "contractExpiry" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Employee" ("address", "bankName", "basicSalary", "contractExpiry", "contractType", "costCenter", "createdAt", "dateOfBirth", "department", "email", "employeeNumber", "hireDate", "housingAllowance", "iban", "id", "idExpiry", "idNumber", "jobTitle", "managerId", "nameAr", "nameEn", "nationality", "notes", "otherAllowance", "phone", "status", "transportAllowance", "updatedAt") SELECT "address", "bankName", "basicSalary", "contractExpiry", "contractType", "costCenter", "createdAt", "dateOfBirth", "department", "email", "employeeNumber", "hireDate", "housingAllowance", "iban", "id", "idExpiry", "idNumber", "jobTitle", "managerId", "nameAr", "nameEn", "nationality", "notes", "otherAllowance", "phone", "status", "transportAllowance", "updatedAt" FROM "Employee";
DROP TABLE "Employee";
ALTER TABLE "new_Employee" RENAME TO "Employee";
CREATE UNIQUE INDEX "Employee_employeeNumber_key" ON "Employee"("employeeNumber");
CREATE UNIQUE INDEX "Employee_idNumber_key" ON "Employee"("idNumber");
CREATE INDEX "Employee_department_idx" ON "Employee"("department");
CREATE INDEX "Employee_status_idx" ON "Employee"("status");
CREATE INDEX "Employee_tenantId_companyId_idx" ON "Employee"("tenantId", "companyId");
CREATE TABLE "new_EmployeeAdvance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "advanceNumber" TEXT NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "advanceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL NOT NULL,
    "recoveredAmount" DECIMAL NOT NULL DEFAULT 0,
    "remainingAmount" DECIMAL NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeAdvance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeAdvance_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EmployeeAdvance_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_EmployeeAdvance" ("advanceDate", "advanceNumber", "amount", "bankAccountId", "createdAt", "employeeId", "id", "journalEntryId", "notes", "recoveredAmount", "remainingAmount", "status", "updatedAt") SELECT "advanceDate", "advanceNumber", "amount", "bankAccountId", "createdAt", "employeeId", "id", "journalEntryId", "notes", "recoveredAmount", "remainingAmount", "status", "updatedAt" FROM "EmployeeAdvance";
DROP TABLE "EmployeeAdvance";
ALTER TABLE "new_EmployeeAdvance" RENAME TO "EmployeeAdvance";
CREATE UNIQUE INDEX "EmployeeAdvance_advanceNumber_key" ON "EmployeeAdvance"("advanceNumber");
CREATE UNIQUE INDEX "EmployeeAdvance_journalEntryId_key" ON "EmployeeAdvance"("journalEntryId");
CREATE INDEX "EmployeeAdvance_employeeId_idx" ON "EmployeeAdvance"("employeeId");
CREATE INDEX "EmployeeAdvance_tenantId_companyId_idx" ON "EmployeeAdvance"("tenantId", "companyId");
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
    "paymentMethod" TEXT,
    "cashBankAccount" TEXT,
    "costCenter" TEXT,
    "responsibleEmployee" TEXT,
    "project" TEXT,
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
    CONSTRAINT "Expense_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "costCenter", "createdAt", "description", "expenseDate", "expenseType", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "referenceNumber", "responsibleEmployee", "status", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "costCenter", "createdAt", "description", "expenseDate", "expenseType", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "referenceNumber", "responsibleEmployee", "status", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_voucherNumber_key" ON "Expense"("voucherNumber");
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_expenseType_idx" ON "Expense"("expenseType");
CREATE INDEX "Expense_tenantId_companyId_idx" ON "Expense"("tenantId", "companyId");
CREATE TABLE "new_ExpenseCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExpenseCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExpenseCategory" ("accountId", "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt") SELECT "accountId", "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt" FROM "ExpenseCategory";
DROP TABLE "ExpenseCategory";
ALTER TABLE "new_ExpenseCategory" RENAME TO "ExpenseCategory";
CREATE UNIQUE INDEX "ExpenseCategory_code_key" ON "ExpenseCategory"("code");
CREATE INDEX "ExpenseCategory_tenantId_companyId_idx" ON "ExpenseCategory"("tenantId", "companyId");
CREATE TABLE "new_ExternalExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "expenseNumber" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "entityName" TEXT,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ExternalExpense" ("amount", "category", "createdAt", "description", "entityName", "expenseDate", "expenseNumber", "id", "notes", "paymentMethod", "referenceNumber", "updatedAt") SELECT "amount", "category", "createdAt", "description", "entityName", "expenseDate", "expenseNumber", "id", "notes", "paymentMethod", "referenceNumber", "updatedAt" FROM "ExternalExpense";
DROP TABLE "ExternalExpense";
ALTER TABLE "new_ExternalExpense" RENAME TO "ExternalExpense";
CREATE UNIQUE INDEX "ExternalExpense_expenseNumber_key" ON "ExternalExpense"("expenseNumber");
CREATE INDEX "ExternalExpense_expenseDate_idx" ON "ExternalExpense"("expenseDate");
CREATE INDEX "ExternalExpense_category_idx" ON "ExternalExpense"("category");
CREATE INDEX "ExternalExpense_tenantId_companyId_idx" ON "ExternalExpense"("tenantId", "companyId");
CREATE TABLE "new_ExternalLinkedCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "costNumber" TEXT NOT NULL,
    "costDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "externalTradeId" INTEGER,
    "itemId" INTEGER NOT NULL,
    "costType" TEXT NOT NULL,
    "entityName" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalLinkedCost_externalTradeId_fkey" FOREIGN KEY ("externalTradeId") REFERENCES "ExternalTrade" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ExternalLinkedCost_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExternalLinkedCost" ("amount", "costDate", "costNumber", "costType", "createdAt", "description", "entityName", "externalTradeId", "id", "itemId", "notes", "paymentMethod") SELECT "amount", "costDate", "costNumber", "costType", "createdAt", "description", "entityName", "externalTradeId", "id", "itemId", "notes", "paymentMethod" FROM "ExternalLinkedCost";
DROP TABLE "ExternalLinkedCost";
ALTER TABLE "new_ExternalLinkedCost" RENAME TO "ExternalLinkedCost";
CREATE UNIQUE INDEX "ExternalLinkedCost_costNumber_key" ON "ExternalLinkedCost"("costNumber");
CREATE INDEX "ExternalLinkedCost_costDate_idx" ON "ExternalLinkedCost"("costDate");
CREATE INDEX "ExternalLinkedCost_itemId_idx" ON "ExternalLinkedCost"("itemId");
CREATE INDEX "ExternalLinkedCost_tenantId_companyId_idx" ON "ExternalLinkedCost"("tenantId", "companyId");
CREATE TABLE "new_ExternalTrade" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "tradeNumber" TEXT NOT NULL,
    "tradeDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tradeType" TEXT NOT NULL,
    "itemId" INTEGER NOT NULL,
    "entityName" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "totalAmount" DECIMAL NOT NULL,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExternalTrade_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_ExternalTrade" ("createdAt", "entityName", "id", "itemId", "notes", "quantity", "referenceNumber", "totalAmount", "tradeDate", "tradeNumber", "tradeType", "unitPrice", "updatedAt") SELECT "createdAt", "entityName", "id", "itemId", "notes", "quantity", "referenceNumber", "totalAmount", "tradeDate", "tradeNumber", "tradeType", "unitPrice", "updatedAt" FROM "ExternalTrade";
DROP TABLE "ExternalTrade";
ALTER TABLE "new_ExternalTrade" RENAME TO "ExternalTrade";
CREATE UNIQUE INDEX "ExternalTrade_tradeNumber_key" ON "ExternalTrade"("tradeNumber");
CREATE INDEX "ExternalTrade_tradeDate_idx" ON "ExternalTrade"("tradeDate");
CREATE INDEX "ExternalTrade_itemId_tradeType_idx" ON "ExternalTrade"("itemId", "tradeType");
CREATE INDEX "ExternalTrade_tenantId_companyId_idx" ON "ExternalTrade"("tenantId", "companyId");
CREATE TABLE "new_ExternalWorker" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "workerNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "affiliatedEntity" TEXT,
    "role" TEXT,
    "idNumber" TEXT,
    "phone" TEXT,
    "startDate" DATETIME,
    "endDate" DATETIME,
    "wage" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "costCenter" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ExternalWorker" ("affiliatedEntity", "costCenter", "createdAt", "endDate", "id", "idNumber", "name", "notes", "paymentMethod", "phone", "role", "startDate", "status", "updatedAt", "wage", "workerNumber") SELECT "affiliatedEntity", "costCenter", "createdAt", "endDate", "id", "idNumber", "name", "notes", "paymentMethod", "phone", "role", "startDate", "status", "updatedAt", "wage", "workerNumber" FROM "ExternalWorker";
DROP TABLE "ExternalWorker";
ALTER TABLE "new_ExternalWorker" RENAME TO "ExternalWorker";
CREATE UNIQUE INDEX "ExternalWorker_workerNumber_key" ON "ExternalWorker"("workerNumber");
CREATE INDEX "ExternalWorker_tenantId_companyId_idx" ON "ExternalWorker"("tenantId", "companyId");
CREATE TABLE "new_ExternalWorkerCost" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "costNumber" TEXT NOT NULL,
    "externalWorkerId" INTEGER NOT NULL,
    "costDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodLabel" TEXT,
    "amount" DECIMAL NOT NULL,
    "costCenter" TEXT NOT NULL,
    "expenseId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalWorkerCost_externalWorkerId_fkey" FOREIGN KEY ("externalWorkerId") REFERENCES "ExternalWorker" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExternalWorkerCost_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExternalWorkerCost" ("amount", "costCenter", "costDate", "costNumber", "createdAt", "expenseId", "externalWorkerId", "id", "notes", "periodLabel", "status") SELECT "amount", "costCenter", "costDate", "costNumber", "createdAt", "expenseId", "externalWorkerId", "id", "notes", "periodLabel", "status" FROM "ExternalWorkerCost";
DROP TABLE "ExternalWorkerCost";
ALTER TABLE "new_ExternalWorkerCost" RENAME TO "ExternalWorkerCost";
CREATE UNIQUE INDEX "ExternalWorkerCost_costNumber_key" ON "ExternalWorkerCost"("costNumber");
CREATE UNIQUE INDEX "ExternalWorkerCost_expenseId_key" ON "ExternalWorkerCost"("expenseId");
CREATE INDEX "ExternalWorkerCost_costDate_idx" ON "ExternalWorkerCost"("costDate");
CREATE INDEX "ExternalWorkerCost_tenantId_companyId_idx" ON "ExternalWorkerCost"("tenantId", "companyId");
CREATE TABLE "new_FactoryExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "supplierName" TEXT,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_FactoryExpense" ("amount", "createdAt", "description", "expenseDate", "expenseType", "id", "notes", "referenceNumber", "supplierName", "updatedAt") SELECT "amount", "createdAt", "description", "expenseDate", "expenseType", "id", "notes", "referenceNumber", "supplierName", "updatedAt" FROM "FactoryExpense";
DROP TABLE "FactoryExpense";
ALTER TABLE "new_FactoryExpense" RENAME TO "FactoryExpense";
CREATE INDEX "FactoryExpense_expenseDate_idx" ON "FactoryExpense"("expenseDate");
CREATE INDEX "FactoryExpense_expenseType_idx" ON "FactoryExpense"("expenseType");
CREATE INDEX "FactoryExpense_tenantId_companyId_idx" ON "FactoryExpense"("tenantId", "companyId");
CREATE TABLE "new_FactoryFeeRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "partyId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "feePerTon" DECIMAL NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryFeeRate_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FactoryFeeRate_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_FactoryFeeRate" ("createdAt", "feePerTon", "id", "isActive", "itemId", "notes", "partyId", "updatedAt") SELECT "createdAt", "feePerTon", "id", "isActive", "itemId", "notes", "partyId", "updatedAt" FROM "FactoryFeeRate";
DROP TABLE "FactoryFeeRate";
ALTER TABLE "new_FactoryFeeRate" RENAME TO "FactoryFeeRate";
CREATE INDEX "FactoryFeeRate_tenantId_companyId_idx" ON "FactoryFeeRate"("tenantId", "companyId");
CREATE UNIQUE INDEX "FactoryFeeRate_partyId_itemId_key" ON "FactoryFeeRate"("partyId", "itemId");
CREATE TABLE "new_FactoryFuelMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "movementNumber" TEXT NOT NULL,
    "movementDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" INTEGER NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantityIn" DECIMAL NOT NULL DEFAULT 0,
    "quantityOut" DECIMAL NOT NULL DEFAULT 0,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL NOT NULL,
    "balanceValue" DECIMAL NOT NULL,
    "productionItemId" INTEGER,
    "stockMovementId" INTEGER NOT NULL,
    "journalEntryId" INTEGER,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FactoryFuelMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FactoryFuelMovement_stockMovementId_fkey" FOREIGN KEY ("stockMovementId") REFERENCES "StockMovement" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FactoryFuelMovement_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FactoryFuelMovement" ("balanceAfter", "balanceValue", "createdAt", "id", "itemId", "journalEntryId", "movementDate", "movementNumber", "movementType", "notes", "productionItemId", "quantityIn", "quantityOut", "referenceId", "referenceNumber", "referenceType", "stockMovementId", "totalValue", "unitCost") SELECT "balanceAfter", "balanceValue", "createdAt", "id", "itemId", "journalEntryId", "movementDate", "movementNumber", "movementType", "notes", "productionItemId", "quantityIn", "quantityOut", "referenceId", "referenceNumber", "referenceType", "stockMovementId", "totalValue", "unitCost" FROM "FactoryFuelMovement";
DROP TABLE "FactoryFuelMovement";
ALTER TABLE "new_FactoryFuelMovement" RENAME TO "FactoryFuelMovement";
CREATE UNIQUE INDEX "FactoryFuelMovement_movementNumber_key" ON "FactoryFuelMovement"("movementNumber");
CREATE UNIQUE INDEX "FactoryFuelMovement_stockMovementId_key" ON "FactoryFuelMovement"("stockMovementId");
CREATE UNIQUE INDEX "FactoryFuelMovement_journalEntryId_key" ON "FactoryFuelMovement"("journalEntryId");
CREATE INDEX "FactoryFuelMovement_movementDate_idx" ON "FactoryFuelMovement"("movementDate");
CREATE INDEX "FactoryFuelMovement_itemId_idx" ON "FactoryFuelMovement"("itemId");
CREATE INDEX "FactoryFuelMovement_productionItemId_idx" ON "FactoryFuelMovement"("productionItemId");
CREATE INDEX "FactoryFuelMovement_tenantId_companyId_idx" ON "FactoryFuelMovement"("tenantId", "companyId");
CREATE TABLE "new_FactoryMaintenance" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "maintenanceNumber" TEXT NOT NULL,
    "maintenanceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "equipment" TEXT NOT NULL,
    "maintenanceType" TEXT NOT NULL,
    "spareParts" TEXT,
    "laborDescription" TEXT,
    "vendor" TEXT,
    "description" TEXT,
    "amount" DECIMAL NOT NULL DEFAULT 0,
    "expenseId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FactoryMaintenance_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FactoryMaintenance" ("amount", "createdAt", "description", "equipment", "expenseId", "id", "laborDescription", "maintenanceDate", "maintenanceNumber", "maintenanceType", "notes", "spareParts", "status", "updatedAt", "vendor") SELECT "amount", "createdAt", "description", "equipment", "expenseId", "id", "laborDescription", "maintenanceDate", "maintenanceNumber", "maintenanceType", "notes", "spareParts", "status", "updatedAt", "vendor" FROM "FactoryMaintenance";
DROP TABLE "FactoryMaintenance";
ALTER TABLE "new_FactoryMaintenance" RENAME TO "FactoryMaintenance";
CREATE UNIQUE INDEX "FactoryMaintenance_maintenanceNumber_key" ON "FactoryMaintenance"("maintenanceNumber");
CREATE UNIQUE INDEX "FactoryMaintenance_expenseId_key" ON "FactoryMaintenance"("expenseId");
CREATE INDEX "FactoryMaintenance_maintenanceDate_idx" ON "FactoryMaintenance"("maintenanceDate");
CREATE INDEX "FactoryMaintenance_tenantId_companyId_idx" ON "FactoryMaintenance"("tenantId", "companyId");
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
INSERT INTO "new_FactoryTransaction" ("cancelledAt", "createdAt", "description", "id", "itemId", "journalEntryId", "manufacturingFeePerTon", "manufacturingFeeTotal", "notes", "partyId", "postedAt", "quantity", "referenceId", "referenceNumber", "referenceType", "status", "totalAmount", "transactionDate", "transactionNumber", "transactionType", "updatedAt", "vatAmount", "vatRate") SELECT "cancelledAt", "createdAt", "description", "id", "itemId", "journalEntryId", "manufacturingFeePerTon", "manufacturingFeeTotal", "notes", "partyId", "postedAt", "quantity", "referenceId", "referenceNumber", "referenceType", "status", "totalAmount", "transactionDate", "transactionNumber", "transactionType", "updatedAt", "vatAmount", "vatRate" FROM "FactoryTransaction";
DROP TABLE "FactoryTransaction";
ALTER TABLE "new_FactoryTransaction" RENAME TO "FactoryTransaction";
CREATE UNIQUE INDEX "FactoryTransaction_transactionNumber_key" ON "FactoryTransaction"("transactionNumber");
CREATE UNIQUE INDEX "FactoryTransaction_journalEntryId_key" ON "FactoryTransaction"("journalEntryId");
CREATE INDEX "FactoryTransaction_transactionDate_idx" ON "FactoryTransaction"("transactionDate");
CREATE INDEX "FactoryTransaction_partyId_idx" ON "FactoryTransaction"("partyId");
CREATE INDEX "FactoryTransaction_itemId_idx" ON "FactoryTransaction"("itemId");
CREATE INDEX "FactoryTransaction_tenantId_companyId_idx" ON "FactoryTransaction"("tenantId", "companyId");
CREATE TABLE "new_FinancialVoucher" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "voucherType" TEXT NOT NULL,
    "voucherDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER,
    "amount" DECIMAL NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "referenceNumber" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialVoucher_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "FinancialVoucher_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "FinancialVoucher_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_FinancialVoucher" ("amount", "bankAccountId", "cancelledAt", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "paymentMethod", "postedAt", "referenceNumber", "status", "updatedAt", "voucherDate", "voucherNumber", "voucherType") SELECT "amount", "bankAccountId", "cancelledAt", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "paymentMethod", "postedAt", "referenceNumber", "status", "updatedAt", "voucherDate", "voucherNumber", "voucherType" FROM "FinancialVoucher";
DROP TABLE "FinancialVoucher";
ALTER TABLE "new_FinancialVoucher" RENAME TO "FinancialVoucher";
CREATE UNIQUE INDEX "FinancialVoucher_voucherNumber_key" ON "FinancialVoucher"("voucherNumber");
CREATE UNIQUE INDEX "FinancialVoucher_journalEntryId_key" ON "FinancialVoucher"("journalEntryId");
CREATE INDEX "FinancialVoucher_voucherDate_idx" ON "FinancialVoucher"("voucherDate");
CREATE INDEX "FinancialVoucher_partyId_idx" ON "FinancialVoucher"("partyId");
CREATE INDEX "FinancialVoucher_status_idx" ON "FinancialVoucher"("status");
CREATE INDEX "FinancialVoucher_tenantId_companyId_idx" ON "FinancialVoucher"("tenantId", "companyId");
CREATE TABLE "new_Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_Item" ("batchNumber", "categoryId", "code", "costPrice", "countryOfOrigin", "createdAt", "id", "isActive", "manufacturer", "minimumStock", "nameAr", "nameEn", "salePrice", "specification", "unitId", "updatedAt", "vatRate") SELECT "batchNumber", "categoryId", "code", "costPrice", "countryOfOrigin", "createdAt", "id", "isActive", "manufacturer", "minimumStock", "nameAr", "nameEn", "salePrice", "specification", "unitId", "updatedAt", "vatRate" FROM "Item";
DROP TABLE "Item";
ALTER TABLE "new_Item" RENAME TO "Item";
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");
CREATE INDEX "Item_tenantId_companyId_idx" ON "Item"("tenantId", "companyId");
CREATE TABLE "new_ItemCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ItemCategory" ("createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt") SELECT "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt" FROM "ItemCategory";
DROP TABLE "ItemCategory";
ALTER TABLE "new_ItemCategory" RENAME TO "ItemCategory";
CREATE INDEX "ItemCategory_tenantId_companyId_idx" ON "ItemCategory"("tenantId", "companyId");
CREATE TABLE "new_JournalEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_JournalEntry" ("cancelledAt", "createdAt", "description", "entryDate", "entryNumber", "id", "postedAt", "referenceId", "referenceNumber", "referenceType", "status", "totalCredit", "totalDebit", "updatedAt") SELECT "cancelledAt", "createdAt", "description", "entryDate", "entryNumber", "id", "postedAt", "referenceId", "referenceNumber", "referenceType", "status", "totalCredit", "totalDebit", "updatedAt" FROM "JournalEntry";
DROP TABLE "JournalEntry";
ALTER TABLE "new_JournalEntry" RENAME TO "JournalEntry";
CREATE UNIQUE INDEX "JournalEntry_entryNumber_key" ON "JournalEntry"("entryNumber");
CREATE INDEX "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE INDEX "JournalEntry_tenantId_companyId_idx" ON "JournalEntry"("tenantId", "companyId");
CREATE UNIQUE INDEX "JournalEntry_referenceType_referenceId_key" ON "JournalEntry"("referenceType", "referenceId");
CREATE TABLE "new_JournalEntryLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_JournalEntryLine" ("accountCode", "accountId", "accountName", "costCenter", "credit", "debit", "description", "id", "journalEntryId", "partyId") SELECT "accountCode", "accountId", "accountName", "costCenter", "credit", "debit", "description", "id", "journalEntryId", "partyId" FROM "JournalEntryLine";
DROP TABLE "JournalEntryLine";
ALTER TABLE "new_JournalEntryLine" RENAME TO "JournalEntryLine";
CREATE INDEX "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");
CREATE INDEX "JournalEntryLine_partyId_idx" ON "JournalEntryLine"("partyId");
CREATE INDEX "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");
CREATE INDEX "JournalEntryLine_tenantId_companyId_idx" ON "JournalEntryLine"("tenantId", "companyId");
CREATE TABLE "new_LeaveRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "employeeId" INTEGER NOT NULL,
    "leaveType" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "reason" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_LeaveRequest" ("createdAt", "employeeId", "endDate", "id", "leaveType", "notes", "reason", "startDate", "status", "updatedAt") SELECT "createdAt", "employeeId", "endDate", "id", "leaveType", "notes", "reason", "startDate", "status", "updatedAt" FROM "LeaveRequest";
DROP TABLE "LeaveRequest";
ALTER TABLE "new_LeaveRequest" RENAME TO "LeaveRequest";
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");
CREATE INDEX "LeaveRequest_tenantId_companyId_idx" ON "LeaveRequest"("tenantId", "companyId");
CREATE TABLE "new_Party" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_Party" ("createdAt", "email", "id", "isActive", "isCustomer", "isSupplier", "nameAr", "nameEn", "notes", "telephone", "unifiedNumber", "updatedAt", "vatNumber") SELECT "createdAt", "email", "id", "isActive", "isCustomer", "isSupplier", "nameAr", "nameEn", "notes", "telephone", "unifiedNumber", "updatedAt", "vatNumber" FROM "Party";
DROP TABLE "Party";
ALTER TABLE "new_Party" RENAME TO "Party";
CREATE UNIQUE INDEX "Party_unifiedNumber_key" ON "Party"("unifiedNumber");
CREATE INDEX "Party_tenantId_companyId_idx" ON "Party"("tenantId", "companyId");
CREATE TABLE "new_PartyAddress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_PartyAddress" ("buildingNumber", "city", "district", "id", "mapLink", "partyId", "postalCode", "region", "secondaryNumber", "shortAddress", "street") SELECT "buildingNumber", "city", "district", "id", "mapLink", "partyId", "postalCode", "region", "secondaryNumber", "shortAddress", "street" FROM "PartyAddress";
DROP TABLE "PartyAddress";
ALTER TABLE "new_PartyAddress" RENAME TO "PartyAddress";
CREATE UNIQUE INDEX "PartyAddress_partyId_key" ON "PartyAddress"("partyId");
CREATE INDEX "PartyAddress_tenantId_companyId_idx" ON "PartyAddress"("tenantId", "companyId");
CREATE TABLE "new_PartyStockAccount" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "partyId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "averageValue" DECIMAL NOT NULL DEFAULT 0,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PartyStockAccount_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PartyStockAccount_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PartyStockAccount" ("averageValue", "id", "itemId", "partyId", "quantity", "updatedAt") SELECT "averageValue", "id", "itemId", "partyId", "quantity", "updatedAt" FROM "PartyStockAccount";
DROP TABLE "PartyStockAccount";
ALTER TABLE "new_PartyStockAccount" RENAME TO "PartyStockAccount";
CREATE INDEX "PartyStockAccount_tenantId_companyId_idx" ON "PartyStockAccount"("tenantId", "companyId");
CREATE UNIQUE INDEX "PartyStockAccount_partyId_itemId_key" ON "PartyStockAccount"("partyId", "itemId");
CREATE TABLE "new_PayrollLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "payrollRunId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL NOT NULL DEFAULT 0,
    "normalWage" DECIMAL NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "overtimeValue" DECIMAL NOT NULL DEFAULT 0,
    "fridayHours" DECIMAL NOT NULL DEFAULT 0,
    "fridayValue" DECIMAL NOT NULL DEFAULT 0,
    "absenceDeduction" DECIMAL NOT NULL DEFAULT 0,
    "penalties" DECIMAL NOT NULL DEFAULT 0,
    "advances" DECIMAL NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL NOT NULL DEFAULT 0,
    "netSalary" DECIMAL NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'DUE',
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PayrollLine" ("absenceDeduction", "advances", "basicSalary", "createdAt", "employeeId", "fridayHours", "fridayValue", "grossSalary", "housingAllowance", "id", "netSalary", "normalWage", "otherAllowances", "otherDeductions", "overtimeHours", "overtimeValue", "paidAmount", "paymentStatus", "payrollRunId", "penalties", "totalDeductions", "transportAllowance", "updatedAt") SELECT "absenceDeduction", "advances", "basicSalary", "createdAt", "employeeId", "fridayHours", "fridayValue", "grossSalary", "housingAllowance", "id", "netSalary", "normalWage", "otherAllowances", "otherDeductions", "overtimeHours", "overtimeValue", "paidAmount", "paymentStatus", "payrollRunId", "penalties", "totalDeductions", "transportAllowance", "updatedAt" FROM "PayrollLine";
DROP TABLE "PayrollLine";
ALTER TABLE "new_PayrollLine" RENAME TO "PayrollLine";
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");
CREATE INDEX "PayrollLine_tenantId_companyId_idx" ON "PayrollLine"("tenantId", "companyId");
CREATE UNIQUE INDEX "PayrollLine_payrollRunId_employeeId_key" ON "PayrollLine"("payrollRunId", "employeeId");
CREATE TABLE "new_PayrollPayment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "payrollLineId" INTEGER NOT NULL,
    "paymentNumber" TEXT NOT NULL,
    "paymentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL NOT NULL,
    "bankAccountId" INTEGER NOT NULL,
    "journalEntryId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollPayment_payrollLineId_fkey" FOREIGN KEY ("payrollLineId") REFERENCES "PayrollLine" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollPayment_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollPayment_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PayrollPayment" ("amount", "bankAccountId", "createdAt", "id", "journalEntryId", "notes", "paymentDate", "paymentNumber", "payrollLineId") SELECT "amount", "bankAccountId", "createdAt", "id", "journalEntryId", "notes", "paymentDate", "paymentNumber", "payrollLineId" FROM "PayrollPayment";
DROP TABLE "PayrollPayment";
ALTER TABLE "new_PayrollPayment" RENAME TO "PayrollPayment";
CREATE UNIQUE INDEX "PayrollPayment_payrollLineId_key" ON "PayrollPayment"("payrollLineId");
CREATE UNIQUE INDEX "PayrollPayment_paymentNumber_key" ON "PayrollPayment"("paymentNumber");
CREATE UNIQUE INDEX "PayrollPayment_journalEntryId_key" ON "PayrollPayment"("journalEntryId");
CREATE INDEX "PayrollPayment_tenantId_companyId_idx" ON "PayrollPayment"("tenantId", "companyId");
CREATE TABLE "new_PayrollRun" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "payrollNumber" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGross" DECIMAL NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL NOT NULL DEFAULT 0,
    "totalNet" DECIMAL NOT NULL DEFAULT 0,
    "journalEntryId" INTEGER,
    "postedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRun_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PayrollRun" ("createdAt", "id", "journalEntryId", "month", "notes", "payrollNumber", "postedAt", "status", "totalDeductions", "totalGross", "totalNet", "updatedAt", "year") SELECT "createdAt", "id", "journalEntryId", "month", "notes", "payrollNumber", "postedAt", "status", "totalDeductions", "totalGross", "totalNet", "updatedAt", "year" FROM "PayrollRun";
DROP TABLE "PayrollRun";
ALTER TABLE "new_PayrollRun" RENAME TO "PayrollRun";
CREATE UNIQUE INDEX "PayrollRun_payrollNumber_key" ON "PayrollRun"("payrollNumber");
CREATE UNIQUE INDEX "PayrollRun_journalEntryId_key" ON "PayrollRun"("journalEntryId");
CREATE INDEX "PayrollRun_tenantId_companyId_idx" ON "PayrollRun"("tenantId", "companyId");
CREATE UNIQUE INDEX "PayrollRun_year_month_key" ON "PayrollRun"("year", "month");
CREATE TABLE "new_Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "receiptNoteId" INTEGER,
    "dueDate" DATETIME,
    "paymentMethod" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
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
INSERT INTO "new_Purchase" ("createdAt", "currency", "discount", "dueDate", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "totalAmount", "updatedAt", "vatAmount") SELECT "createdAt", "currency", "discount", "dueDate", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "totalAmount", "updatedAt", "vatAmount" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");
CREATE UNIQUE INDEX "Purchase_receiptNoteId_key" ON "Purchase"("receiptNoteId");
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
CREATE INDEX "Purchase_partyId_idx" ON "Purchase"("partyId");
CREATE INDEX "Purchase_sourceOrderId_idx" ON "Purchase"("sourceOrderId");
CREATE INDEX "Purchase_tenantId_companyId_idx" ON "Purchase"("tenantId", "companyId");
CREATE TABLE "new_PurchaseItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "purchaseId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "description" TEXT,
    "materialGrade" TEXT,
    "specifications" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "PurchaseItem_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseItem" ("description", "discount", "id", "itemId", "materialGrade", "purchaseId", "quantity", "specifications", "totalAmount", "unitPrice", "vatAmount", "vatRate") SELECT "description", "discount", "id", "itemId", "materialGrade", "purchaseId", "quantity", "specifications", "totalAmount", "unitPrice", "vatAmount", "vatRate" FROM "PurchaseItem";
DROP TABLE "PurchaseItem";
ALTER TABLE "new_PurchaseItem" RENAME TO "PurchaseItem";
CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");
CREATE INDEX "PurchaseItem_itemId_idx" ON "PurchaseItem"("itemId");
CREATE INDEX "PurchaseItem_tenantId_companyId_idx" ON "PurchaseItem"("tenantId", "companyId");
CREATE TABLE "new_Revenue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "revenueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revenueType" TEXT NOT NULL,
    "partyId" INTEGER,
    "description" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "collectionMethod" TEXT,
    "cashBankAccount" TEXT,
    "activity" TEXT,
    "costCenter" TEXT,
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
    CONSTRAINT "Revenue_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RevenueCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Revenue_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Revenue" ("activity", "amountBeforeVat", "bankAccountId", "cancelledAt", "cashBankAccount", "categoryId", "collectionMethod", "costCenter", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "postedAt", "referenceNumber", "revenueDate", "revenueType", "status", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "activity", "amountBeforeVat", "bankAccountId", "cancelledAt", "cashBankAccount", "categoryId", "collectionMethod", "costCenter", "createdAt", "description", "id", "journalEntryId", "notes", "partyId", "postedAt", "referenceNumber", "revenueDate", "revenueType", "status", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Revenue";
DROP TABLE "Revenue";
ALTER TABLE "new_Revenue" RENAME TO "Revenue";
CREATE UNIQUE INDEX "Revenue_voucherNumber_key" ON "Revenue"("voucherNumber");
CREATE UNIQUE INDEX "Revenue_journalEntryId_key" ON "Revenue"("journalEntryId");
CREATE INDEX "Revenue_revenueDate_idx" ON "Revenue"("revenueDate");
CREATE INDEX "Revenue_partyId_idx" ON "Revenue"("partyId");
CREATE INDEX "Revenue_tenantId_companyId_idx" ON "Revenue"("tenantId", "companyId");
CREATE TABLE "new_RevenueCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "accountId" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RevenueCategory_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_RevenueCategory" ("accountId", "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt") SELECT "accountId", "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt" FROM "RevenueCategory";
DROP TABLE "RevenueCategory";
ALTER TABLE "new_RevenueCategory" RENAME TO "RevenueCategory";
CREATE UNIQUE INDEX "RevenueCategory_code_key" ON "RevenueCategory"("code");
CREATE INDEX "RevenueCategory_tenantId_companyId_idx" ON "RevenueCategory"("tenantId", "companyId");
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
    "referenceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "paymentMethod" TEXT,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
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
    CONSTRAINT "Sale_factoryTransactionId_fkey" FOREIGN KEY ("factoryTransactionId") REFERENCES "FactoryTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "factoryTransactionId", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "sourceOrderId", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount") SELECT "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "factoryTransactionId", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "sourceOrderId", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_deliveryNoteId_key" ON "Sale"("deliveryNoteId");
CREATE UNIQUE INDEX "Sale_factoryTransactionId_key" ON "Sale"("factoryTransactionId");
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");
CREATE INDEX "Sale_partyId_idx" ON "Sale"("partyId");
CREATE INDEX "Sale_sourceOrderId_idx" ON "Sale"("sourceOrderId");
CREATE INDEX "Sale_tenantId_companyId_idx" ON "Sale"("tenantId", "companyId");
CREATE TABLE "new_SaleItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "saleId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "description" TEXT,
    "materialGrade" TEXT,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatRate" DECIMAL NOT NULL DEFAULT 15,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SaleItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_SaleItem" ("description", "discount", "id", "itemId", "materialGrade", "quantity", "saleId", "totalAmount", "unitPrice", "vatAmount", "vatRate") SELECT "description", "discount", "id", "itemId", "materialGrade", "quantity", "saleId", "totalAmount", "unitPrice", "vatAmount", "vatRate" FROM "SaleItem";
DROP TABLE "SaleItem";
ALTER TABLE "new_SaleItem" RENAME TO "SaleItem";
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
CREATE INDEX "SaleItem_itemId_idx" ON "SaleItem"("itemId");
CREATE INDEX "SaleItem_tenantId_companyId_idx" ON "SaleItem"("tenantId", "companyId");
CREATE TABLE "new_StockMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_StockMovement" ("balanceAfter", "createdAt", "id", "itemId", "movementDate", "movementNumber", "movementType", "notes", "ownershipType", "partyId", "quantityIn", "quantityOut", "referenceId", "referenceNumber", "referenceType", "totalValue", "unitCost") SELECT "balanceAfter", "createdAt", "id", "itemId", "movementDate", "movementNumber", "movementType", "notes", "ownershipType", "partyId", "quantityIn", "quantityOut", "referenceId", "referenceNumber", "referenceType", "totalValue", "unitCost" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE UNIQUE INDEX "StockMovement_movementNumber_key" ON "StockMovement"("movementNumber");
CREATE INDEX "StockMovement_movementDate_idx" ON "StockMovement"("movementDate");
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");
CREATE INDEX "StockMovement_partyId_idx" ON "StockMovement"("partyId");
CREATE INDEX "StockMovement_tenantId_companyId_idx" ON "StockMovement"("tenantId", "companyId");
CREATE TABLE "new_TransportTrip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
CREATE INDEX "TransportTrip_tenantId_companyId_idx" ON "TransportTrip"("tenantId", "companyId");
CREATE TABLE "new_TransportTripExpense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_TransportTripExpense" ("amount", "attachmentUrl", "createdAt", "description", "expenseDate", "expenseType", "id", "notes", "tripId") SELECT "amount", "attachmentUrl", "createdAt", "description", "expenseDate", "expenseType", "id", "notes", "tripId" FROM "TransportTripExpense";
DROP TABLE "TransportTripExpense";
ALTER TABLE "new_TransportTripExpense" RENAME TO "TransportTripExpense";
CREATE INDEX "TransportTripExpense_tripId_idx" ON "TransportTripExpense"("tripId");
CREATE INDEX "TransportTripExpense_tenantId_companyId_idx" ON "TransportTripExpense"("tenantId", "companyId");
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
    "fuelType" TEXT,
    "fuelConsumption" DECIMAL,
    "fuelPrice" DECIMAL,
    "maintenancePerKm" DECIMAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Truck" ("capacity", "createdAt", "fuelConsumption", "fuelPrice", "fuelType", "id", "maintenancePerKm", "model", "modelYear", "notes", "plateNumber", "status", "trailerType", "truckType", "updatedAt") SELECT "capacity", "createdAt", "fuelConsumption", "fuelPrice", "fuelType", "id", "maintenancePerKm", "model", "modelYear", "notes", "plateNumber", "status", "trailerType", "truckType", "updatedAt" FROM "Truck";
DROP TABLE "Truck";
ALTER TABLE "new_Truck" RENAME TO "Truck";
CREATE UNIQUE INDEX "Truck_plateNumber_key" ON "Truck"("plateNumber");
CREATE INDEX "Truck_tenantId_companyId_idx" ON "Truck"("tenantId", "companyId");
CREATE TABLE "new_TruckDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
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
INSERT INTO "new_TruckDocument" ("attachmentUrl", "createdAt", "documentNumber", "documentType", "expiryDate", "id", "issueDate", "notes", "truckId") SELECT "attachmentUrl", "createdAt", "documentNumber", "documentType", "expiryDate", "id", "issueDate", "notes", "truckId" FROM "TruckDocument";
DROP TABLE "TruckDocument";
ALTER TABLE "new_TruckDocument" RENAME TO "TruckDocument";
CREATE INDEX "TruckDocument_truckId_idx" ON "TruckDocument"("truckId");
CREATE INDEX "TruckDocument_expiryDate_idx" ON "TruckDocument"("expiryDate");
CREATE INDEX "TruckDocument_tenantId_companyId_idx" ON "TruckDocument"("tenantId", "companyId");
CREATE TABLE "new_Unit" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Unit" ("code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt") SELECT "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt" FROM "Unit";
DROP TABLE "Unit";
ALTER TABLE "new_Unit" RENAME TO "Unit";
CREATE UNIQUE INDEX "Unit_code_key" ON "Unit"("code");
CREATE INDEX "Unit_tenantId_companyId_idx" ON "Unit"("tenantId", "companyId");
CREATE TABLE "new_VoucherAllocation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherId" INTEGER NOT NULL,
    "saleId" INTEGER,
    "purchaseId" INTEGER,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VoucherAllocation_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "FinancialVoucher" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VoucherAllocation_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "VoucherAllocation_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_VoucherAllocation" ("amount", "createdAt", "id", "purchaseId", "saleId", "voucherId") SELECT "amount", "createdAt", "id", "purchaseId", "saleId", "voucherId" FROM "VoucherAllocation";
DROP TABLE "VoucherAllocation";
ALTER TABLE "new_VoucherAllocation" RENAME TO "VoucherAllocation";
CREATE INDEX "VoucherAllocation_saleId_idx" ON "VoucherAllocation"("saleId");
CREATE INDEX "VoucherAllocation_purchaseId_idx" ON "VoucherAllocation"("purchaseId");
CREATE INDEX "VoucherAllocation_tenantId_companyId_idx" ON "VoucherAllocation"("tenantId", "companyId");
CREATE UNIQUE INDEX "VoucherAllocation_voucherId_saleId_key" ON "VoucherAllocation"("voucherId", "saleId");
CREATE UNIQUE INDEX "VoucherAllocation_voucherId_purchaseId_key" ON "VoucherAllocation"("voucherId", "purchaseId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
