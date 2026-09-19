-- CreateTable
CREATE TABLE "DocumentTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'AR',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentTemplate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentTemplateVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "templateId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "designJson" TEXT NOT NULL,
    "changeNotes" TEXT,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME,
    CONSTRAINT "DocumentTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "DocumentTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IssuedDocumentPresentation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "issueDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "templateVersionId" INTEGER NOT NULL,
    "dataSnapshotJson" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IssuedDocumentPresentation_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "IssuedDocumentPresentation_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CompanyThemeProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL,
    "themePreset" TEXT NOT NULL DEFAULT 'CORPORATE',
    "mode" TEXT NOT NULL DEFAULT 'LIGHT',
    "logoUrl" TEXT,
    "loginLogoUrl" TEXT,
    "primaryColor" TEXT NOT NULL DEFAULT '#1d4ed8',
    "secondaryColor" TEXT NOT NULL DEFAULT '#0f172a',
    "accentColor" TEXT NOT NULL DEFAULT '#059669',
    "fontArabic" TEXT NOT NULL DEFAULT 'Arial',
    "fontEnglish" TEXT NOT NULL DEFAULT 'Arial',
    "sidebarStyle" TEXT NOT NULL DEFAULT 'SOLID',
    "cardStyle" TEXT NOT NULL DEFAULT 'ROUNDED',
    "tableStyle" TEXT NOT NULL DEFAULT 'STRIPED',
    "menuOrderJson" TEXT NOT NULL DEFAULT '[]',
    "dashboardStyleJson" TEXT NOT NULL DEFAULT '{}',
    "loginBrandingJson" TEXT NOT NULL DEFAULT '{}',
    "updatedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompanyThemeProfile_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardDefinition" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roleCodesJson" TEXT NOT NULL DEFAULT '[]',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "dashboardId" INTEGER NOT NULL,
    "widgetType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dataSource" TEXT NOT NULL,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "position" INTEGER NOT NULL DEFAULT 0,
    "width" INTEGER NOT NULL DEFAULT 1,
    "height" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DashboardWidget_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DashboardWidget_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "DashboardDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DocumentTemplate_tenantId_companyId_documentType_isActive_idx" ON "DocumentTemplate"("tenantId", "companyId", "documentType", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplate_tenantId_companyId_code_key" ON "DocumentTemplate"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "DocumentTemplateVersion_templateId_status_idx" ON "DocumentTemplateVersion"("templateId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTemplateVersion_templateId_version_key" ON "DocumentTemplateVersion"("templateId", "version");

-- CreateIndex
CREATE INDEX "IssuedDocumentPresentation_tenantId_companyId_documentNumber_idx" ON "IssuedDocumentPresentation"("tenantId", "companyId", "documentNumber");

-- CreateIndex
CREATE UNIQUE INDEX "IssuedDocumentPresentation_tenantId_companyId_entityType_entityId_key" ON "IssuedDocumentPresentation"("tenantId", "companyId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyThemeProfile_companyId_key" ON "CompanyThemeProfile"("companyId");

-- CreateIndex
CREATE INDEX "CompanyThemeProfile_tenantId_companyId_idx" ON "CompanyThemeProfile"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "DashboardDefinition_tenantId_companyId_isActive_idx" ON "DashboardDefinition"("tenantId", "companyId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardDefinition_tenantId_companyId_code_key" ON "DashboardDefinition"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "DashboardWidget_tenantId_companyId_dashboardId_position_idx" ON "DashboardWidget"("tenantId", "companyId", "dashboardId", "position");

INSERT OR IGNORE INTO "ModuleDefinition" ("key", "nameAr", "nameEn", "description", "isCore", "createdAt")
VALUES ('DESIGN', 'مصمم المستندات والواجهات', 'Document and UI Designer', 'Versioned documents, white-label themes and configurable dashboards', false, CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "CompanyModule" ("companyId", "moduleKey", "enabled", "settingsJson", "updatedAt")
SELECT "id", 'DESIGN', true, '{}', CURRENT_TIMESTAMP FROM "Company";
INSERT OR IGNORE INTO "PlanModule" ("planId", "moduleKey", "enabled") SELECT "id", 'DESIGN', true FROM "SubscriptionPlan";
INSERT OR IGNORE INTO "Permission" ("key", "moduleKey", "action", "description", "createdAt") VALUES
('DESIGN.READ','DESIGN','READ','View themes, dashboards and document templates',CURRENT_TIMESTAMP),
('DESIGN.CREATE','DESIGN','CREATE','Create document templates and dashboards',CURRENT_TIMESTAMP),
('DESIGN.UPDATE','DESIGN','UPDATE','Update draft designs and company theme',CURRENT_TIMESTAMP),
('DESIGN.PUBLISH','DESIGN','PUBLISH','Publish immutable document template versions',CURRENT_TIMESTAMP),
('DESIGN.MANAGE','DESIGN','MANAGE','Manage company presentation and white label settings',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "RolePermission" ("roleId", "permissionKey", "granted")
SELECT r."id", p."key", true FROM "Role" r CROSS JOIN "Permission" p WHERE r."code" IN ('ADMIN','OWNER') AND p."moduleKey"='DESIGN';

INSERT OR IGNORE INTO "CompanyThemeProfile" ("tenantId","companyId","themePreset","mode","primaryColor","secondaryColor","accentColor","fontArabic","fontEnglish","sidebarStyle","cardStyle","tableStyle","menuOrderJson","dashboardStyleJson","loginBrandingJson","createdAt","updatedAt")
SELECT "tenantId","id",'CORPORATE','LIGHT','#1d4ed8','#0f172a','#059669','Arial','Arial','SOLID','ROUNDED','STRIPED','[]','{}','{}',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "Company";

WITH types(code, name, documentType) AS (VALUES
('DEFAULT_INVOICE','فاتورة','INVOICE'),('DEFAULT_QUOTATION','عرض سعر','QUOTATION'),('DEFAULT_PROFORMA','فاتورة أولية','PROFORMA_INVOICE'),
('DEFAULT_SALES_ORDER','أمر بيع','SALES_ORDER'),('DEFAULT_PURCHASE_ORDER','أمر شراء','PURCHASE_ORDER'),('DEFAULT_RECEIPT_NOTE','سند استلام','RECEIPT_NOTE'),
('DEFAULT_DELIVERY_NOTE','سند تسليم','DELIVERY_NOTE'),('DEFAULT_RECEIPT_VOUCHER','سند قبض','RECEIPT_VOUCHER'),('DEFAULT_PAYMENT_VOUCHER','سند صرف','PAYMENT_VOUCHER'),
('DEFAULT_PROGRESS_CERTIFICATE','مستخلص مشروع','PROGRESS_CERTIFICATE'),('DEFAULT_ACCOUNT_STATEMENT','كشف حساب','ACCOUNT_STATEMENT'),
('DEFAULT_FINANCIAL_REPORT','تقرير مالي','FINANCIAL_REPORT'),('DEFAULT_PAYROLL','مستند رواتب','PAYROLL'))
INSERT OR IGNORE INTO "DocumentTemplate" ("tenantId","companyId","code","name","documentType","language","isDefault","isActive","createdAt","updatedAt")
SELECT c."tenantId",c."id",t.code,t.name,t.documentType,'BILINGUAL',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "Company" c CROSS JOIN types t;

INSERT OR IGNORE INTO "DocumentTemplateVersion" ("templateId","version","status","designJson","changeNotes","createdAt","publishedAt")
SELECT "id",1,'PUBLISHED','{"page":{"size":"A4","orientation":"portrait","widthMm":210,"heightMm":297,"marginMm":12},"language":"BILINGUAL","colors":{"primary":"#0f172a","accent":"#1d4ed8"},"fonts":{"ar":"Arial","en":"Arial"},"header":{"showLogo":true,"showCompany":true,"fields":["companyName","vatNumber","address"]},"body":{"fieldOrder":["documentNumber","date","party","reference","items","totals","notes"],"hiddenFields":[],"showCustomFields":true},"footer":{"showTerms":true,"showBank":true,"showIban":true,"showPageNumber":true},"features":{"signatures":true,"stamp":true,"qr":true,"barcode":true},"terms":""}','الإصدار الافتراضي الآمن',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "DocumentTemplate";

INSERT OR IGNORE INTO "DashboardDefinition" ("tenantId","companyId","code","name","roleCodesJson","isDefault","isActive","createdAt","updatedAt")
SELECT "tenantId","id",'EXECUTIVE','لوحة الإدارة التنفيذية','["OWNER","ADMIN"]',true,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP FROM "Company";
WITH widgets(widgetType,title,dataSource,position,width,height) AS (VALUES
('KPI','المبيعات','kpis.sales',1,1,1),('KPI','صافي الربح','kpis.netProfit',2,1,1),('KPI','السيولة','kpis.liquidity',3,1,1),
('CHART','المقارنة الشهرية','monthly',4,2,2),('ALERT','التنبيهات','alerts',5,1,2),('TABLE','نشاط العملاء','customerActivity',6,3,2))
INSERT OR IGNORE INTO "DashboardWidget" ("tenantId","companyId","dashboardId","widgetType","title","dataSource","configJson","position","width","height","isActive","createdAt","updatedAt")
SELECT d."tenantId",d."companyId",d."id",w.widgetType,w.title,w.dataSource,'{}',w.position,w.width,w.height,true,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
FROM "DashboardDefinition" d CROSS JOIN widgets w WHERE d."code"='EXECUTIVE';
