-- CreateTable
CREATE TABLE "Tenant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "defaultLanguageCode" TEXT NOT NULL DEFAULT 'ar',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompanyGroup" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "groupId" INTEGER,
    "code" TEXT NOT NULL,
    "legalNameAr" TEXT NOT NULL,
    "legalNameEn" TEXT,
    "tradeName" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'SA',
    "baseCurrencyCode" TEXT NOT NULL DEFAULT 'SAR',
    "defaultLanguageCode" TEXT NOT NULL DEFAULT 'ar',
    "timeZoneName" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "vatNumber" TEXT,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Company_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Company_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompanyGroup" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Company_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Company_baseCurrencyCode_fkey" FOREIGN KEY ("baseCurrencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Company_defaultLanguageCode_fkey" FOREIGN KEY ("defaultLanguageCode") REFERENCES "Language" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Company_timeZoneName_fkey" FOREIGN KEY ("timeZoneName") REFERENCES "TimeZone" ("name") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "city" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Branch_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Warehouse" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "branchId" INTEGER,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Warehouse_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Warehouse_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Department" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "parentId" INTEGER,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Department_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Department_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FiscalYear" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalYear_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FiscalPeriod" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "fiscalYearId" INTEGER NOT NULL,
    "periodNumber" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FiscalPeriod_fiscalYearId_fkey" FOREIGN KEY ("fiscalYearId") REFERENCES "FiscalYear" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Currency" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "baseCurrencyCode" TEXT NOT NULL,
    "quoteCurrencyCode" TEXT NOT NULL,
    "rateDate" DATETIME NOT NULL,
    "rate" DECIMAL NOT NULL,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeRate_baseCurrencyCode_fkey" FOREIGN KEY ("baseCurrencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ExchangeRate_quoteCurrencyCode_fkey" FOREIGN KEY ("quoteCurrencyCode") REFERENCES "Currency" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Language" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "nativeName" TEXT NOT NULL,
    "direction" TEXT NOT NULL DEFAULT 'LTR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Country" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "defaultCurrencyCode" TEXT,
    "taxRegistrationLabel" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TimeZone" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "utcOffset" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LocalizationPack" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LocalizationPack_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "Country" ("code") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "LocalizationPack_languageCode_fkey" FOREIGN KEY ("languageCode") REFERENCES "Language" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyLocalization" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "localizationPackId" INTEGER NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompanyLocalization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompanyLocalization_localizationPackId_fkey" FOREIGN KEY ("localizationPackId") REFERENCES "LocalizationPack" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ModuleDefinition" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT,
    "isCore" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CompanyModule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "settingsJson" TEXT NOT NULL DEFAULT '{}',
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyModule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompanyModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "ModuleDefinition" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EntitlementDefinition" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "valueType" TEXT NOT NULL DEFAULT 'BOOLEAN',
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "CompanyEntitlement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL,
    "entitlementKey" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'PLAN',
    "expiresAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyEntitlement_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompanyEntitlement_entitlementKey_fkey" FOREIGN KEY ("entitlementKey") REFERENCES "EntitlementDefinition" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubscriptionPlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "userLimit" INTEGER,
    "companyLimit" INTEGER,
    "storageMb" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlanModule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "planId" INTEGER NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "PlanModule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PlanModule_moduleKey_fkey" FOREIGN KEY ("moduleKey") REFERENCES "ModuleDefinition" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TenantSubscription" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "planId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'TRIAL',
    "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "trialEndsAt" DATETIME,
    "endsAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantSubscription_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TenantSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlatformUser" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TenantMembership" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "defaultCompanyId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantMembership_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TenantMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "PlatformUser" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Role" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL,
    "companyId" INTEGER,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Role_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Permission" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "moduleKey" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" INTEGER NOT NULL,
    "permissionKey" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY ("roleId", "permissionKey"),
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission" ("key") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MembershipRole" (
    "membershipId" INTEGER NOT NULL,
    "roleId" INTEGER NOT NULL,

    PRIMARY KEY ("membershipId", "roleId"),
    CONSTRAINT "MembershipRole_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "TenantMembership" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MembershipRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Preserve the current NETAj installation as the first tenant/company.
-- These reference rows are inserted before CostCenter receives companyId=1.
INSERT INTO "Currency" ("code", "nameAr", "nameEn", "symbol", "decimalPlaces", "isActive")
VALUES ('SAR', 'ريال سعودي', 'Saudi Riyal', 'ر.س', 2, true),
       ('USD', 'دولار أمريكي', 'US Dollar', '$', 2, true);

INSERT INTO "Language" ("code", "name", "nativeName", "direction", "isActive")
VALUES ('ar', 'Arabic', 'العربية', 'RTL', true),
       ('en', 'English', 'English', 'LTR', true);

INSERT INTO "Country" ("code", "nameAr", "nameEn", "defaultCurrencyCode", "taxRegistrationLabel", "isActive")
VALUES ('SA', 'المملكة العربية السعودية', 'Saudi Arabia', 'SAR', 'الرقم الضريبي', true);

INSERT INTO "TimeZone" ("name", "label", "utcOffset", "isActive")
VALUES ('Asia/Riyadh', 'الرياض (UTC+3)', '+03:00', true),
       ('UTC', 'UTC', '+00:00', true);

INSERT INTO "Tenant" ("id", "slug", "name", "status", "defaultLanguageCode", "updatedAt")
VALUES (1, 'netaj', 'NETAj', 'ACTIVE', 'ar', CURRENT_TIMESTAMP);

INSERT INTO "CompanyGroup" ("id", "tenantId", "code", "nameAr", "nameEn", "isActive", "updatedAt")
VALUES (1, 1, 'NETAJ-GROUP', 'مجموعة نتاج', 'NETAj Group', true, CURRENT_TIMESTAMP);

INSERT INTO "Company" ("id", "tenantId", "groupId", "code", "legalNameAr", "legalNameEn", "tradeName", "countryCode", "baseCurrencyCode", "defaultLanguageCode", "timeZoneName", "fiscalYearStartMonth", "isActive", "updatedAt")
VALUES (1, 1, 1, 'NETAJ', 'شركة نتاج', 'NETAj Company', 'نتاج', 'SA', 'SAR', 'ar', 'Asia/Riyadh', 1, true, CURRENT_TIMESTAMP);

INSERT INTO "Branch" ("id", "companyId", "code", "nameAr", "nameEn", "isMain", "isActive", "updatedAt")
VALUES (1, 1, 'MAIN', 'الفرع الرئيسي', 'Main Branch', true, true, CURRENT_TIMESTAMP);

INSERT INTO "Warehouse" ("id", "companyId", "branchId", "code", "nameAr", "nameEn", "isMain", "isActive", "updatedAt")
VALUES (1, 1, 1, 'MAIN', 'المستودع الرئيسي', 'Main Warehouse', true, true, CURRENT_TIMESTAMP);

INSERT INTO "LocalizationPack" ("id", "code", "name", "countryCode", "languageCode", "version", "configJson", "isActive", "updatedAt")
VALUES (1, 'SA-AR', 'Saudi Arabia - Arabic', 'SA', 'ar', 1, '{"vatRate":15,"rtl":true}', true, CURRENT_TIMESTAMP);

INSERT INTO "CompanyLocalization" ("companyId", "localizationPackId", "isPrimary", "settingsJson")
VALUES (1, 1, true, '{}');

INSERT INTO "ModuleDefinition" ("key", "nameAr", "nameEn", "isCore") VALUES
('CORE', 'النظام الأساسي', 'Core', true),
('SALES', 'المبيعات', 'Sales', false),
('PURCHASES', 'المشتريات', 'Purchases', false),
('INVENTORY', 'المخزون', 'Inventory', false),
('NOTES', 'السندات', 'Notes', false),
('TRANSPORT', 'النقل', 'Transport', false),
('ACCOUNTING', 'المحاسبة', 'Accounting', false),
('FACTORY', 'المصنع', 'Factory', false),
('HR', 'الموارد البشرية', 'Human Resources', false),
('EXTERNAL', 'العمليات الخارجية', 'External Operations', false),
('PROJECTS', 'المشاريع والمقاولات', 'Projects & Contracting', false),
('CRM', 'إدارة علاقات العملاء', 'CRM', false),
('ASSETS', 'الأصول والصيانة', 'Assets & Maintenance', false);

INSERT INTO "CompanyModule" ("companyId", "moduleKey", "enabled", "settingsJson", "updatedAt")
SELECT 1, "key", CASE WHEN "key" IN ('CORE','SALES','PURCHASES','INVENTORY','NOTES','TRANSPORT','ACCOUNTING','FACTORY','HR','EXTERNAL') THEN true ELSE false END, '{}', CURRENT_TIMESTAMP
FROM "ModuleDefinition";

INSERT INTO "SubscriptionPlan" ("id", "code", "name", "status", "userLimit", "companyLimit", "storageMb", "updatedAt")
VALUES (1, 'LEGACY', 'NETAj Legacy', 'ACTIVE', NULL, NULL, NULL, CURRENT_TIMESTAMP);

INSERT INTO "PlanModule" ("planId", "moduleKey", "enabled")
SELECT 1, "key", true FROM "ModuleDefinition" WHERE "key" IN ('CORE','SALES','PURCHASES','INVENTORY','NOTES','TRANSPORT','ACCOUNTING','FACTORY','HR','EXTERNAL');

INSERT INTO "TenantSubscription" ("tenantId", "planId", "status", "startsAt", "updatedAt")
VALUES (1, 1, 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CostCenter" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCenter_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_CostCenter" ("code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt") SELECT "code", "createdAt", "id", "isActive", "nameAr", "nameEn", "updatedAt" FROM "CostCenter";
DROP TABLE "CostCenter";
ALTER TABLE "new_CostCenter" RENAME TO "CostCenter";
CREATE UNIQUE INDEX "CostCenter_code_key" ON "CostCenter"("code");
CREATE INDEX "CostCenter_companyId_idx" ON "CostCenter"("companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "CompanyGroup_tenantId_idx" ON "CompanyGroup"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroup_tenantId_code_key" ON "CompanyGroup"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Company_tenantId_idx" ON "Company"("tenantId");

-- CreateIndex
CREATE INDEX "Company_groupId_idx" ON "Company"("groupId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_tenantId_code_key" ON "Company"("tenantId", "code");

-- CreateIndex
CREATE INDEX "Branch_companyId_idx" ON "Branch"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_companyId_code_key" ON "Branch"("companyId", "code");

-- CreateIndex
CREATE INDEX "Warehouse_companyId_idx" ON "Warehouse"("companyId");

-- CreateIndex
CREATE INDEX "Warehouse_branchId_idx" ON "Warehouse"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "Warehouse_companyId_code_key" ON "Warehouse"("companyId", "code");

-- CreateIndex
CREATE INDEX "Department_companyId_idx" ON "Department"("companyId");

-- CreateIndex
CREATE INDEX "Department_parentId_idx" ON "Department"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_companyId_code_key" ON "Department"("companyId", "code");

-- CreateIndex
CREATE INDEX "FiscalYear_companyId_status_idx" ON "FiscalYear"("companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalYear_companyId_startDate_endDate_key" ON "FiscalYear"("companyId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "FiscalPeriod_startDate_endDate_idx" ON "FiscalPeriod"("startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "FiscalPeriod_fiscalYearId_periodNumber_key" ON "FiscalPeriod"("fiscalYearId", "periodNumber");

-- CreateIndex
CREATE INDEX "ExchangeRate_companyId_rateDate_idx" ON "ExchangeRate"("companyId", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_companyId_baseCurrencyCode_quoteCurrencyCode_rateDate_key" ON "ExchangeRate"("companyId", "baseCurrencyCode", "quoteCurrencyCode", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "LocalizationPack_code_key" ON "LocalizationPack"("code");

-- CreateIndex
CREATE INDEX "LocalizationPack_countryCode_languageCode_idx" ON "LocalizationPack"("countryCode", "languageCode");

-- CreateIndex
CREATE INDEX "CompanyLocalization_companyId_idx" ON "CompanyLocalization"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyLocalization_companyId_localizationPackId_key" ON "CompanyLocalization"("companyId", "localizationPackId");

-- CreateIndex
CREATE INDEX "CompanyModule_companyId_idx" ON "CompanyModule"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyModule_companyId_moduleKey_key" ON "CompanyModule"("companyId", "moduleKey");

-- CreateIndex
CREATE INDEX "CompanyEntitlement_companyId_idx" ON "CompanyEntitlement"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyEntitlement_companyId_entitlementKey_key" ON "CompanyEntitlement"("companyId", "entitlementKey");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PlanModule_planId_moduleKey_key" ON "PlanModule"("planId", "moduleKey");

-- CreateIndex
CREATE INDEX "TenantSubscription_tenantId_status_idx" ON "TenantSubscription"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUser_email_key" ON "PlatformUser"("email");

-- CreateIndex
CREATE INDEX "TenantMembership_userId_idx" ON "TenantMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TenantMembership_tenantId_userId_key" ON "TenantMembership"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "Role_tenantId_idx" ON "Role"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_tenantId_companyId_code_key" ON "Role"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "Permission_moduleKey_idx" ON "Permission"("moduleKey");
