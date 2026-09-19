ALTER TABLE "ImportBatch" ADD COLUMN "sourceSystemId" INTEGER;
ALTER TABLE "ImportBatch" ADD COLUMN "legacySystem" TEXT NOT NULL DEFAULT 'GENERIC';
ALTER TABLE "ImportBatch" ADD COLUMN "cutoverDate" DATETIME;
ALTER TABLE "ImportBatch" ADD COLUMN "impactJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ImportBatch" ADD COLUMN "reconciliationJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ImportBatch" ADD COLUMN "warningRows" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ImportBatch" ADD COLUMN "dryRunAt" DATETIME;
ALTER TABLE "ImportBatch" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "ImportBatch" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "ImportBatch" ADD COLUMN "rollbackStatus" TEXT NOT NULL DEFAULT 'AVAILABLE';
ALTER TABLE "ImportBatch" ADD COLUMN "rollbackBlockedReason" TEXT;

ALTER TABLE "LegacyRecordLink" ADD COLUMN "legacySystem" TEXT;
ALTER TABLE "LegacyRecordLink" ADD COLUMN "legacyCode" TEXT;

ALTER TABLE "ImportTemplate" ADD COLUMN "sourceSystemId" INTEGER;
ALTER TABLE "ImportTemplate" ADD COLUMN "headerFingerprint" TEXT;

CREATE TABLE "LegacySourceSystem" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "vendor" TEXT,
  "version" TEXT,
  "description" TEXT,
  "detectionJson" TEXT NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdBy" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "LegacySourceSystem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "LegacyReferenceSnapshot" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "importBatchId" INTEGER NOT NULL,
  "importRowId" INTEGER NOT NULL,
  "reportType" TEXT NOT NULL,
  "snapshotDate" DATETIME,
  "legacyCode" TEXT,
  "dataJson" TEXT NOT NULL,
  "importedBy" TEXT,
  "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LegacyReferenceSnapshot_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LegacyReferenceSnapshot_importRowId_fkey" FOREIGN KEY ("importRowId") REFERENCES "ImportRow" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LegacySourceSystem_tenantId_companyId_code_key" ON "LegacySourceSystem"("tenantId", "companyId", "code");
CREATE INDEX "LegacySourceSystem_tenantId_companyId_isActive_idx" ON "LegacySourceSystem"("tenantId", "companyId", "isActive");
CREATE UNIQUE INDEX "LegacyReferenceSnapshot_importRowId_key" ON "LegacyReferenceSnapshot"("importRowId");
CREATE INDEX "LegacyReferenceSnapshot_tenantId_companyId_reportType_idx" ON "LegacyReferenceSnapshot"("tenantId", "companyId", "reportType");
CREATE INDEX "LegacyReferenceSnapshot_importBatchId_idx" ON "LegacyReferenceSnapshot"("importBatchId");
CREATE INDEX "ImportBatch_sourceSystemId_targetType_idx" ON "ImportBatch"("sourceSystemId", "targetType");
CREATE INDEX "ImportTemplate_sourceSystemId_targetType_headerFingerprint_idx" ON "ImportTemplate"("sourceSystemId", "targetType", "headerFingerprint");
