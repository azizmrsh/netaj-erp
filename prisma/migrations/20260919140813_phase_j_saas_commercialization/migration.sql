-- CreateTable
CREATE TABLE "PlanEntitlement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "entitlementKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "PlanEntitlement_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlanEntitlement_entitlementKey_fkey" FOREIGN KEY ("entitlementKey") REFERENCES "EntitlementDefinition" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformAdministrator" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'PLATFORM_ADMIN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlatformAdministrator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SupportAccessGrant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "platformAdminId" INTEGER NOT NULL,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "scopeJson" TEXT NOT NULL DEFAULT '[]',
    "reason" TEXT NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportAccessGrant_platformAdminId_fkey" FOREIGN KEY ("platformAdminId") REFERENCES "PlatformAdministrator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupportAccessGrant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SupportAccessGrant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformConfiguration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "configKey" TEXT NOT NULL,
    "valueJson" TEXT NOT NULL,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "OnboardingSession" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "currentStep" TEXT NOT NULL DEFAULT 'COMPANY',
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "dataJson" TEXT NOT NULL DEFAULT '{}',
    "startedBy" INTEGER,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "OnboardingSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "OnboardingSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserInvitation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "roleCode" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invitedById" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "acceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserInvitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserInvitation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "UserInvitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "PlatformUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantUsageSnapshot" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userCount" INTEGER NOT NULL DEFAULT 0,
    "companyCount" INTEGER NOT NULL DEFAULT 0,
    "storageBytes" BIGINT NOT NULL DEFAULT 0,
    "metricsJson" TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT "TenantUsageSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SubscriptionPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userLimit" INTEGER,
    "companyLimit" INTEGER,
    "storageMb" INTEGER,
    "monthlyPrice" DECIMAL NOT NULL DEFAULT 0,
    "annualPrice" DECIMAL NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "featureLimitsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SubscriptionPlan" ("code", "companyLimit", "createdAt", "id", "name", "status", "storageMb", "updatedAt", "userLimit") SELECT "code", "companyLimit", "createdAt", "id", "name", "status", "storageMb", "updatedAt", "userLimit" FROM "SubscriptionPlan";
DROP TABLE "SubscriptionPlan";
ALTER TABLE "new_SubscriptionPlan" RENAME TO "SubscriptionPlan";
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE TABLE "new_TenantSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" DATETIME,
    "endsAt" DATETIME,
    "billingPeriod" TEXT NOT NULL DEFAULT 'MONTHLY',
    "currentPeriodStart" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" DATETIME,
    "renewsAt" DATETIME,
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "pendingPlanId" INTEGER,
    "changeEffectiveAt" DATETIME,
    "externalCustomerRef" TEXT,
    "externalSubscriptionRef" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TenantSubscription_pendingPlanId_fkey" FOREIGN KEY ("pendingPlanId") REFERENCES "SubscriptionPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TenantSubscription" ("createdAt", "endsAt", "id", "planId", "startsAt", "status", "tenantId", "trialEndsAt", "updatedAt") SELECT "createdAt", "endsAt", "id", "planId", "startsAt", "status", "tenantId", "trialEndsAt", "updatedAt" FROM "TenantSubscription";
