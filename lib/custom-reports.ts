import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import type { ReportTable } from "@/lib/financial-export";

type Row = Record<string, string | number | boolean | null>;
type Filter = { field: string; operator: "EQ" | "CONTAINS" | "GTE" | "LTE"; value: unknown };
type Calculation = { field: string; operation: "SUM" | "COUNT" | "AVG" | "MIN" | "MAX"; label?: string };
const sources = {
  PARTIES: ["id", "nameAr", "unifiedNumber", "vatNumber", "isCustomer", "isSupplier", "isActive", "createdAt"],
  ITEMS: ["id", "code", "nameAr", "category", "unit", "costPrice", "salePrice", "vatRate", "isActive", "createdAt"],
  SALES: ["id", "invoiceNumber", "invoiceDate", "partyName", "status", "currency", "subtotal", "vatAmount", "totalAmount", "functionalTotalAmount"],
  PURCHASES: ["id", "purchaseNumber", "purchaseDate", "partyName", "status", "currency", "subtotal", "vatAmount", "totalAmount", "functionalTotalAmount"],
  STOCK_MOVEMENTS: ["id", "movementNumber", "movementDate", "itemCode", "itemName", "partyName", "ownershipType", "movementType", "quantityIn", "quantityOut", "unitCost", "totalValue", "balanceAfter"],
  EXPENSES: ["id", "voucherNumber", "expenseDate", "expenseType", "description", "status", "currency", "totalAmount", "functionalTotalAmount"],
  REVENUES: ["id", "voucherNumber", "revenueDate", "revenueType", "description", "status", "currency", "totalAmount", "functionalTotalAmount"],
  PROJECTS: ["id", "projectNumber", "name", "customer", "status", "contractValue", "progressPercent", "startDate", "endDate"],
  EMPLOYEES: ["id", "employeeNumber", "nameAr", "department", "jobTitle", "basicSalary", "status", "hireDate"],
  TRANSPORT_TRIPS: ["id", "tripNumber", "tripDate", "partyName", "itemName", "quantity", "transportRevenue", "totalCost", "netProfit", "status"],
} as const;
export type CustomReportSource = keyof typeof sources;

export class CustomReportError extends Error { constructor(message: string, public readonly status = 400) { super(message); } }
const json = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const text = (value: unknown) => String(value ?? "").trim();
const scalar = (value: unknown): string | number | boolean | null => value instanceof Date ? value.toISOString() : typeof value === "object" && value !== null && "toNumber" in value ? Number(value) : value === undefined ? null : value as string | number | boolean | null;

export function customReportCatalog() { return Object.entries(sources).map(([key, fields]) => ({ key, fields })); }

