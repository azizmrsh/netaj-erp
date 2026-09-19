-- Phase K is part of the NETAj first implementation. Existing rows for CRM
-- and Assets predated this phase and may be disabled; enable only the preserved
-- default NETAj company without changing module choices for other companies.
UPDATE "CompanyModule"
SET "enabled" = true, "updatedAt" = CURRENT_TIMESTAMP
WHERE "companyId" = 1
  AND "moduleKey" IN ('CRM','ASSETS','DMS','APPROVALS','PORTAL','TREASURY','INTEGRATIONS');
