ALTER TABLE "CompanyThemeProfile" ADD COLUMN "backgroundColor" TEXT NOT NULL DEFAULT '#f8f5ee';
ALTER TABLE "CompanyThemeProfile" ADD COLUMN "sidebarColor" TEXT NOT NULL DEFAULT '#fffdf8';
ALTER TABLE "CompanyThemeProfile" ADD COLUMN "chartStyle" TEXT NOT NULL DEFAULT 'DIMENSIONAL';

-- Upgrade only the untouched legacy NETAj defaults; preserve every custom brand.
UPDATE "CompanyThemeProfile"
SET "primaryColor" = '#b78a3d',
    "secondaryColor" = '#172235',
    "accentColor" = '#d6ab56',
    "sidebarStyle" = 'SOFT',
    "cardStyle" = 'ELEVATED'
WHERE "companyId" = 1
  AND "primaryColor" = '#1d4ed8'
  AND "secondaryColor" = '#0f172a'
  AND "accentColor" = '#059669';
