-- CreateTable
CREATE TABLE "CrmLead" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "leadNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "salespersonUserId" INTEGER,
    "partyId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmOpportunity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "opportunityNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "leadId" INTEGER,
    "partyId" INTEGER,
    "salespersonUserId" INTEGER,
    "stage" TEXT NOT NULL DEFAULT 'QUALIFICATION',
    "probability" INTEGER NOT NULL DEFAULT 10,
    "expectedValue" DECIMAL NOT NULL DEFAULT 0,
    "expectedCloseDate" DATETIME,
    "businessDocumentId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "lostReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmOpportunity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmOpportunity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmActivity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "activityType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "leadId" INTEGER,
    "opportunityId" INTEGER,
    "partyId" INTEGER,
    "assignedUserId" INTEGER,
    "dueAt" DATETIME,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "outcome" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CrmActivity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "CrmActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmActivity_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "CrmOpportunity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "usefulLifeMonths" INTEGER NOT NULL,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "assetAccountId" INTEGER,
    "accumulatedDepreciationAccountId" INTEGER,
    "depreciationExpenseAccountId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "assetNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "acquisitionDate" DATETIME NOT NULL,
    "acquisitionCost" DECIMAL NOT NULL,
    "residualValue" DECIMAL NOT NULL DEFAULT 0,
    "accumulatedDepreciation" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "location" TEXT,
    "serialNumber" TEXT,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "journalEntryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Asset_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "AssetCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetDepreciation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "assetId" INTEGER NOT NULL,
    "periodDate" DATETIME NOT NULL,
    "amount" DECIMAL NOT NULL,
    "accumulatedAfter" DECIMAL NOT NULL,
    "bookValueAfter" DECIMAL NOT NULL,
    "journalEntryId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "assetId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "intervalDays" INTEGER NOT NULL,
    "lastPerformedAt" DATETIME,
    "nextDueAt" DATETIME NOT NULL,
    "checklistJson" TEXT NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MaintenancePlan_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceWorkOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "workOrderNumber" TEXT NOT NULL,
    "assetId" INTEGER NOT NULL,
    "planId" INTEGER,
    "workType" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "reportedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scheduledAt" DATETIME,
    "completedAt" DATETIME,
    "description" TEXT NOT NULL,
    "resolution" TEXT,
    "laborCost" DECIMAL NOT NULL DEFAULT 0,
    "externalCost" DECIMAL NOT NULL DEFAULT 0,
    "expenseId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MaintenanceWorkOrder_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceWorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "MaintenanceWorkOrder_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MaintenancePlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MaintenanceSparePart" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "workOrderId" INTEGER NOT NULL,
    "itemId" INTEGER NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "stockMovementId" INTEGER,
    CONSTRAINT "MaintenanceSparePart_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DocumentCategory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultRetentionDays" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "DocumentCategory_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagedDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "documentNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "ownerType" TEXT,
    "ownerId" INTEGER,
    "effectiveDate" DATETIME,
    "expiryDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "confidentiality" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ManagedDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ManagedDocument_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagedDocumentVersion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "documentId" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "attachmentId" INTEGER NOT NULL,
    "changeNotes" TEXT,
    "uploadedBy" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ManagedDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ManagedDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ManagedDocumentPermission" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "documentId" INTEGER NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "canRead" BOOLEAN NOT NULL DEFAULT true,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ManagedDocumentPermission_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "ManagedDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnifiedApprovalRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "requestNumber" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "entityNumber" TEXT,
    "title" TEXT NOT NULL,
    "requestedBy" INTEGER,
    "currentStep" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL,
    "dueAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UnifiedApprovalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UnifiedApprovalAction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "requestId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "comment" TEXT,
    "actorUserId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnifiedApprovalAction_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "UnifiedApprovalRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalIdentity" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "partyId" INTEGER NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "status" TEXT NOT NULL DEFAULT 'INVITED',
    "permissionsJson" TEXT NOT NULL DEFAULT '[]',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalIdentity_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PortalRequest" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "portalIdentityId" INTEGER NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "requestType" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PortalRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PortalRequest_portalIdentityId_fkey" FOREIGN KEY ("portalIdentityId") REFERENCES "PortalIdentity" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TreasuryForecastAdjustment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "forecastDate" DATETIME NOT NULL,
    "direction" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "probability" INTEGER NOT NULL DEFAULT 100,
    "sourceType" TEXT,
    "sourceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TreasuryForecastAdjustment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "providerType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISABLED',
    "baseUrl" TEXT,
    "encryptedCredentials" TEXT,
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "lastSuccessAt" DATETIME,
    "lastErrorAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IntegrationConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookEndpoint" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "eventTypesJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookEndpoint_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "endpointId" INTEGER,
    "connectionId" INTEGER,
    "eventType" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" DATETIME,
    "responseStatus" INTEGER,
    "responseBody" TEXT,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WebhookDelivery_endpointId_fkey" FOREIGN KEY ("endpointId") REFERENCES "WebhookEndpoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "WebhookDelivery_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "IntegrationConnection" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_companyId_status_idx" ON "CrmLead"("tenantId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLead_tenantId_companyId_leadNumber_key" ON "CrmLead"("tenantId", "companyId", "leadNumber");

-- CreateIndex
CREATE INDEX "CrmOpportunity_tenantId_companyId_stage_status_idx" ON "CrmOpportunity"("tenantId", "companyId", "stage", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CrmOpportunity_tenantId_companyId_opportunityNumber_key" ON "CrmOpportunity"("tenantId", "companyId", "opportunityNumber");

-- CreateIndex
CREATE INDEX "CrmActivity_tenantId_companyId_status_dueAt_idx" ON "CrmActivity"("tenantId", "companyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCategory_tenantId_companyId_code_key" ON "AssetCategory"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "Asset_tenantId_companyId_status_idx" ON "Asset"("tenantId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_tenantId_companyId_assetNumber_key" ON "Asset"("tenantId", "companyId", "assetNumber");

-- CreateIndex
CREATE INDEX "AssetDepreciation_tenantId_companyId_idx" ON "AssetDepreciation"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetDepreciation_assetId_periodDate_key" ON "AssetDepreciation"("assetId", "periodDate");

-- CreateIndex
CREATE INDEX "MaintenancePlan_tenantId_companyId_nextDueAt_idx" ON "MaintenancePlan"("tenantId", "companyId", "nextDueAt");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_tenantId_companyId_status_idx" ON "MaintenanceWorkOrder"("tenantId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceWorkOrder_tenantId_companyId_workOrderNumber_key" ON "MaintenanceWorkOrder"("tenantId", "companyId", "workOrderNumber");

-- CreateIndex
CREATE INDEX "MaintenanceSparePart_tenantId_companyId_idx" ON "MaintenanceSparePart"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentCategory_tenantId_companyId_code_key" ON "DocumentCategory"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "ManagedDocument_tenantId_companyId_expiryDate_status_idx" ON "ManagedDocument"("tenantId", "companyId", "expiryDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedDocument_tenantId_companyId_documentNumber_key" ON "ManagedDocument"("tenantId", "companyId", "documentNumber");

-- CreateIndex
CREATE INDEX "ManagedDocumentVersion_tenantId_companyId_idx" ON "ManagedDocumentVersion"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedDocumentVersion_documentId_version_key" ON "ManagedDocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "ManagedDocumentPermission_tenantId_companyId_idx" ON "ManagedDocumentPermission"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ManagedDocumentPermission_documentId_subjectType_subjectId_key" ON "ManagedDocumentPermission"("documentId", "subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "UnifiedApprovalRequest_tenantId_companyId_status_dueAt_idx" ON "UnifiedApprovalRequest"("tenantId", "companyId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedApprovalRequest_tenantId_companyId_moduleKey_entityType_entityId_key" ON "UnifiedApprovalRequest"("tenantId", "companyId", "moduleKey", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "UnifiedApprovalRequest_tenantId_companyId_requestNumber_key" ON "UnifiedApprovalRequest"("tenantId", "companyId", "requestNumber");

-- CreateIndex
CREATE INDEX "UnifiedApprovalAction_tenantId_companyId_requestId_idx" ON "UnifiedApprovalAction"("tenantId", "companyId", "requestId");

-- CreateIndex
CREATE INDEX "PortalIdentity_tenantId_companyId_partyId_idx" ON "PortalIdentity"("tenantId", "companyId", "partyId");

-- CreateIndex
CREATE UNIQUE INDEX "PortalIdentity_tenantId_companyId_email_key" ON "PortalIdentity"("tenantId", "companyId", "email");

-- CreateIndex
CREATE INDEX "PortalRequest_tenantId_companyId_status_idx" ON "PortalRequest"("tenantId", "companyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PortalRequest_tenantId_companyId_requestNumber_key" ON "PortalRequest"("tenantId", "companyId", "requestNumber");

-- CreateIndex
CREATE INDEX "TreasuryForecastAdjustment_tenantId_companyId_forecastDate_idx" ON "TreasuryForecastAdjustment"("tenantId", "companyId", "forecastDate");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_tenantId_companyId_code_key" ON "IntegrationConnection"("tenantId", "companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookEndpoint_tenantId_companyId_code_key" ON "WebhookEndpoint"("tenantId", "companyId", "code");

-- CreateIndex
CREATE INDEX "WebhookDelivery_tenantId_companyId_status_nextAttemptAt_idx" ON "WebhookDelivery"("tenantId", "companyId", "status", "nextAttemptAt");

INSERT OR IGNORE INTO "ModuleDefinition" ("key","nameAr","nameEn","description","isCore","createdAt") VALUES
('CRM','إدارة علاقات العملاء','CRM','Leads, opportunities and customer activities',false,CURRENT_TIMESTAMP),
('ASSETS','الأصول والصيانة','Assets & Maintenance','Assets, depreciation and maintenance work orders',false,CURRENT_TIMESTAMP),
('DMS','إدارة المستندات','Document Management','Versioned documents and expiry controls',false,CURRENT_TIMESTAMP),
('APPROVALS','صندوق الموافقات','Unified Approvals','Cross-module approval inbox',false,CURRENT_TIMESTAMP),
('PORTAL','بوابة العملاء والموردين','External Portal','Secure party-scoped portal foundations',false,CURRENT_TIMESTAMP),
('TREASURY','الخزينة والتوقع النقدي','Treasury','Cash position and cash forecasts',false,CURRENT_TIMESTAMP),
('INTEGRATIONS','مركز التكاملات','Integration Center','Versioned API, webhook and connection controls',false,CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "CompanyModule" ("companyId","moduleKey","enabled","settingsJson","updatedAt") SELECT c."id",m."key",true,'{}',CURRENT_TIMESTAMP FROM "Company" c CROSS JOIN "ModuleDefinition" m WHERE m."key" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "PlanModule" ("planId","moduleKey","enabled") SELECT p."id",m."key",true FROM "SubscriptionPlan" p CROSS JOIN "ModuleDefinition" m WHERE p."code" IN ('LEGACY','ENTERPRISE') AND m."key" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "PlanModule" ("planId","moduleKey","enabled") SELECT p."id",m."key",true FROM "SubscriptionPlan" p CROSS JOIN "ModuleDefinition" m WHERE p."code"='BUSINESS' AND m."key" IN ('CRM','ASSETS','DMS','APPROVALS','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "Permission" ("key","moduleKey","action","description","createdAt") SELECT m."key"||'.READ',m."key",'READ','Read module',CURRENT_TIMESTAMP FROM "ModuleDefinition" m WHERE m."key" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "Permission" ("key","moduleKey","action","description","createdAt") SELECT m."key"||'.CREATE',m."key",'CREATE','Create records',CURRENT_TIMESTAMP FROM "ModuleDefinition" m WHERE m."key" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "Permission" ("key","moduleKey","action","description","createdAt") SELECT m."key"||'.UPDATE',m."key",'UPDATE','Update records',CURRENT_TIMESTAMP FROM "ModuleDefinition" m WHERE m."key" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "Permission" ("key","moduleKey","action","description","createdAt") SELECT m."key"||'.MANAGE',m."key",'MANAGE','Manage module configuration',CURRENT_TIMESTAMP FROM "ModuleDefinition" m WHERE m."key" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
INSERT OR IGNORE INTO "Permission" ("key","moduleKey","action","description","createdAt") VALUES ('APPROVALS.APPROVE','APPROVALS','APPROVE','Approve or reject requests',CURRENT_TIMESTAMP);
INSERT OR IGNORE INTO "RolePermission" ("roleId","permissionKey","granted") SELECT r."id",p."key",true FROM "Role" r CROSS JOIN "Permission" p WHERE r."code" IN ('ADMIN','OWNER') AND p."moduleKey" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_tenantId_companyId_eventId_endpointId_key" ON "WebhookDelivery"("tenantId", "companyId", "eventId", "endpointId");
