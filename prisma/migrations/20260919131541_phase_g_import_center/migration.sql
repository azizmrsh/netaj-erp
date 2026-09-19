-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "batchNumber" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "importMode" TEXT NOT NULL DEFAULT 'FULL',
    "duplicateStrategy" TEXT NOT NULL DEFAULT 'SKIP',
    "sourceFile" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW',
    "mappingJson" TEXT NOT NULL DEFAULT '{}',
    "sheetsJson" TEXT NOT NULL DEFAULT '[]',
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "duplicateRows" INTEGER NOT NULL DEFAULT 0,
    "createdRows" INTEGER NOT NULL DEFAULT 0,
    "updatedRows" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "executedAt" DATETIME,
    "rolledBackAt" DATETIME,
    "failureReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportBatch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportRow" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "importBatchId" INTEGER NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "rawDataJson" TEXT NOT NULL,
    "mappedDataJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "errorsJson" TEXT NOT NULL DEFAULT '[]',
    "warningsJson" TEXT NOT NULL DEFAULT '[]',
    "duplicateKey" TEXT,
    "entityType" TEXT,
    "entityId" INTEGER,
    "operation" TEXT,
    "importedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportRow_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LegacyRecordLink" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "importBatchId" INTEGER NOT NULL,
    "importRowId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "legacySource" TEXT NOT NULL,
    "legacyDocumentNumber" TEXT,
    "sourceFile" TEXT NOT NULL,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "importedBy" TEXT,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wasCreated" BOOLEAN NOT NULL DEFAULT true,
    "beforeDataJson" TEXT,
    CONSTRAINT "LegacyRecordLink_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LegacyRecordLink_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ImportTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "targetType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mappingJson" TEXT NOT NULL DEFAULT '{}',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ImportBatch_batchNumber_key" ON "ImportBatch"("batchNumber");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_companyId_createdAt_idx" ON "ImportBatch"("tenantId", "companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_tenantId_companyId_status_idx" ON "ImportBatch"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "ImportBatch_fileHash_targetType_idx" ON "ImportBatch"("fileHash", "targetType");

-- CreateIndex
CREATE INDEX "ImportRow_tenantId_companyId_status_idx" ON "ImportRow"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "ImportRow_entityType_entityId_idx" ON "ImportRow"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRow_importBatchId_sourceSheet_sourceRow_key" ON "ImportRow"("importBatchId", "sourceSheet", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyRecordLink_importRowId_key" ON "LegacyRecordLink"("importRowId");

-- CreateIndex
CREATE INDEX "LegacyRecordLink_tenantId_companyId_entityType_entityId_idx" ON "LegacyRecordLink"("tenantId", "companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "LegacyRecordLink_legacySource_legacyDocumentNumber_idx" ON "LegacyRecordLink"("legacySource", "legacyDocumentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "LegacyRecordLink_importBatchId_entityType_entityId_sourceRow_key" ON "LegacyRecordLink"("importBatchId", "entityType", "entityId", "sourceRow");

-- CreateIndex
CREATE INDEX "ImportTemplate_tenantId_companyId_targetType_idx" ON "ImportTemplate"("tenantId", "companyId", "targetType");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTemplate_tenantId_companyId_targetType_name_key" ON "ImportTemplate"("tenantId", "companyId", "targetType", "name");

-- Register the isolated import module without changing existing business data.
INSERT OR IGNORE INTO "ModuleDefinition" ("key", "nameAr", "nameEn", "description", "isCore", "createdAt")
VALUES ('IMPORT', 'مركز استيراد البيانات', 'Data Import Center', 'Controlled legacy and opening-data migration', false, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "CompanyModule" ("companyId", "moduleKey", "enabled", "settingsJson", "updatedAt")
SELECT "id", 'IMPORT', true, '{}', CURRENT_TIMESTAMP FROM "Company";

INSERT OR IGNORE INTO "PlanModule" ("planId", "moduleKey", "enabled")
SELECT "id", 'IMPORT', true FROM "SubscriptionPlan";

INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description", "createdAt") VALUES
('IMPORT.READ', 'IMPORT', 'READ', 'View import batches', CURRENT_TIMESTAMP),
('IMPORT.CREATE', 'IMPORT', 'CREATE', 'Create import batches', CURRENT_TIMESTAMP),
('IMPORT.UPDATE', 'IMPORT', 'UPDATE', 'Update draft mappings', CURRENT_TIMESTAMP),
('IMPORT.MANAGE', 'IMPORT', 'MANAGE', 'Manage import templates', CURRENT_TIMESTAMP),
('IMPORT.UPLOAD', 'IMPORT', 'UPLOAD', 'Upload source files', CURRENT_TIMESTAMP),
('IMPORT.PREVIEW', 'IMPORT', 'PREVIEW', 'Preview and validate source data', CURRENT_TIMESTAMP),
('IMPORT.EXECUTE', 'IMPORT', 'EXECUTE', 'Execute approved imports', CURRENT_TIMESTAMP),
('IMPORT.UPDATE_EXISTING', 'IMPORT', 'UPDATE_EXISTING', 'Update existing master data during import', CURRENT_TIMESTAMP),
('IMPORT.ACCOUNTING_IMPORT', 'IMPORT', 'ACCOUNTING_IMPORT', 'Import accounting opening data', CURRENT_TIMESTAMP),
('IMPORT.ROLLBACK', 'IMPORT', 'ROLLBACK', 'Safely roll back batch-created records', CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionKey", "granted")
SELECT r."id", p."key", true
FROM "Role" r CROSS JOIN "Permission" p
WHERE r."code" IN ('ADMIN', 'OWNER') AND p."moduleKey" = 'IMPORT';