DROP TABLE "TenantSubscription";
ALTER TABLE "new_TenantSubscription" RENAME TO "TenantSubscription";
CREATE INDEX "TenantSubscription_tenantId_status_idx" ON "TenantSubscription"("tenantId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "PlanEntitlement_planId_entitlementKey_key" ON "PlanEntitlement"("planId", "entitlementKey");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformAdministrator_userId_key" ON "PlatformAdministrator"("userId");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_platformAdminId_expiresAt_revokedAt_idx" ON "SupportAccessGrant"("platformAdminId", "expiresAt", "revokedAt");

-- CreateIndex
CREATE INDEX "SupportAccessGrant_tenantId_companyId_idx" ON "SupportAccessGrant"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformConfiguration_configKey_key" ON "PlatformConfiguration"("configKey");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingSession_tenantId_companyId_key" ON "OnboardingSession"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "UserInvitation_tenantId_companyId_expiresAt_idx" ON "UserInvitation"("tenantId", "companyId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserInvitation_tenantId_companyId_email_status_key" ON "UserInvitation"("tenantId", "companyId", "email", "status");

-- CreateIndex
CREATE INDEX "TenantUsageSnapshot_tenantId_capturedAt_idx" ON "TenantUsageSnapshot"("tenantId", "capturedAt");

INSERT OR IGNORE INTO "EntitlementDefinition" ("key","name","valueType","description","createdAt") VALUES
('USERS_MAX','Maximum Users','NUMBER','Maximum active tenant memberships',CURRENT_TIMESTAMP),
('COMPANIES_MAX','Maximum Companies','NUMBER','Maximum active companies',CURRENT_TIMESTAMP),
('STORAGE_MB','Storage MB','NUMBER','Maximum attachment storage',CURRENT_TIMESTAMP),
('CUSTOM_DASHBOARDS_MAX','Custom Dashboards','NUMBER','Maximum dashboards per company',CURRENT_TIMESTAMP),
('CUSTOM_REPORTS_MAX','Custom Reports','NUMBER','Maximum custom reports per company',CURRENT_TIMESTAMP);

UPDATE "SubscriptionPlan" SET "monthlyPrice"=0,"annualPrice"=0,"currencyCode"='SAR',"trialDays"=0,"featureLimitsJson"='{"support":"legacy"}' WHERE "code"='LEGACY';
INSERT OR IGNORE INTO "SubscriptionPlan" ("code","name","status","userLimit","companyLimit","storageMb","monthlyPrice","annualPrice","currencyCode","trialDays","featureLimitsJson","createdAt","updatedAt") VALUES
('STARTER','Starter','ACTIVE',5,1,1024,199,1990,'SAR',14,'{"CUSTOM_DASHBOARDS_MAX":3,"CUSTOM_REPORTS_MAX":10}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('BUSINESS','Business','ACTIVE',25,5,10240,699,6990,'SAR',14,'{"CUSTOM_DASHBOARDS_MAX":20,"CUSTOM_REPORTS_MAX":100}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('ENTERPRISE','Enterprise','ACTIVE',NULL,NULL,NULL,0,0,'SAR',30,'{"CUSTOM_DASHBOARDS_MAX":-1,"CUSTOM_REPORTS_MAX":-1}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

INSERT OR IGNORE INTO "PlanModule" ("planId","moduleKey","enabled") SELECT p."id",m."key",true FROM "SubscriptionPlan" p CROSS JOIN "ModuleDefinition" m WHERE p."code"='ENTERPRISE';
INSERT OR IGNORE INTO "PlanModule" ("planId","moduleKey","enabled") SELECT p."id",m."key",true FROM "SubscriptionPlan" p JOIN "ModuleDefinition" m ON m."key" IN ('CORE','SALES','PURCHASES','INVENTORY','ACCOUNTING','IMPORT','CONFIG','DESIGN') WHERE p."code"='STARTER';
INSERT OR IGNORE INTO "PlanModule" ("planId","moduleKey","enabled") SELECT p."id",m."key",true FROM "SubscriptionPlan" p JOIN "ModuleDefinition" m ON m."key" NOT IN ('EXTERNAL') WHERE p."code"='BUSINESS';

INSERT OR IGNORE INTO "PlanEntitlement" ("planId","entitlementKey","value") SELECT "id",'USERS_MAX',COALESCE(CAST("userLimit" AS TEXT),'-1') FROM "SubscriptionPlan";
INSERT OR IGNORE INTO "PlanEntitlement" ("planId","entitlementKey","value") SELECT "id",'COMPANIES_MAX',COALESCE(CAST("companyLimit" AS TEXT),'-1') FROM "SubscriptionPlan";
INSERT OR IGNORE INTO "PlanEntitlement" ("planId","entitlementKey","value") SELECT "id",'STORAGE_MB',COALESCE(CAST("storageMb" AS TEXT),'-1') FROM "SubscriptionPlan";

UPDATE "TenantSubscription" SET "billingPeriod"='ANNUAL',"currentPeriodStart"="startsAt","currentPeriodEnd"=datetime("startsAt",'+100 years'),"renewsAt"=NULL WHERE "planId" IN (SELECT "id" FROM "SubscriptionPlan" WHERE "code"='LEGACY');
INSERT OR IGNORE INTO "PlatformAdministrator" ("userId","role","status","createdAt","updatedAt") SELECT "id",'PLATFORM_OWNER','ACTIVE',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "PlatformUser" WHERE "passwordHash" IS NOT NULL ORDER BY "id" LIMIT 1;
INSERT OR IGNORE INTO "PlatformConfiguration" ("configKey","valueJson","updatedBy","createdAt","updatedAt") VALUES ('BILLING_PROVIDER','{"provider":null,"mode":"NOT_CONFIGURED","note":"No payment processing is performed without provider credentials"}','migration',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "OnboardingSession" ("tenantId","companyId","currentStep","status","dataJson","completedAt","createdAt","updatedAt") SELECT "tenantId","id",'COMPLETE','COMPLETED','{"legacy":true}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "Company";

INSERT OR IGNORE INTO "IndustryTemplateDefinition" ("code","nameAr","nameEn","configJson","isActive","createdAt","updatedAt") VALUES
('RETAIL','تجزئة','Retail','{"modules":["CORE","SALES","PURCHASES","INVENTORY","ACCOUNTING","IMPORT","CONFIG","DESIGN"]}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
