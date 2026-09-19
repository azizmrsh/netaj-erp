-- CreateTable
CREATE TABLE "CostCode" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "nameEn" TEXT,
    "category" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CostCode_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Project" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "partyId" INTEGER NOT NULL,
    "billingItemId" INTEGER,
    "costCenterId" INTEGER NOT NULL,
    "projectManager" TEXT,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "contractValue" DECIMAL NOT NULL DEFAULT 0,
    "advanceAmount" DECIMAL NOT NULL DEFAULT 0,
    "retentionPercent" DECIMAL NOT NULL DEFAULT 0,
    "progressPercent" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Project_billingItemId_fkey" FOREIGN KEY ("billingItemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Project_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectContract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "contractDate" DATETIME NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "contractValue" DECIMAL NOT NULL,
    "advanceAmount" DECIMAL NOT NULL DEFAULT 0,
    "retentionPercent" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "terms" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectBoqItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "contractId" INTEGER,
    "costCodeId" INTEGER NOT NULL,
    "itemId" INTEGER,
    "boqCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL,
    "rate" DECIMAL NOT NULL,
    "value" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectBoqItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectBoqItem_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectBoqItem_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectBoqItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectCostBudget" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "costCodeId" INTEGER NOT NULL,
    "costCenterId" INTEGER NOT NULL,
    "budgetAmount" DECIMAL NOT NULL,
    "forecastAmount" DECIMAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectCostBudget_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectCostBudget_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "ProjectCostBudget_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectChangeOrder" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "contractId" INTEGER,
    "changeOrderNumber" TEXT NOT NULL,
    "changeDate" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "value" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProjectChangeOrder_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectChangeOrder_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectChangeOrderLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "changeOrderId" INTEGER NOT NULL,
    "costCodeId" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 1,
    "rate" DECIMAL NOT NULL,
    "value" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectChangeOrderLine_changeOrderId_fkey" FOREIGN KEY ("changeOrderId") REFERENCES "ProjectChangeOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectChangeOrderLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProjectProgress" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "boqItemId" INTEGER,
    "progressDate" DATETIME NOT NULL,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "percentage" DECIMAL NOT NULL DEFAULT 0,
    "value" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" INTEGER,
    CONSTRAINT "ProjectProgress_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectProgress_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "ProjectBoqItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProjectProgress_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressCertificate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "contractId" INTEGER,
    "certificateNumber" TEXT NOT NULL,
    "certificateDate" DATETIME NOT NULL,
    "previousValue" DECIMAL NOT NULL DEFAULT 0,
    "currentValue" DECIMAL NOT NULL DEFAULT 0,
    "cumulativeValue" DECIMAL NOT NULL DEFAULT 0,
    "completionPercent" DECIMAL NOT NULL DEFAULT 0,
    "retentionAmount" DECIMAL NOT NULL DEFAULT 0,
    "advanceRecoveryAmount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "netAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "saleId" INTEGER,
    "postedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ProgressCertificate_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgressCertificate_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "ProjectContract" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ProgressCertificate_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgressCertificateLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "certificateId" INTEGER NOT NULL,
    "boqItemId" INTEGER NOT NULL,
    "previousQuantity" DECIMAL NOT NULL DEFAULT 0,
    "currentQuantity" DECIMAL NOT NULL DEFAULT 0,
    "cumulativeQuantity" DECIMAL NOT NULL DEFAULT 0,
    "completionPercent" DECIMAL NOT NULL DEFAULT 0,
    "currentValue" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProgressCertificateLine_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "ProgressCertificate" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProgressCertificateLine_boqItemId_fkey" FOREIGN KEY ("boqItemId") REFERENCES "ProjectBoqItem" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorContract" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "projectId" INTEGER NOT NULL,
    "partyId" INTEGER NOT NULL,
    "costCodeId" INTEGER NOT NULL,
    "billingItemId" INTEGER,
    "contractNumber" TEXT NOT NULL,
    "contractDate" DATETIME NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "contractValue" DECIMAL NOT NULL,
    "advanceAmount" DECIMAL NOT NULL DEFAULT 0,
    "retentionPercent" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubcontractorContract_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorContract_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorContract_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorContract_billingItemId_fkey" FOREIGN KEY ("billingItemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubcontractorCertificate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "subcontractContractId" INTEGER NOT NULL,
    "certificateNumber" TEXT NOT NULL,
    "certificateDate" DATETIME NOT NULL,
    "previousValue" DECIMAL NOT NULL DEFAULT 0,
    "currentValue" DECIMAL NOT NULL,
    "cumulativeValue" DECIMAL NOT NULL,
    "retentionAmount" DECIMAL NOT NULL DEFAULT 0,
    "advanceRecoveryAmount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "netAmount" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "purchaseId" INTEGER,
    "postedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubcontractorCertificate_subcontractContractId_fkey" FOREIGN KEY ("subcontractContractId") REFERENCES "SubcontractorContract" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubcontractorCertificate_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BusinessDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "documentNumber" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "documentDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" DATETIME,
    "neededDate" DATETIME,
    "partyId" INTEGER NOT NULL,
    "sourceDocumentId" INTEGER,
    "referenceNumber" TEXT,
    "salesperson" TEXT,
    "requester" TEXT,
    "department" TEXT,
    "costCenter" TEXT,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "priority" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "bankDetails" TEXT,
    "paymentTerms" TEXT,
    "deliveryTime" TEXT,
    "deliveryPlace" TEXT,
    "deliveryTerms" TEXT,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "discount" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approvedAt" DATETIME,
    "completedAt" DATETIME,
    "cancelledAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessDocument_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocument_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "BusinessDocument" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocument_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "BusinessDocument_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BusinessDocument" ("approvedAt", "bankDetails", "cancelledAt", "companyId", "completedAt", "costCenter", "createdAt", "currency", "deliveryPlace", "deliveryTerms", "deliveryTime", "department", "direction", "discount", "documentDate", "documentNumber", "documentType", "expiryDate", "id", "neededDate", "notes", "partyId", "paymentTerms", "priority", "referenceNumber", "requester", "salesperson", "sourceDocumentId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "approvedAt", "bankDetails", "cancelledAt", "companyId", "completedAt", "costCenter", "createdAt", "currency", "deliveryPlace", "deliveryTerms", "deliveryTime", "department", "direction", "discount", "documentDate", "documentNumber", "documentType", "expiryDate", "id", "neededDate", "notes", "partyId", "paymentTerms", "priority", "referenceNumber", "requester", "salesperson", "sourceDocumentId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "BusinessDocument";
