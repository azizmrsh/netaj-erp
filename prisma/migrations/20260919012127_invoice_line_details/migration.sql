-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN "description" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "materialGrade" TEXT;
ALTER TABLE "PurchaseItem" ADD COLUMN "specifications" TEXT;

-- AlterTable
ALTER TABLE "SaleItem" ADD COLUMN "description" TEXT;
ALTER TABLE "SaleItem" ADD COLUMN "materialGrade" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "receiptNoteId" INTEGER,
    "dueDate" DATETIME,
    "paymentMethod" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "supplierInvoiceNumber" TEXT,
    "referenceNumber" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Purchase_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Purchase_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_receiptNoteId_fkey" FOREIGN KEY ("receiptNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("createdAt", "discount", "dueDate", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "totalAmount", "updatedAt", "vatAmount") SELECT "createdAt", "discount", "dueDate", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "totalAmount", "updatedAt", "vatAmount" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");
CREATE UNIQUE INDEX "Purchase_receiptNoteId_key" ON "Purchase"("receiptNoteId");
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
CREATE INDEX "Purchase_partyId_idx" ON "Purchase"("partyId");
CREATE INDEX "Purchase_sourceOrderId_idx" ON "Purchase"("sourceOrderId");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "deliveryNoteId" INTEGER,
    "referenceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "paymentMethod" TEXT,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Sale_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Sale_sourceOrderId_fkey" FOREIGN KEY ("sourceOrderId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("createdAt", "deliveryNoteId", "discount", "dueDate", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "sourceOrderId", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount") SELECT "createdAt", "deliveryNoteId", "discount", "dueDate", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "referenceNumber", "sourceOrderId", "status", "subtotal", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_deliveryNoteId_key" ON "Sale"("deliveryNoteId");
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");
CREATE INDEX "Sale_partyId_idx" ON "Sale"("partyId");
CREATE INDEX "Sale_sourceOrderId_idx" ON "Sale"("sourceOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
