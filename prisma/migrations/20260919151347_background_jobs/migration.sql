-- CreateTable
CREATE TABLE "BackgroundJob" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "jobNumber" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT,
    "idempotencyKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "scheduledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "nextRetryAt" DATETIME,
    "lastError" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BackgroundJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BackgroundJob_tenantId_companyId_status_scheduledAt_priority_idx" ON "BackgroundJob"("tenantId", "companyId", "status", "scheduledAt", "priority");

-- CreateIndex
CREATE INDEX "BackgroundJob_tenantId_companyId_jobType_createdAt_idx" ON "BackgroundJob"("tenantId", "companyId", "jobType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_tenantId_companyId_jobNumber_key" ON "BackgroundJob"("tenantId", "companyId", "jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "BackgroundJob_tenantId_companyId_jobType_idempotencyKey_key" ON "BackgroundJob"("tenantId", "companyId", "jobType", "idempotencyKey");
