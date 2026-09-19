export type DataScope = { tenantId: number; companyId: number };

export const scopedModels = new Set([
  "Party", "PartyAddress", "ItemCategory", "Unit", "Item", "CompanyStock", "PartyStockAccount",
  "StockMovement", "DeliveryReceiptNote", "DeliveryReceiptNoteItem", "Truck", "TruckDocument", "Driver",
  "Employee", "ExternalWorker", "AttendanceRecord", "LeaveRequest", "EmployeeAdvance", "PayrollRun",
  "PayrollLine", "PayrollPayment", "ExternalWorkerCost", "ExternalTrade", "ExternalLinkedCost",
  "ExternalExpense", "DriverDocument", "TransportTrip", "TransportTripExpense", "Sale", "SaleItem",
  "Purchase", "PurchaseItem", "FactoryTransaction", "FactoryFeeRate", "FactoryFuelMovement",
  "FactoryMaintenance", "FactoryExpense", "JournalEntry", "JournalEntryLine", "BusinessDocument",
  "BusinessDocumentLine", "DocumentSequence", "Attachment", "AuditLog", "Account", "AccountingMapping",
  "AccountingPeriod", "Expense", "Revenue", "CostCenter", "ExpenseCategory", "RevenueCategory",
  "BankAccount", "BankTransaction", "BankTransfer", "FinancialVoucher", "VoucherAllocation",
  "BankReconciliation", "BankReconciliationLine", "VatReturn", "VatReturnLine",
  "CreditDebitNote", "AccountingAdjustment", "AccountingAdjustmentLine",
  "ExchangeRate", "FxRevaluation", "FxRevaluationLine", "Budget", "BudgetLine",
  "FactoryProductionTarget", "EquipmentReading",
  "CostCode", "Project", "ProjectContract", "ProjectBoqItem", "ProjectCostBudget",
  "ProjectChangeOrder", "ProjectChangeOrderLine", "ProjectProgress", "ProgressCertificate",
  "ProgressCertificateLine", "SubcontractorContract", "SubcontractorCertificate",
  "ImportBatch", "ImportRow", "LegacyRecordLink", "ImportTemplate",
]);

export async function getVerifiedDataScope(): Promise<DataScope> {
  try {
    const { headers } = await import("next/headers");
    const store = await headers();
    if (store.get("x-netaj-scope-verified") === "1") {
      const tenantId = Number(store.get("x-netaj-tenant-id"));
      const companyId = Number(store.get("x-netaj-company-id"));
      if (tenantId > 0 && companyId > 0) return { tenantId, companyId };
    }
  } catch {
    // Non-HTTP service/test execution uses the preserved NETAj default scope.
  }
  if (process.env.NODE_ENV !== "production" || process.env.NETAJ_LEGACY_CONTEXT === "1") {
    return { tenantId: 1, companyId: 1 };
  }
  throw new Error("Missing verified tenant/company data scope");
}

type MutableRecord = Record<string, unknown>;

function isRecord(value: unknown): value is MutableRecord {
  if (!value || typeof value !== "object" || Array.isArray(value) || value instanceof Date) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function scopeCreateData(value: unknown, scope: DataScope): unknown {
  if (Array.isArray(value)) return value.map((entry) => scopeCreateData(entry, scope));
  if (!isRecord(value)) return value;
  const result: MutableRecord = { ...value, tenantId: scope.tenantId, companyId: scope.companyId };
  for (const [key, child] of Object.entries(result)) {
    if (key === "create") result[key] = scopeCreateData(child, scope);
    else if (key === "createMany" && isRecord(child)) {
      result[key] = { ...child, data: scopeCreateData(child.data, scope) };
    } else if (isRecord(child) || Array.isArray(child)) {
      result[key] = scopeNestedMutations(child, scope);
    }
  }
  return result;
}

function scopeNestedMutations(value: unknown, scope: DataScope): unknown {
  if (Array.isArray(value)) return value.map((entry) => scopeNestedMutations(entry, scope));
  if (!isRecord(value)) return value;
  const result: MutableRecord = { ...value };
  delete result.tenantId;
  delete result.companyId;
  for (const [key, child] of Object.entries(result)) {
    if (key === "create") result[key] = scopeCreateData(child, scope);
    else if (key === "createMany" && isRecord(child)) result[key] = { ...child, data: scopeCreateData(child.data, scope) };
    else if (isRecord(child) || Array.isArray(child)) result[key] = scopeNestedMutations(child, scope);
  }
  return result;
}

export function scopePrismaArgs(operation: string, input: unknown, scope: DataScope) {
  const args: MutableRecord = isRecord(input) ? { ...input } : {};
  const scopedWhere = () => {
    const existing = isRecord(args.where) ? args.where : {};
    args.where = { AND: [existing, { tenantId: scope.tenantId, companyId: scope.companyId }] };
  };

  if (["findMany", "findFirst", "findFirstOrThrow", "count", "aggregate", "groupBy", "updateMany", "deleteMany"].includes(operation)) {
    scopedWhere();
  } else if (["findUnique", "findUniqueOrThrow", "update", "delete"].includes(operation)) {
    args.where = { ...(isRecord(args.where) ? args.where : {}), tenantId: scope.tenantId, companyId: scope.companyId };
  } else if (operation === "create") {
    args.data = scopeCreateData(args.data, scope);
  } else if (operation === "createMany" || operation === "createManyAndReturn") {
    args.data = scopeCreateData(args.data, scope);
  } else if (operation === "upsert") {
    args.where = { ...(isRecord(args.where) ? args.where : {}), tenantId: scope.tenantId, companyId: scope.companyId };
    args.create = scopeCreateData(args.create, scope);
    args.update = scopeNestedMutations(args.update, scope);
  }

  if (["update", "updateMany"].includes(operation)) args.data = scopeNestedMutations(args.data, scope);
  return args;
}
