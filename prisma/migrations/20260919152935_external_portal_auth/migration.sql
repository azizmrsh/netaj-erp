-- AlterTable
ALTER TABLE "PortalIdentity" ADD COLUMN "inviteExpiresAt" DATETIME;
ALTER TABLE "PortalIdentity" ADD COLUMN "inviteTokenHash" TEXT;

-- CreateTable
CREATE TABLE "PortalSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "portalIdentityId" INTEGER NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PortalSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PortalSession_portalIdentityId_fkey" FOREIGN KEY ("portalIdentityId") REFERENCES "PortalIdentity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PortalSession_tokenHash_key" ON "PortalSession"("tokenHash");

-- CreateIndex
CREATE INDEX "PortalSession_tenantId_companyId_portalIdentityId_expiresAt_idx" ON "PortalSession"("tenantId", "companyId", "portalIdentityId", "expiresAt");

-- CreateIndex
CREATE INDEX "PortalSession_expiresAt_revokedAt_idx" ON "PortalSession"("expiresAt", "revokedAt");