export async function saveCustomReport(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId: number) {
  const sourceType = text(input.sourceType).toUpperCase() as CustomReportSource, code = text(input.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  if (!(sourceType in sources) || !code || !text(input.name)) throw new CustomReportError("بيانات التقرير غير صالحة");
  const allowed = new Set<string>(sources[sourceType]), fields = Array.isArray(input.fields) ? input.fields.map(text).filter((field) => allowed.has(field)) : [];
  if (!fields.length) throw new CustomReportError("اختر حقلًا واحدًا على الأقل");
  const filters = Array.isArray(input.filters) ? input.filters : [], groupBy = Array.isArray(input.groupBy) ? input.groupBy.map(text).filter((field) => allowed.has(field)) : [], sort = Array.isArray(input.sort) ? input.sort : [], calculations = Array.isArray(input.calculations) ? input.calculations : [];
  const tenantId = Number(input.tenantId), companyId = Number(input.companyId), visibility = ["PRIVATE", "COMPANY", "ROLES"].includes(text(input.visibility).toUpperCase()) ? text(input.visibility).toUpperCase() : "PRIVATE";
  const data = { name: text(input.name), sourceType, fieldsJson: JSON.stringify(fields), filtersJson: JSON.stringify(filters), groupByJson: JSON.stringify(groupBy), sortJson: JSON.stringify(sort), calculationsJson: JSON.stringify(calculations), visibility, ownerUserId: userId, roleCodesJson: JSON.stringify(Array.isArray(input.roleCodes) ? input.roleCodes.map(text) : []), isActive: input.isActive !== false };
  const record = await tx.customReportDefinition.upsert({ where: { tenantId_companyId_code: { tenantId, companyId, code } }, create: { tenantId, companyId, code, ...data }, update: data });
  await audit(tx, { action: "CUSTOM_REPORT_SAVE", entityType: "CUSTOM_REPORT", entityId: record.id, userId: String(userId), metadata: { code, sourceType } });
  return record;
}

async function loadRows(tx: Prisma.TransactionClient, source: CustomReportSource): Promise<Row[]> {
  if (source === "PARTIES") return (await tx.party.findMany({ take: 5000, orderBy: { id: "desc" } })).map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, scalar(value)])) as Row);
  if (source === "ITEMS") return (await tx.item.findMany({ take: 5000, include: { category: true, unit: true }, orderBy: { id: "desc" } })).map((row) => ({ id: row.id, code: row.code, nameAr: row.nameAr, category: row.category?.nameAr ?? null, unit: row.unit.nameAr, costPrice: Number(row.costPrice), salePrice: Number(row.salePrice), vatRate: Number(row.vatRate), isActive: row.isActive, createdAt: row.createdAt.toISOString() }));
  if (source === "SALES") return (await tx.sale.findMany({ take: 5000, include: { party: true }, orderBy: { invoiceDate: "desc" } })).map((row) => ({ id: row.id, invoiceNumber: row.invoiceNumber, invoiceDate: row.invoiceDate.toISOString(), partyName: row.party.nameAr, status: row.status, currency: row.currency, subtotal: Number(row.subtotal), vatAmount: Number(row.vatAmount), totalAmount: Number(row.totalAmount), functionalTotalAmount: Number(row.functionalTotalAmount) }));
  if (source === "PURCHASES") return (await tx.purchase.findMany({ take: 5000, include: { party: true }, orderBy: { purchaseDate: "desc" } })).map((row) => ({ id: row.id, purchaseNumber: row.purchaseNumber, purchaseDate: row.purchaseDate.toISOString(), partyName: row.party.nameAr, status: row.status, currency: row.currency, subtotal: Number(row.subtotal), vatAmount: Number(row.vatAmount), totalAmount: Number(row.totalAmount), functionalTotalAmount: Number(row.functionalTotalAmount) }));
  if (source === "STOCK_MOVEMENTS") return (await tx.stockMovement.findMany({ take: 5000, include: { item: true, party: true }, orderBy: { movementDate: "desc" } })).map((row) => ({ id: row.id, movementNumber: row.movementNumber, movementDate: row.movementDate.toISOString(), itemCode: row.item.code, itemName: row.item.nameAr, partyName: row.party?.nameAr ?? null, ownershipType: row.ownershipType, movementType: row.movementType, quantityIn: Number(row.quantityIn), quantityOut: Number(row.quantityOut), unitCost: Number(row.unitCost), totalValue: Number(row.totalValue), balanceAfter: Number(row.balanceAfter) }));
  if (source === "EXPENSES") return (await tx.expense.findMany({ take: 5000, orderBy: { expenseDate: "desc" } })).map((row) => ({ id: row.id, voucherNumber: row.voucherNumber, expenseDate: row.expenseDate.toISOString(), expenseType: row.expenseType, description: row.description, status: row.status, currency: row.currency, totalAmount: Number(row.totalAmount), functionalTotalAmount: Number(row.functionalTotalAmount) }));
  if (source === "REVENUES") return (await tx.revenue.findMany({ take: 5000, orderBy: { revenueDate: "desc" } })).map((row) => ({ id: row.id, voucherNumber: row.voucherNumber, revenueDate: row.revenueDate.toISOString(), revenueType: row.revenueType, description: row.description, status: row.status, currency: row.currency, totalAmount: Number(row.totalAmount), functionalTotalAmount: Number(row.functionalTotalAmount) }));
  if (source === "PROJECTS") return (await tx.project.findMany({ take: 5000, include: { customer: true }, orderBy: { id: "desc" } })).map((row) => ({ id: row.id, projectNumber: row.projectNumber, name: row.name, customer: row.customer.nameAr, status: row.status, contractValue: Number(row.contractValue), progressPercent: Number(row.progressPercent), startDate: row.startDate.toISOString(), endDate: row.endDate?.toISOString() ?? null }));
  if (source === "EMPLOYEES") return (await tx.employee.findMany({ take: 5000, orderBy: { id: "desc" } })).map((row) => ({ id: row.id, employeeNumber: row.employeeNumber, nameAr: row.nameAr, department: row.department, jobTitle: row.jobTitle, basicSalary: Number(row.basicSalary), status: row.status, hireDate: row.hireDate?.toISOString() ?? null }));
  return (await tx.transportTrip.findMany({ take: 5000, include: { party: true, item: true }, orderBy: { tripDate: "desc" } })).map((row) => ({ id: row.id, tripNumber: row.tripNumber, tripDate: row.tripDate.toISOString(), partyName: row.party?.nameAr ?? null, itemName: row.item?.nameAr ?? null, quantity: Number(row.quantity), transportRevenue: Number(row.transportRevenue), totalCost: Number(row.totalCost), netProfit: Number(row.netProfit), status: row.status }));
}

