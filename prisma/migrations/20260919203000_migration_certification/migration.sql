CREATE TABLE "MigrationCertificate" (
  "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  "tenantId" INTEGER NOT NULL DEFAULT 1,
  "companyId" INTEGER NOT NULL DEFAULT 1,
  "certificateNumber" TEXT NOT NULL,
  "importBatchId" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "controlsJson" TEXT NOT NULL,
  "summaryJson" TEXT NOT NULL DEFAULT '{}',
  "generatedBy" TEXT,
  "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "certifiedAt" DATETIME,
  "certifiedBy" TEXT,
  CONSTRAINT "MigrationCertificate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "MigrationCertificate_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "MigrationCertificate_certificateNumber_key" ON "MigrationCertificate"("certificateNumber");
CREATE INDEX "MigrationCertificate_tenantId_companyId_generatedAt_idx" ON "MigrationCertificate"("tenantId", "companyId", "generatedAt");
CREATE INDEX "MigrationCertificate_importBatchId_status_idx" ON "MigrationCertificate"("importBatchId", "status");