DROP TABLE "BusinessDocument";
ALTER TABLE "new_BusinessDocument" RENAME TO "BusinessDocument";
CREATE UNIQUE INDEX "BusinessDocument_documentNumber_key" ON "BusinessDocument"("documentNumber");
CREATE INDEX "BusinessDocument_documentType_documentDate_idx" ON "BusinessDocument"("documentType", "documentDate");
CREATE INDEX "BusinessDocument_partyId_idx" ON "BusinessDocument"("partyId");
CREATE INDEX "BusinessDocument_status_idx" ON "BusinessDocument"("status");
CREATE INDEX "BusinessDocument_projectId_costCodeId_idx" ON "BusinessDocument"("projectId", "costCodeId");
CREATE INDEX "BusinessDocument_tenantId_companyId_idx" ON "BusinessDocument"("tenantId", "companyId");
CREATE UNIQUE INDEX "BusinessDocument_sourceDocumentId_documentType_key" ON "BusinessDocument"("sourceDocumentId", "documentType");
CREATE TABLE "new_Expense" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "voucherNumber" TEXT NOT NULL,
    "expenseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expenseType" TEXT NOT NULL,
    "description" TEXT,
    "beneficiary" TEXT,
    "amountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "vatAmount" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalAmountBeforeVat" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "cashBankAccount" TEXT,
    "costCenter" TEXT,
    "responsibleEmployee" TEXT,
    "project" TEXT,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "categoryId" INTEGER,
    "bankAccountId" INTEGER,
    "journalEntryId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "postedAt" DATETIME,
    "cancelledAt" DATETIME,
    "referenceNumber" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "companyId", "costCenter", "createdAt", "currency", "description", "exchangeRate", "expenseDate", "expenseType", "functionalAmountBeforeVat", "functionalTotalAmount", "functionalVatAmount", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "rateDate", "referenceNumber", "responsibleEmployee", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber") SELECT "amountBeforeVat", "bankAccountId", "beneficiary", "cancelledAt", "cashBankAccount", "categoryId", "companyId", "costCenter", "createdAt", "currency", "description", "exchangeRate", "expenseDate", "expenseType", "functionalAmountBeforeVat", "functionalTotalAmount", "functionalVatAmount", "id", "journalEntryId", "notes", "paymentMethod", "postedAt", "project", "rateDate", "referenceNumber", "responsibleEmployee", "status", "tenantId", "totalAmount", "updatedAt", "vatAmount", "voucherNumber" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE UNIQUE INDEX "Expense_voucherNumber_key" ON "Expense"("voucherNumber");