function aggregate(rows: Row[], calculation: Calculation) {
  const values = rows.map((row) => Number(row[calculation.field])).filter(Number.isFinite);
  if (calculation.operation === "COUNT") return rows.length;
  if (!values.length) return 0;
  if (calculation.operation === "SUM") return values.reduce((sum, value) => sum + value, 0);
  if (calculation.operation === "AVG") return values.reduce((sum, value) => sum + value, 0) / values.length;
  if (calculation.operation === "MIN") return Math.min(...values);
  return Math.max(...values);
}

export async function runCustomReport(tx: Prisma.TransactionClient, definition: { sourceType: string; fieldsJson: string; filtersJson: string; groupByJson: string; sortJson: string; calculationsJson: string }, runtimeFilters: Filter[] = []) {
  const source = definition.sourceType as CustomReportSource;
  if (!(source in sources)) throw new CustomReportError("مصدر التقرير غير مدعوم");
  const allowed = new Set<string>(sources[source]), fields = json<string[]>(definition.fieldsJson, []).filter((field) => allowed.has(field));
  const filters = [...json<Filter[]>(definition.filtersJson, []), ...runtimeFilters].filter((filter) => allowed.has(filter.field));
  let rows = await loadRows(tx, source);
  rows = rows.filter((row) => filters.every((filter) => { const value = row[filter.field]; if (filter.operator === "EQ") return String(value ?? "") === String(filter.value ?? ""); if (filter.operator === "CONTAINS") return String(value ?? "").toLowerCase().includes(String(filter.value ?? "").toLowerCase()); if (filter.operator === "GTE") return Number(value) >= Number(filter.value); return Number(value) <= Number(filter.value); }));
  const groupBy = json<string[]>(definition.groupByJson, []).filter((field) => allowed.has(field)), calculations = json<Calculation[]>(definition.calculationsJson, []).filter((calculation) => allowed.has(calculation.field));
  if (groupBy.length) {
    const groups = new Map<string, Row[]>(); for (const row of rows) { const value = groupBy.map((field) => String(row[field] ?? "")).join(" | "); groups.set(value, [...(groups.get(value) ?? []), row]); }
    rows = [...groups.entries()].map(([group, members]) => ({ group, ...Object.fromEntries(calculations.map((calculation) => [calculation.label || `${calculation.operation}_${calculation.field}`, aggregate(members, calculation)])) }));
  } else rows = rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]])) as Row);
  const sort = json<{ field: string; direction?: string }[]>(definition.sortJson, []);
  for (const order of [...sort].reverse()) rows.sort((a, b) => String(a[order.field] ?? "").localeCompare(String(b[order.field] ?? ""), "ar", { numeric: true }) * (order.direction === "desc" ? -1 : 1));
  const columns = rows.length ? Object.keys(rows[0]) : groupBy.length ? ["group", ...calculations.map((calculation) => calculation.label || `${calculation.operation}_${calculation.field}`)] : fields;
  return { columns, rows, totals: Object.fromEntries(calculations.map((calculation) => [calculation.label || `${calculation.operation}_${calculation.field}`, aggregate(rows, calculation)])), sourceRowCount: rows.length, truncated: rows.length >= 5000 };
}

export function customReportTable(name: string, result: { columns: string[]; rows: Row[] }): ReportTable { return { title: name, subtitle: "NETAj ERP Custom Report", columns: result.columns, rows: result.rows.map((row) => result.columns.map((column) => typeof row[column] === "boolean" ? String(row[column]) : row[column])) }; }
