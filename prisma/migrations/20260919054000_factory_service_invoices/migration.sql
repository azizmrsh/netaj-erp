ALTER TABLE "Sale" ADD COLUMN "factoryTransactionId" INTEGER REFERENCES "FactoryTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Sale_factoryTransactionId_key" ON "Sale"("factoryTransactionId");
