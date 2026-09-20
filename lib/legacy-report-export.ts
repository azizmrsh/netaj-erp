import type { ReportTable } from "@/lib/financial-export";

type Row = Record<string, unknown>;
const n = (value: unknown) => Number(value ?? 0);

const definitions: Record<string, { title: string; columns: Array<[string, string, "number"?]> }> = {
  "daily-production": { title: "Daily NETAj Production Report", columns: [["date", "Date"], ["number", "Production No."], ["customer", "Customer"], ["material", "Material"], ["tons", "Production Tons", "number"], ["revenue", "Revenue", "number"]] },
  "material-profitability": { title: "Material Profitability", columns: [["itemCode", "Code"], ["itemName", "Material"], ["revenueExVat", "Revenue ex VAT", "number"], ["revenueWithVat", "Revenue incl VAT", "number"], ["cogs", "COGS", "number"], ["openingValue", "Opening", "number"], ["customerTransfers", "Customer Transfers", "number"], ["purchasesValue", "Purchases", "number"], ["carriageInward", "Carriage Inward", "number"], ["closingValue", "Closing", "number"], ["grossProfit", "Gross Profit", "number"], ["expenses", "Expenses", "number"], ["netProfit", "Net Profit", "number"], ["tons", "Tons", "number"], ["profitPerTon", "Profit / Ton", "number"]] },
  "sector-profitability": { title: "Sector Profitability", columns: [["sector", "Sector"], ["date", "Date"], ["entryNumber", "Journal Entry"], ["accountCode", "Account Code"], ["accountName", "Account"], ["description", "Description"], ["revenue", "Revenue", "number"], ["directCost", "Direct Cost", "number"], ["allocatedCost", "Allocated Cost", "number"]] },
  "monthly-comparison": { title: "Monthly Comparison Matrix", columns: [["month", "Month"], ["allSectors", "All Sectors", "number"], ["mb", "MB", "number"], ["oil", "Oil", "number"], ["asphalt", "Asphalt", "number"], ["transport", "Transport", "number"], ["sales", "Sales", "number"], ["purchases", "Purchases", "number"], ["momPercent", "MoM %", "number"], ["yoyPercent", "YoY %", "number"], ["annualAverage", "Annual Average", "number"]] },
  "customer-activity": { title: "Customer Activity Analytics", columns: [["partyName", "Customer"], ["withdrawals", "Withdrawals", "number"], ["value", "Value", "number"], ["previousWithdrawals", "Previous Period", "number"], ["changePercent", "Change %", "number"], ["lastActivity", "Last Activity"], ["inactiveDays", "Inactive Days", "number"], ["declining", "Declining"], ["stopped", "Stopped"], ["isNew", "New"]] },
  "customer-raw-balances": { title: "Customer Raw Material Balances", columns: [["party", "Customer"], ["item", "Material"], ["unit", "Unit"], ["quantity", "Quantity", "number"], ["averageValue", "Average Value", "number"], ["value", "Value", "number"], ["side", "Debit / Credit"]] },
  reconciliation: { title: "Month-End Reconciliation", columns: [["area", "Area"], ["operational", "Operational", "number"], ["ledger", "General Ledger", "number"], ["difference", "Difference", "number"], ["note", "Note"]] },
  payroll: { title: "Payroll Report", columns: [["payroll", "Payroll"], ["year", "Year", "number"], ["month", "Month", "number"], ["employee", "Employee"], ["basic", "Basic", "number"], ["housing", "Housing", "number"], ["transport", "Transport", "number"], ["deductions", "Deductions", "number"], ["overtime", "Overtime", "number"], ["fridayHours", "Friday Hours", "number"], ["total", "Net Pay", "number"], ["iban", "IBAN"], ["bank", "Bank"]] },
  "driver-advances": { title: "Driver Advances and Trip Fees", columns: [["driver", "Driver"], ["advance", "Advance", "number"], ["tripFees", "Trip Fees", "number"], ["deductions", "Deductions", "number"], ["paid", "Paid", "number"], ["remaining", "Remaining", "number"]] },
  "driver-expenses": { title: "Driver Invoices and Expenses", columns: [["date", "Date"], ["trip", "Trip"], ["driver", "Driver"], ["vehicle", "Vehicle"], ["type", "Type"], ["amount", "Amount", "number"]] },
  attendance: { title: "Attendance Report", columns: [["date", "Date"], ["employee", "Employee"], ["department", "Department"], ["status", "Status"], ["workHours", "Work Hours", "number"], ["overtimeHours", "Overtime", "number"], ["fridayHours", "Friday Hours", "number"], ["checkIn", "Check In"], ["checkOut", "Check Out"]] },
  "customer-vehicle": { title: "Customer and Vehicle Reconciliation", columns: [["date", "Date"], ["trip", "Trip"], ["customer", "Customer"], ["vehicle", "Vehicle"], ["driver", "Driver"], ["quantity", "Quantity", "number"], ["revenue", "Revenue", "number"], ["cost", "Cost", "number"], ["net", "Net", "number"], ["note", "Source Note"]] },
  "equipment-readings": { title: "Tank and Equipment Readings", columns: [["date", "Date"], ["assetType", "Asset Type"], ["assetName", "Asset"], ["readingType", "Reading Type"], ["unit", "Unit"], ["opening", "Opening", "number"], ["used", "Used", "number"], ["closing", "Closing", "number"], ["reading", "Reading", "number"], ["notes", "Notes"]] },
};

export function legacyReportTable(report: string, data: unknown, subtitle: string): ReportTable {
  const definition = definitions[report];
  if (!definition) throw new Error("Unsupported legacy report export");
  const value = data as { rows?: Row[] }, rows = value.rows ?? [];
  return { title: definition.title, subtitle, columns: definition.columns.map((column) => column[1]), rows: rows.map((row) => definition.columns.map(([key, , type]) => type === "number" ? n(row[key]) : String(row[key] ?? ""))) };
}

export const legacyReportKeys = Object.keys(definitions);