CREATE UNIQUE INDEX "Expense_journalEntryId_key" ON "Expense"("journalEntryId");
CREATE INDEX "Expense_expenseDate_idx" ON "Expense"("expenseDate");
CREATE INDEX "Expense_expenseType_idx" ON "Expense"("expenseType");
CREATE INDEX "Expense_projectId_costCodeId_idx" ON "Expense"("projectId", "costCodeId");
CREATE INDEX "Expense_tenantId_companyId_idx" ON "Expense"("tenantId", "companyId");
CREATE TABLE "new_PayrollLine" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "payrollRunId" INTEGER NOT NULL,
    "employeeId" INTEGER NOT NULL,
    "basicSalary" DECIMAL NOT NULL DEFAULT 0,
    "housingAllowance" DECIMAL NOT NULL DEFAULT 0,
    "transportAllowance" DECIMAL NOT NULL DEFAULT 0,
    "otherAllowances" DECIMAL NOT NULL DEFAULT 0,
    "normalWage" DECIMAL NOT NULL DEFAULT 0,
    "overtimeHours" DECIMAL NOT NULL DEFAULT 0,
    "overtimeValue" DECIMAL NOT NULL DEFAULT 0,
    "fridayHours" DECIMAL NOT NULL DEFAULT 0,
    "fridayValue" DECIMAL NOT NULL DEFAULT 0,
    "absenceDeduction" DECIMAL NOT NULL DEFAULT 0,
    "penalties" DECIMAL NOT NULL DEFAULT 0,
    "advances" DECIMAL NOT NULL DEFAULT 0,
    "otherDeductions" DECIMAL NOT NULL DEFAULT 0,
    "grossSalary" DECIMAL NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL NOT NULL DEFAULT 0,
    "netSalary" DECIMAL NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'DUE',
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollLine_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "PayrollLine_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PayrollLine" ("absenceDeduction", "advances", "basicSalary", "companyId", "createdAt", "employeeId", "fridayHours", "fridayValue", "grossSalary", "housingAllowance", "id", "netSalary", "normalWage", "otherAllowances", "otherDeductions", "overtimeHours", "overtimeValue", "paidAmount", "paymentStatus", "payrollRunId", "penalties", "tenantId", "totalDeductions", "transportAllowance", "updatedAt") SELECT "absenceDeduction", "advances", "basicSalary", "companyId", "createdAt", "employeeId", "fridayHours", "fridayValue", "grossSalary", "housingAllowance", "id", "netSalary", "normalWage", "otherAllowances", "otherDeductions", "overtimeHours", "overtimeValue", "paidAmount", "paymentStatus", "payrollRunId", "penalties", "tenantId", "totalDeductions", "transportAllowance", "updatedAt" FROM "PayrollLine";
DROP TABLE "PayrollLine";
ALTER TABLE "new_PayrollLine" RENAME TO "PayrollLine";
CREATE INDEX "PayrollLine_employeeId_idx" ON "PayrollLine"("employeeId");
CREATE INDEX "PayrollLine_projectId_costCodeId_idx" ON "PayrollLine"("projectId", "costCodeId");
CREATE INDEX "PayrollLine_tenantId_companyId_idx" ON "PayrollLine"("tenantId", "companyId");
CREATE UNIQUE INDEX "PayrollLine_payrollRunId_employeeId_key" ON "PayrollLine"("payrollRunId", "employeeId");
CREATE TABLE "new_Purchase" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "purchaseNumber" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "receiptNoteId" INTEGER,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "dueDate" DATETIME,
    "paymentMethod" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "functionalDiscount" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
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
    CONSTRAINT "Purchase_receiptNoteId_fkey" FOREIGN KEY ("receiptNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Purchase_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Purchase" ("companyId", "createdAt", "currency", "discount", "dueDate", "exchangeRate", "functionalDiscount", "functionalSubtotal", "functionalTotalAmount", "functionalVatAmount", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "rateDate", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "companyId", "createdAt", "currency", "discount", "dueDate", "exchangeRate", "functionalDiscount", "functionalSubtotal", "functionalTotalAmount", "functionalVatAmount", "id", "notes", "partyId", "paymentMethod", "purchaseDate", "purchaseNumber", "rateDate", "receiptNoteId", "referenceNumber", "sourceOrderId", "status", "subtotal", "supplierInvoiceNumber", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "Purchase";
DROP TABLE "Purchase";
ALTER TABLE "new_Purchase" RENAME TO "Purchase";
CREATE UNIQUE INDEX "Purchase_purchaseNumber_key" ON "Purchase"("purchaseNumber");
CREATE UNIQUE INDEX "Purchase_receiptNoteId_key" ON "Purchase"("receiptNoteId");
CREATE INDEX "Purchase_purchaseDate_idx" ON "Purchase"("purchaseDate");
CREATE INDEX "Purchase_partyId_idx" ON "Purchase"("partyId");
CREATE INDEX "Purchase_sourceOrderId_idx" ON "Purchase"("sourceOrderId");
CREATE INDEX "Purchase_projectId_costCodeId_idx" ON "Purchase"("projectId", "costCodeId");
CREATE INDEX "Purchase_tenantId_companyId_idx" ON "Purchase"("tenantId", "companyId");
CREATE TABLE "new_Sale" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyId" INTEGER NOT NULL,
    "sourceOrderId" INTEGER,
    "deliveryNoteId" INTEGER,
    "factoryTransactionId" INTEGER,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "referenceNumber" TEXT,
    "purchaseOrderNumber" TEXT,
    "paymentMethod" TEXT,
    "dueDate" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'SAR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "rateDate" DATETIME,
    "functionalSubtotal" DECIMAL NOT NULL DEFAULT 0,
    "functionalDiscount" DECIMAL NOT NULL DEFAULT 0,
    "functionalVatAmount" DECIMAL NOT NULL DEFAULT 0,
    "functionalTotalAmount" DECIMAL NOT NULL DEFAULT 0,
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
    CONSTRAINT "Sale_deliveryNoteId_fkey" FOREIGN KEY ("deliveryNoteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_factoryTransactionId_fkey" FOREIGN KEY ("factoryTransactionId") REFERENCES "FactoryTransaction" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Sale_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Sale" ("companyId", "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "exchangeRate", "factoryTransactionId", "functionalDiscount", "functionalSubtotal", "functionalTotalAmount", "functionalVatAmount", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "rateDate", "referenceNumber", "sourceOrderId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount") SELECT "companyId", "createdAt", "currency", "deliveryNoteId", "discount", "dueDate", "exchangeRate", "factoryTransactionId", "functionalDiscount", "functionalSubtotal", "functionalTotalAmount", "functionalVatAmount", "id", "invoiceDate", "invoiceNumber", "notes", "partyId", "paymentMethod", "purchaseOrderNumber", "rateDate", "referenceNumber", "sourceOrderId", "status", "subtotal", "tenantId", "totalAmount", "updatedAt", "vatAmount" FROM "Sale";
DROP TABLE "Sale";
ALTER TABLE "new_Sale" RENAME TO "Sale";
CREATE UNIQUE INDEX "Sale_invoiceNumber_key" ON "Sale"("invoiceNumber");
CREATE UNIQUE INDEX "Sale_deliveryNoteId_key" ON "Sale"("deliveryNoteId");
CREATE UNIQUE INDEX "Sale_factoryTransactionId_key" ON "Sale"("factoryTransactionId");
CREATE INDEX "Sale_invoiceDate_idx" ON "Sale"("invoiceDate");
CREATE INDEX "Sale_partyId_idx" ON "Sale"("partyId");
CREATE INDEX "Sale_sourceOrderId_idx" ON "Sale"("sourceOrderId");
CREATE INDEX "Sale_projectId_costCodeId_idx" ON "Sale"("projectId", "costCodeId");
CREATE INDEX "Sale_tenantId_companyId_idx" ON "Sale"("tenantId", "companyId");
CREATE TABLE "new_StockMovement" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "movementNumber" TEXT NOT NULL,
    "movementDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "itemId" INTEGER NOT NULL,
    "partyId" INTEGER,
    "ownershipType" TEXT NOT NULL,
    "movementType" TEXT NOT NULL,
    "quantityIn" DECIMAL NOT NULL DEFAULT 0,
    "quantityOut" DECIMAL NOT NULL DEFAULT 0,
    "unitCost" DECIMAL NOT NULL DEFAULT 0,
    "totalValue" DECIMAL NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL,
    "referenceType" TEXT,
    "referenceId" INTEGER,
    "referenceNumber" TEXT,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "StockMovement_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_StockMovement" ("balanceAfter", "companyId", "createdAt", "id", "itemId", "movementDate", "movementNumber", "movementType", "notes", "ownershipType", "partyId", "quantityIn", "quantityOut", "referenceId", "referenceNumber", "referenceType", "tenantId", "totalValue", "unitCost") SELECT "balanceAfter", "companyId", "createdAt", "id", "itemId", "movementDate", "movementNumber", "movementType", "notes", "ownershipType", "partyId", "quantityIn", "quantityOut", "referenceId", "referenceNumber", "referenceType", "tenantId", "totalValue", "unitCost" FROM "StockMovement";
DROP TABLE "StockMovement";
ALTER TABLE "new_StockMovement" RENAME TO "StockMovement";
CREATE UNIQUE INDEX "StockMovement_movementNumber_key" ON "StockMovement"("movementNumber");
CREATE INDEX "StockMovement_movementDate_idx" ON "StockMovement"("movementDate");
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");
CREATE INDEX "StockMovement_partyId_idx" ON "StockMovement"("partyId");
CREATE INDEX "StockMovement_projectId_costCodeId_idx" ON "StockMovement"("projectId", "costCodeId");
CREATE INDEX "StockMovement_tenantId_companyId_idx" ON "StockMovement"("tenantId", "companyId");
CREATE TABLE "new_TransportTrip" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tenantId" INTEGER NOT NULL DEFAULT 1,
    "companyId" INTEGER NOT NULL DEFAULT 1,
    "tripNumber" TEXT NOT NULL,
    "tripDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "noteId" INTEGER,
    "partyId" INTEGER,
    "itemId" INTEGER,
    "truckId" INTEGER,
    "driverId" INTEGER,
    "quantity" DECIMAL NOT NULL DEFAULT 0,
    "weight" DECIMAL,
    "source" TEXT,
    "loadingPoint" TEXT,
    "unloadingPoint" TEXT,
    "estimatedKm" DECIMAL,
    "actualKm" DECIMAL,
    "transportRevenue" DECIMAL NOT NULL DEFAULT 0,
    "transportPricePerTon" DECIMAL,
    "fuelLiters" DECIMAL NOT NULL DEFAULT 0,
    "fuelPricePerLiter" DECIMAL NOT NULL DEFAULT 0,
    "fuelCost" DECIMAL NOT NULL DEFAULT 0,
    "driverTripFee" DECIMAL NOT NULL DEFAULT 0,
    "driverPaidAmount" DECIMAL NOT NULL DEFAULT 0,
    "driverPaymentStatus" TEXT NOT NULL DEFAULT 'DUE',
    "maintenanceCost" DECIMAL NOT NULL DEFAULT 0,
    "administrativeCost" DECIMAL NOT NULL DEFAULT 0,
    "roadPermitCost" DECIMAL NOT NULL DEFAULT 0,
    "otherCost" DECIMAL NOT NULL DEFAULT 0,
    "totalCost" DECIMAL NOT NULL DEFAULT 0,
    "netProfit" DECIMAL NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "projectId" INTEGER,
    "costCenterId" INTEGER,
    "costCodeId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransportTrip_truckId_fkey" FOREIGN KEY ("truckId") REFERENCES "Truck" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_noteId_fkey" FOREIGN KEY ("noteId") REFERENCES "DeliveryReceiptNote" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_costCenterId_fkey" FOREIGN KEY ("costCenterId") REFERENCES "CostCenter" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "TransportTrip_costCodeId_fkey" FOREIGN KEY ("costCodeId") REFERENCES "CostCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_TransportTrip" ("actualKm", "administrativeCost", "companyId", "createdAt", "driverId", "driverPaidAmount", "driverPaymentStatus", "driverTripFee", "estimatedKm", "fuelCost", "fuelLiters", "fuelPricePerLiter", "id", "itemId", "loadingPoint", "maintenanceCost", "netProfit", "noteId", "notes", "otherCost", "partyId", "quantity", "roadPermitCost", "source", "status", "tenantId", "totalCost", "transportPricePerTon", "transportRevenue", "tripDate", "tripNumber", "truckId", "unloadingPoint", "updatedAt", "weight") SELECT "actualKm", "administrativeCost", "companyId", "createdAt", "driverId", "driverPaidAmount", "driverPaymentStatus", "driverTripFee", "estimatedKm", "fuelCost", "fuelLiters", "fuelPricePerLiter", "id", "itemId", "loadingPoint", "maintenanceCost", "netProfit", "noteId", "notes", "otherCost", "partyId", "quantity", "roadPermitCost", "source", "status", "tenantId", "totalCost", "transportPricePerTon", "transportRevenue", "tripDate", "tripNumber", "truckId", "unloadingPoint", "updatedAt", "weight" FROM "TransportTrip";
DROP TABLE "TransportTrip";
ALTER TABLE "new_TransportTrip" RENAME TO "TransportTrip";
CREATE UNIQUE INDEX "TransportTrip_tripNumber_key" ON "TransportTrip"("tripNumber");
CREATE UNIQUE INDEX "TransportTrip_noteId_key" ON "TransportTrip"("noteId");
CREATE INDEX "TransportTrip_tripDate_idx" ON "TransportTrip"("tripDate");
CREATE INDEX "TransportTrip_partyId_idx" ON "TransportTrip"("partyId");
CREATE INDEX "TransportTrip_itemId_idx" ON "TransportTrip"("itemId");
CREATE INDEX "TransportTrip_truckId_idx" ON "TransportTrip"("truckId");
CREATE INDEX "TransportTrip_driverId_idx" ON "TransportTrip"("driverId");
CREATE INDEX "TransportTrip_projectId_costCodeId_idx" ON "TransportTrip"("projectId", "costCodeId");
CREATE INDEX "TransportTrip_tenantId_companyId_idx" ON "TransportTrip"("tenantId", "companyId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CostCode_code_key" ON "CostCode"("code");

-- CreateIndex
CREATE INDEX "CostCode_tenantId_companyId_idx" ON "CostCode"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_projectNumber_key" ON "Project"("projectNumber");

-- CreateIndex
CREATE INDEX "Project_tenantId_companyId_status_idx" ON "Project"("tenantId", "companyId", "status");

-- CreateIndex
CREATE INDEX "Project_partyId_idx" ON "Project"("partyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectContract_contractNumber_key" ON "ProjectContract"("contractNumber");

-- CreateIndex
CREATE INDEX "ProjectContract_tenantId_companyId_idx" ON "ProjectContract"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "ProjectContract_projectId_status_idx" ON "ProjectContract"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectBoqItem_tenantId_companyId_idx" ON "ProjectBoqItem"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectBoqItem_projectId_boqCode_key" ON "ProjectBoqItem"("projectId", "boqCode");

-- CreateIndex
CREATE INDEX "ProjectCostBudget_tenantId_companyId_idx" ON "ProjectCostBudget"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectCostBudget_projectId_costCodeId_key" ON "ProjectCostBudget"("projectId", "costCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectChangeOrder_changeOrderNumber_key" ON "ProjectChangeOrder"("changeOrderNumber");

-- CreateIndex
CREATE INDEX "ProjectChangeOrder_tenantId_companyId_idx" ON "ProjectChangeOrder"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "ProjectChangeOrder_projectId_status_idx" ON "ProjectChangeOrder"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectChangeOrderLine_tenantId_companyId_idx" ON "ProjectChangeOrderLine"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "ProjectProgress_tenantId_companyId_idx" ON "ProjectProgress"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "ProjectProgress_projectId_progressDate_idx" ON "ProjectProgress"("projectId", "progressDate");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressCertificate_certificateNumber_key" ON "ProgressCertificate"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressCertificate_saleId_key" ON "ProgressCertificate"("saleId");

-- CreateIndex
CREATE INDEX "ProgressCertificate_tenantId_companyId_idx" ON "ProgressCertificate"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "ProgressCertificate_projectId_status_idx" ON "ProgressCertificate"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProgressCertificateLine_tenantId_companyId_idx" ON "ProgressCertificateLine"("tenantId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgressCertificateLine_certificateId_boqItemId_key" ON "ProgressCertificateLine"("certificateId", "boqItemId");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorContract_contractNumber_key" ON "SubcontractorContract"("contractNumber");

-- CreateIndex
CREATE INDEX "SubcontractorContract_tenantId_companyId_idx" ON "SubcontractorContract"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "SubcontractorContract_projectId_status_idx" ON "SubcontractorContract"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorCertificate_certificateNumber_key" ON "SubcontractorCertificate"("certificateNumber");

-- CreateIndex
CREATE UNIQUE INDEX "SubcontractorCertificate_purchaseId_key" ON "SubcontractorCertificate"("purchaseId");

-- CreateIndex
CREATE INDEX "SubcontractorCertificate_tenantId_companyId_idx" ON "SubcontractorCertificate"("tenantId", "companyId");

-- CreateIndex
CREATE INDEX "SubcontractorCertificate_subcontractContractId_status_idx" ON "SubcontractorCertificate"("subcontractContractId", "status");
