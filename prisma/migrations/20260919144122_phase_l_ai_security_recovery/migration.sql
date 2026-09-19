-- AlterTable
ALTER TABLE "AuditLog" ADD COLUMN "entryHash" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "previousHash" TEXT;

-- AlterTable
ALTER TABLE "Party" ADD COLUMN "bankName" TEXT;
ALTER TABLE "Party" ADD COLUMN "iban" TEXT;

-- CreateTable
CREATE TABLE "UserMfaFactor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "factorType" TEXT NOT NULL DEFAULT 'TOTP',
    "label" TEXT,
    "encryptedSecret" TEXT NOT NULL,
    "verifiedAt" DATETIME,
    "lastUsedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserMfaFactor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MfaRecoveryCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "factorId" INTEGER NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MfaRecoveryCode_factorId_fkey" FOREIGN KEY ("factorId") REFERENCES "UserMfaFactor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantConversation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "userId" INTEGER NOT NULL,
    "title" TEXT,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "contextJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssistantConversation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "conversationId" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "responseType" TEXT NOT NULL DEFAULT 'TEXT',
    "dataJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssistantMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssistantActionProposal" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "conversationId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "actionType" TEXT NOT NULL,
    "previewJson" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "confirmedAt" DATETIME,
    "cancelledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssistantActionProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "AssistantActionProposal_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AssistantConversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ControlAlert" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "alertType" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" INTEGER,
    "fingerprint" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" DATETIME,
    "resolvedBy" TEXT,
    "resolution" TEXT,
    CONSTRAINT "ControlAlert_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BackupRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "backupNumber" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "checksumSha256" TEXT NOT NULL,
    "databaseVersion" TEXT,
    "status" TEXT NOT NULL DEFAULT 'VERIFIED',
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verifiedAt" DATETIME,
    CONSTRAINT "BackupRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "UserMfaFactor_userId_factorType_verifiedAt_idx" ON "UserMfaFactor"("userId", "factorType", "verifiedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MfaRecoveryCode_factorId_codeHash_key" ON "MfaRecoveryCode"("factorId", "codeHash");

-- CreateIndex
CREATE INDEX "AssistantConversation_tenantId_companyId_userId_updatedAt_idx" ON "AssistantConversation"("tenantId", "companyId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AssistantMessage_tenantId_companyId_conversationId_createdAt_idx" ON "AssistantMessage"("tenantId", "companyId", "conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "AssistantActionProposal_tenantId_companyId_userId_status_expiresAt_idx" ON "AssistantActionProposal"("tenantId", "companyId", "userId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "ControlAlert_tenantId_companyId_status_severity_detectedAt_idx" ON "ControlAlert"("tenantId", "companyId", "status", "severity", "detectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ControlAlert_tenantId_companyId_fingerprint_key" ON "ControlAlert"("tenantId", "companyId", "fingerprint");

-- CreateIndex
CREATE INDEX "BackupRecord_tenantId_companyId_createdAt_idx" ON "BackupRecord"("tenantId", "companyId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BackupRecord_tenantId_companyId_backupNumber_key" ON "BackupRecord"("tenantId", "companyId", "backupNumber");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_companyId_id_idx" ON "AuditLog"("tenantId", "companyId", "id");

-- CreateIndex
CREATE INDEX "AuditLog_entryHash_idx" ON "AuditLog"("entryHash");

-- CreateIndex
CREATE INDEX "Party_tenantId_companyId_iban_idx" ON "Party"("tenantId", "companyId", "iban");
