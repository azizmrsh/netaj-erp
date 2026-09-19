-- CreateTable
CREATE TABLE "CustomFieldDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "labelAr" TEXT NOT NULL,
    "labelEn" TEXT,
    "fieldType" TEXT NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "optionsJson" TEXT NOT NULL DEFAULT '[]',
    "defaultValue" TEXT,
    "validationJson" TEXT NOT NULL DEFAULT '{}',
    "conditionJson" TEXT NOT NULL DEFAULT '{}',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomFieldDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomFieldValue" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "fieldId" INTEGER NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "valueJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomFieldValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CustomFieldValue_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "CustomFieldDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyConfiguration" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "category" TEXT NOT NULL,
    "configKey" TEXT NOT NULL,
    "labelAr" TEXT,
    "labelEn" TEXT,
    "valueType" TEXT NOT NULL DEFAULT 'JSON',
    "valueJson" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyConfiguration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApprovalRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "conditionJson" TEXT NOT NULL DEFAULT '{}',
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApprovalRule_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CustomReportDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "fieldsJson" TEXT NOT NULL,
    "filtersJson" TEXT NOT NULL DEFAULT '[]',
    "groupByJson" TEXT NOT NULL DEFAULT '[]',
    "sortJson" TEXT NOT NULL DEFAULT '[]',
    "calculationsJson" TEXT NOT NULL DEFAULT '[]',
    "visibility" TEXT NOT NULL DEFAULT 'PRIVATE',
    "ownerUserId" INTEGER,
    "roleCodesJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CustomReportDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IndustryTemplateDefinition" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompanyIndustryProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL,
    "templateCode" TEXT NOT NULL,
    "overridesJson" TEXT NOT NULL DEFAULT '{}',
    "appliedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyIndustryProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CompanyIndustryProfile_templateCode_fkey" FOREIGN KEY ("templateCode") REFERENCES "IndustryTemplateDefinition" ("code") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CustomFieldDefinition_tenantId_companyId_entityType_isActive_idx" ON "CustomFieldDefinition"("tenantId", "companyId", "entityType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldDefinition_tenantId_companyId_entityType_fieldKey_key" ON "CustomFieldDefinition"("tenantId", "companyId", "entityType", "fieldKey");

-- CreateIndex
CREATE INDEX "CustomFieldValue_tenantId_companyId_entityType_entityId_idx" ON "CustomFieldValue"("tenantId", "companyId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomFieldValue_fieldId_entityType_entityId_key" ON "CustomFieldValue"("fieldId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CompanyConfiguration_tenantId_companyId_category_isActive_idx" ON "CompanyConfiguration"("tenantId", "companyId", "category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyConfiguration_tenantId_companyId_category_configKey_key" ON "CompanyConfiguration"("tenantId", "companyId", "category", "configKey");

-- CreateIndex
CREATE INDEX "ApprovalRule_tenantId_companyId_entityType_isActive_idx" ON "ApprovalRule"("tenantId", "companyId", "entityType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ApprovalRule_tenantId_companyId_code_key" ON "ApprovalRule"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "CustomReportDefinition_tenantId_companyId_sourceType_isActive_idx" ON "CustomReportDefinition"("tenantId", "companyId", "sourceType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomReportDefinition_tenantId_companyId_code_key" ON "CustomReportDefinition"("tenantId", "companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyIndustryProfile_companyId_key" ON "CompanyIndustryProfile"("companyId");

-- CreateIndex
CREATE INDEX "CompanyIndustryProfile_tenantId_companyId_idx" ON "CompanyIndustryProfile"("tenantId", "companyId");

INSERT OR IGNORE INTO "ModuleDefinition" ("key", "nameAr", "nameEn", "description", "isCore", "createdAt")
VALUES ('CONFIG', 'التخصيص بدون كود', 'No-code Configuration', 'Company fields, workflows and custom reports', false, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "CompanyModule" ("companyId", "moduleKey", "enabled", "settingsJson", "updatedAt")
SELECT "id", 'CONFIG', true, '{}', CURRENT_TIMESTAMP FROM "Company";
INSERT OR IGNORE INTO "PlanModule" ("planId", "moduleKey", "enabled") SELECT "id", 'CONFIG', true FROM "SubscriptionPlan";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description", "createdAt") VALUES
('CONFIG.READ','CONFIG','READ','View company configuration',CURRENT_TIMESTAMP),
('CONFIG.CREATE','CONFIG','CREATE','Create configuration and reports',CURRENT_TIMESTAMP),
('CONFIG.UPDATE','CONFIG','UPDATE','Update company configuration',CURRENT_TIMESTAMP),
('CONFIG.MANAGE','CONFIG','MANAGE','Manage no-code platform configuration',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionKey", "granted")
SELECT r."id", p."key", true FROM "Role" r CROSS JOIN "Permission" p WHERE r."code" IN ('ADMIN','OWNER') AND p."moduleKey"='CONFIG';

INSERT OR IGNORE INTO "IndustryTemplateDefinition" ("code","nameAr","nameEn","configJson","isActive","createdAt","updatedAt") VALUES
('NETAJ','نتاج','NETAj','{"modules":["CORE","SALES","PURCHASES","INVENTORY","NOTES","TRANSPORT","ACCOUNTING","FACTORY","HR","EXTERNAL","PROJECTS","IMPORT","CONFIG"]}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('TRADING','تجارة','Trading','{"modules":["CORE","SALES","PURCHASES","INVENTORY","ACCOUNTING","IMPORT","CONFIG"]}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('TRANSPORT','نقل','Transport','{"modules":["CORE","SALES","PURCHASES","TRANSPORT","ACCOUNTING","HR","IMPORT","CONFIG"]}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('CONTRACTING','مقاولات','Contracting','{"modules":["CORE","SALES","PURCHASES","INVENTORY","ACCOUNTING","PROJECTS","HR","IMPORT","CONFIG"]}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
('FACTORY','مصنع','Factory','{"modules":["CORE","SALES","PURCHASES","INVENTORY","NOTES","FACTORY","ACCOUNTING","HR","IMPORT","CONFIG"]}',true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "CompanyIndustryProfile" ("tenantId","companyId","templateCode","overridesJson","appliedAt","updatedAt")
SELECT "tenantId","id",CASE WHEN "code"='NETAJ' THEN 'NETAJ' ELSE 'TRADING' END,'{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "Company";
