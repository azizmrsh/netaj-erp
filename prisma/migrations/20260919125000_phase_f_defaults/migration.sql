-- Enable the Projects module for the preserved NETAj company and legacy plan.
UPDATE "CompanyModule" SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "companyId" = 1 AND "moduleKey" = 'PROJECTS';

INSERT OR IGNORE INTO "PlanModule" ("planId", "moduleKey", "enabled")
VALUES (1, 'PROJECTS', true);

-- Standard job-cost codes. Existing operational data is not changed.
INSERT OR IGNORE INTO "CostCode" ("tenantId", "companyId", "code", "nameAr", "nameEn", "category", "isActive", "createdAt", "updatedAt") VALUES
(1, 1, 'MAT', 'مواد', 'Materials', 'MATERIALS', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'LAB', 'عمالة', 'Labor', 'LABOR', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'EQP', 'معدات', 'Equipment', 'EQUIPMENT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'TRN', 'نقل', 'Transport', 'TRANSPORT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'SUB', 'مقاول باطن', 'Subcontract', 'SUBCONTRACT', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'ADM', 'إدارية', 'Administration', 'ADMIN', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'MNT', 'صيانة', 'Maintenance', 'MAINTENANCE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'FUEL', 'وقود', 'Fuel', 'FUEL', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
(1, 1, 'OTH', 'أخرى', 'Other', 'OTHER', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
