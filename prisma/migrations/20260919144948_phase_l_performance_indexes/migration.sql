-- CreateIndex
CREATE INDEX "BusinessDocument_tenantId_companyId_documentDate_documentType_status_idx" ON "BusinessDocument"("tenantId", "companyId", "documentDate", "documentType", "status");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_companyId_purchaseDate_status_idx" ON "Purchase"("tenantId", "companyId", "purchaseDate", "status");

-- CreateIndex
CREATE INDEX "Purchase_tenantId_companyId_partyId_dueDate_idx" ON "Purchase"("tenantId", "companyId", "partyId", "dueDate");

-- CreateIndex
CREATE INDEX "Sale_tenantId_companyId_invoiceDate_status_idx" ON "Sale"("tenantId", "companyId", "invoiceDate", "status");

-- CreateIndex
CREATE INDEX "Sale_tenantId_companyId_partyId_dueDate_idx" ON "Sale"("tenantId", "companyId", "partyId", "dueDate");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_companyId_movementDate_itemId_ownershipType_idx" ON "StockMovement"("tenantId", "companyId", "movementDate", "itemId", "ownershipType");
