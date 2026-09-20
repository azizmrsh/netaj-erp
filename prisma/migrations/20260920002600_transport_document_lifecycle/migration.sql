ALTER TABLE "TruckDocument" ADD COLUMN "issuer" TEXT;
ALTER TABLE "TruckDocument" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "TruckDocument" ADD COLUMN "previousDocumentId" INTEGER;
ALTER TABLE "TruckDocument" ADD COLUMN "renewedAt" DATETIME;
ALTER TABLE "TruckDocument" ADD COLUMN "renewedBy" TEXT;
ALTER TABLE "TruckDocument" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "TruckDocument" ADD COLUMN "archivedBy" TEXT;

ALTER TABLE "DriverDocument" ADD COLUMN "issuer" TEXT;
ALTER TABLE "DriverDocument" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "DriverDocument" ADD COLUMN "previousDocumentId" INTEGER;
ALTER TABLE "DriverDocument" ADD COLUMN "renewedAt" DATETIME;
ALTER TABLE "DriverDocument" ADD COLUMN "renewedBy" TEXT;
ALTER TABLE "DriverDocument" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "DriverDocument" ADD COLUMN "archivedBy" TEXT;
