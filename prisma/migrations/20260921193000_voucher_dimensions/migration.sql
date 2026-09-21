ALTER TABLE "FinancialVoucher" ADD COLUMN "beneficiaryType" TEXT NOT NULL DEFAULT 'PARTY';
ALTER TABLE "FinancialVoucher" ADD COLUMN "beneficiaryName" TEXT;
ALTER TABLE "FinancialVoucher" ADD COLUMN "counterAccountId" INTEGER;
ALTER TABLE "FinancialVoucher" ADD COLUMN "branchId" INTEGER;
ALTER TABLE "FinancialVoucher" ADD COLUMN "costCenterId" INTEGER;
