-- CreateTable
CREATE TABLE "CompanyAccess" (
    "membershipId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("membershipId", "companyId"),
    CONSTRAINT "CompanyAccess_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CompanyAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "membershipId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" DATETIME,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthSession_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AuthSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backward-compatible first administrator. The password remains unset until
-- the protected one-time setup flow is completed.
INSERT OR IGNORE INTO "PlatformUser" ("email", "name", "passwordHash", "status", "locale", "mfaEnabled", "updatedAt")
VALUES ('admin@netaj.local', 'مدير نظام نتاج', NULL, 'ACTIVE', 'ar', false, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "TenantMembership" ("tenantId", "userId", "defaultCompanyId", "status", "updatedAt")
SELECT 1, "id", 1, 'ACTIVE', CURRENT_TIMESTAMP FROM "PlatformUser" WHERE "email" = 'admin@netaj.local';

INSERT OR IGNORE INTO "CompanyAccess" ("membershipId", "companyId", "isDefault")
SELECT "id", 1, true FROM "TenantMembership"
WHERE "tenantId" = 1 AND "userId" = (SELECT "id" FROM "PlatformUser" WHERE "email" = 'admin@netaj.local');

INSERT OR IGNORE INTO "Role" ("tenantId", "companyId", "code", "name", "isSystem", "updatedAt")
VALUES (1, 1, 'ADMIN', 'مدير الشركة', true, CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.READ', "key", 'READ', 'قراءة الوحدة' FROM "ModuleDefinition";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.CREATE', "key", 'CREATE', 'إنشاء سجلات' FROM "ModuleDefinition";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.UPDATE', "key", 'UPDATE', 'تعديل سجلات' FROM "ModuleDefinition";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.POST', "key", 'POST', 'ترحيل المستندات' FROM "ModuleDefinition";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.CANCEL', "key", 'CANCEL', 'إلغاء أو عكس المستندات' FROM "ModuleDefinition";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.APPROVE', "key", 'APPROVE', 'اعتماد المستندات' FROM "ModuleDefinition";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description")
SELECT "key" || '.MANAGE', "key", 'MANAGE', 'إدارة إعدادات الوحدة' FROM "ModuleDefinition";

INSERT OR IGNORE INTO "MembershipRole" ("membershipId", "roleId")
SELECT membership."id", role."id"
FROM "TenantMembership" membership, "Role" role
WHERE membership."tenantId" = 1
  AND membership."userId" = (SELECT "id" FROM "PlatformUser" WHERE "email" = 'admin@netaj.local')
  AND role."tenantId" = 1 AND role."companyId" = 1 AND role."code" = 'ADMIN';

INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionKey", "granted")
SELECT role."id", permission."key", true
FROM "Role" role, "Permission" permission
WHERE role."tenantId" = 1 AND role."companyId" = 1 AND role."code" = 'ADMIN';

-- CreateIndex
CREATE INDEX "CompanyAccess_companyId_idx" ON "CompanyAccess"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_userId_expiresAt_idx" ON "AuthSession"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_membershipId_companyId_idx" ON "AuthSession"("membershipId", "companyId");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_revokedAt_idx" ON "AuthSession"("expiresAt", "revokedAt");
