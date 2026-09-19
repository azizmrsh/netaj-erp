export type ImportFieldType = "text" | "number" | "date" | "boolean";

export type ImportFieldDefinition = {
  key: string;
  labelAr: string;
  labelEn: string;
  type: ImportFieldType;
  required?: boolean;
  aliases: string[];
};

export type ImportTargetDefinition = {
  key: string;
  labelAr: string;
  labelEn: string;
  moduleKey: string;
  accountingSensitive?: boolean;
  fields: ImportFieldDefinition[];
  duplicateKey: string[];
};

const field = (
  key: string,
  labelAr: string,
  labelEn: string,
  type: ImportFieldType,
  aliases: string[],
  required = false
): ImportFieldDefinition => ({ key, labelAr, labelEn, type, aliases: [key, labelAr, labelEn, ...aliases], required });

export const importTargets: ImportTargetDefinition[] = [
  {
    key: "PARTIES", labelAr: "العملاء والموردون", labelEn: "Customers and suppliers", moduleKey: "CORE", duplicateKey: ["unifiedNumber", "nameAr"],
    fields: [
      field("nameAr", "الاسم العربي", "Arabic Name", "text", ["الاسم", "اسم العميل", "اسم المورد", "customer", "supplier"], true),
      field("nameEn", "الاسم الإنجليزي", "English Name", "text", ["english name"]),
      field("unifiedNumber", "الرقم الموحد", "Unified Number", "text", ["رقم موحد", "commercial number", "cr"]),
      field("vatNumber", "الرقم الضريبي", "VAT Number", "text", ["ضريبة", "tax number"]),
      field("telephone", "الهاتف", "Telephone", "text", ["جوال", "phone", "mobile"]),
      field("email", "البريد الإلكتروني", "Email", "text", ["بريد"]),
      field("isCustomer", "عميل", "Is Customer", "boolean", ["نوع عميل", "customer flag"]),
      field("isSupplier", "مورد", "Is Supplier", "boolean", ["نوع مورد", "supplier flag"]),
      field("city", "المدينة", "City", "text", []),
      field("district", "الحي", "District", "text", []),
      field("street", "الشارع", "Street", "text", []),
      field("postalCode", "الرمز البريدي", "Postal Code", "text", ["zip"]),
      field("notes", "ملاحظات", "Notes", "text", []),
    ],
  },
  {
    key: "ITEMS", labelAr: "المواد والأصناف", labelEn: "Items", moduleKey: "CORE", duplicateKey: ["code"],
    fields: [
      field("code", "كود المادة", "Item Code", "text", ["الكود", "sku"], true),
      field("nameAr", "اسم المادة", "Arabic Name", "text", ["المادة", "الصنف", "item"], true),
      field("nameEn", "الاسم الإنجليزي", "English Name", "text", []),
      field("unitCode", "كود الوحدة", "Unit Code", "text", ["الوحدة", "unit"], true),
      field("category", "التصنيف", "Category", "text", ["فئة"]),
      field("costPrice", "سعر التكلفة", "Cost Price", "number", ["تكلفة"]),
      field("salePrice", "سعر البيع", "Sale Price", "number", ["سعر"]),
      field("vatRate", "نسبة الضريبة", "VAT Rate", "number", ["vat", "ضريبة"]),
      field("minimumStock", "الحد الأدنى", "Minimum Stock", "number", ["minimum"]),
      field("specification", "المواصفة", "Specification", "text", ["مواصفات"]),
    ],
  },
  {
    key: "COMPANY_STOCK", labelAr: "الرصيد الافتتاحي لمخزون الشركة", labelEn: "Company opening stock", moduleKey: "INVENTORY", duplicateKey: ["itemCode"],
    fields: [
      field("itemCode", "كود المادة", "Item Code", "text", ["المادة", "item"], true),
      field("quantity", "الكمية", "Quantity", "number", ["رصيد", "balance"], true),
      field("unitCost", "تكلفة الوحدة", "Unit Cost", "number", ["تكلفة", "cost"]),
      field("movementDate", "تاريخ الرصيد", "Balance Date", "date", ["التاريخ", "date"]),
      field("referenceNumber", "المرجع", "Reference", "text", ["رقم المرجع"]),
      field("notes", "ملاحظات", "Notes", "text", []),
    ],
  },
  {
    key: "PARTY_STOCK", labelAr: "أرصدة مخزون العملاء", labelEn: "Customer-owned stock", moduleKey: "INVENTORY", duplicateKey: ["partyKey", "itemCode"],
    fields: [
      field("partyKey", "العميل", "Party", "text", ["اسم العميل", "الرقم الموحد", "customer"], true),
      field("itemCode", "كود المادة", "Item Code", "text", ["المادة", "item"], true),
      field("quantity", "الكمية", "Quantity", "number", ["رصيد", "balance"], true),
      field("unitCost", "قيمة الوحدة", "Unit Value", "number", ["تكلفة", "value"]),
      field("movementDate", "تاريخ الرصيد", "Balance Date", "date", ["التاريخ", "date"]),
      field("referenceNumber", "المرجع", "Reference", "text", []),
      field("notes", "ملاحظات", "Notes", "text", []),
    ],
  },
  {
    key: "SALES", labelAr: "المبيعات وفواتير العملاء", labelEn: "Sales invoices", moduleKey: "SALES", accountingSensitive: true, duplicateKey: ["documentNumber", "lineNumber"],
    fields: commerceFields("invoiceNumber", "رقم الفاتورة", "Invoice Number", "invoiceDate", "تاريخ الفاتورة", "Invoice Date", "customer"),
  },
  {
    key: "PURCHASES", labelAr: "المشتريات وفواتير الموردين", labelEn: "Purchase invoices", moduleKey: "PURCHASES", accountingSensitive: true, duplicateKey: ["documentNumber", "lineNumber"],
    fields: commerceFields("purchaseNumber", "رقم الشراء", "Purchase Number", "purchaseDate", "تاريخ الشراء", "Purchase Date", "supplier"),
  },
  {
    key: "NOTES", labelAr: "سندات الاستلام والتسليم", labelEn: "Receipt and delivery notes", moduleKey: "NOTES", duplicateKey: ["noteNumber", "lineNumber"],
    fields: [
      field("noteNumber", "رقم السند القديم", "Legacy Note Number", "text", ["رقم السند", "document number"], true),
      field("noteType", "نوع السند", "Note Type", "text", ["استلام أو تسليم", "type"], true),
      field("noteDate", "تاريخ السند", "Note Date", "date", ["التاريخ"], true),
      field("partyKey", "العميل أو المورد", "Party", "text", ["العميل", "المورد"], true),
      field("itemCode", "كود المادة", "Item Code", "text", ["المادة"], true),
      field("lineNumber", "رقم السطر", "Line Number", "number", ["السطر"], true),
      field("quantity", "الكمية", "Quantity", "number", ["qty"], true),
      field("weight", "الوزن", "Weight", "number", []),
      field("stockOwnership", "ملكية المخزون", "Stock Ownership", "text", ["الملكية", "company party"], true),
      field("transportMethod", "وسيلة النقل", "Transport Method", "text", ["النقل"]),
      field("plateNumber", "رقم اللوحة", "Plate Number", "text", ["الشاحنة"]),
      field("driverKey", "السائق", "Driver", "text", ["رقم هوية السائق"]),
      field("referenceNumber", "المرجع", "Reference", "text", []),
      field("loadingPoint", "نقطة التحميل", "Loading Point", "text", []),
      field("unloadingPoint", "نقطة التنزيل", "Unloading Point", "text", []),
      field("notes", "ملاحظات", "Notes", "text", []),
    ],
  },
  {
    key: "OPENING_BALANCES", labelAr: "الأرصدة الافتتاحية المحاسبية", labelEn: "Accounting opening balances", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["accountCode", "partyKey"],
    fields: [
      field("accountCode", "كود الحساب", "Account Code", "text", ["الحساب", "account"], true),
      field("accountName", "اسم الحساب", "Account Name", "text", []),
      field("debit", "مدين", "Debit", "number", ["رصيد مدين"]),
      field("credit", "دائن", "Credit", "number", ["رصيد دائن"]),
      field("partyKey", "العميل أو المورد", "Party", "text", ["party"]),
      field("currency", "العملة", "Currency", "text", ["currency code"]),
      field("exchangeRate", "سعر الصرف", "Exchange Rate", "number", ["rate"]),
      field("entryDate", "تاريخ القيد", "Entry Date", "date", ["التاريخ", "date"]),
      field("description", "البيان", "Description", "text", ["الوصف"]),
    ],
  },
  {
    key: "EXPENSES", labelAr: "المصروفات التاريخية", labelEn: "Expenses", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["voucherNumber"],
    fields: financialVoucherFields("voucherNumber", "رقم سند المصروف", "expenseDate", "تاريخ المصروف", "expenseType", "نوع المصروف"),
  },
  {
    key: "REVENUES", labelAr: "الإيرادات التاريخية", labelEn: "Revenues", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["voucherNumber"],
    fields: financialVoucherFields("voucherNumber", "رقم سند الإيراد", "revenueDate", "تاريخ الإيراد", "revenueType", "نوع الإيراد"),
  },
  {
    key: "EMPLOYEES", labelAr: "الموظفون", labelEn: "Employees", moduleKey: "HR", duplicateKey: ["employeeNumber", "idNumber"],
    fields: [
      field("employeeNumber", "رقم الموظف", "Employee Number", "text", ["كود الموظف"], true),
      field("nameAr", "اسم الموظف", "Employee Name", "text", ["الاسم"], true),
      field("idNumber", "رقم الهوية", "ID Number", "text", ["الهوية"]),
      field("department", "القسم", "Department", "text", []),
      field("jobTitle", "المسمى الوظيفي", "Job Title", "text", ["الوظيفة"]),
      field("phone", "الهاتف", "Phone", "text", ["الجوال"]),
      field("hireDate", "تاريخ التعيين", "Hire Date", "date", []),
      field("basicSalary", "الراتب الأساسي", "Basic Salary", "number", ["راتب"]),
      field("housingAllowance", "بدل السكن", "Housing Allowance", "number", []),
      field("transportAllowance", "بدل النقل", "Transport Allowance", "number", []),
      field("iban", "الآيبان", "IBAN", "text", []),
      field("status", "الحالة", "Status", "text", []),
    ],
  },
  {
    key: "ATTENDANCE", labelAr: "الحضور والانصراف", labelEn: "Attendance", moduleKey: "HR", duplicateKey: ["employeeNumber", "attendanceDate"],
    fields: [
      field("employeeNumber", "رقم الموظف", "Employee Number", "text", ["الموظف"], true),
      field("attendanceDate", "تاريخ الحضور", "Attendance Date", "date", ["التاريخ"], true),
      field("status", "الحالة", "Status", "text", ["الحضور"], true),
      field("workHours", "ساعات العمل", "Work Hours", "number", []),
      field("overtimeHours", "ساعات إضافية", "Overtime Hours", "number", []),
      field("checkIn", "وقت الدخول", "Check In", "text", []),
      field("checkOut", "وقت الخروج", "Check Out", "text", []),
      field("notes", "ملاحظات", "Notes", "text", []),
    ],
  },
  {
    key: "TRANSPORT_TRIPS", labelAr: "رحلات النقل", labelEn: "Transport trips", moduleKey: "TRANSPORT", duplicateKey: ["tripNumber"],
    fields: [
      field("tripNumber", "رقم الرحلة", "Trip Number", "text", ["الرحلة"], true),
      field("tripDate", "تاريخ الرحلة", "Trip Date", "date", ["التاريخ"], true),
      field("partyKey", "العميل", "Party", "text", ["customer"]),
      field("itemCode", "كود المادة", "Item Code", "text", ["المادة"]),
      field("plateNumber", "رقم اللوحة", "Plate Number", "text", ["الشاحنة"]),
      field("driverKey", "السائق", "Driver", "text", ["رقم الهوية", "driver"]),
      field("quantity", "الكمية", "Quantity", "number", ["الوزن"]),
      field("transportRevenue", "إيراد النقل", "Transport Revenue", "number", ["الإيراد"]),
      field("fuelCost", "تكلفة الوقود", "Fuel Cost", "number", []),
      field("driverTripFee", "أجرة السائق", "Driver Trip Fee", "number", []),
      field("otherCost", "تكاليف أخرى", "Other Cost", "number", []),
      field("loadingPoint", "نقطة التحميل", "Loading Point", "text", []),
      field("unloadingPoint", "نقطة التنزيل", "Unloading Point", "text", []),
      field("status", "الحالة", "Status", "text", []),
      field("notes", "ملاحظات", "Notes", "text", []),
    ],
  },
];

function commerceFields(numberKey: string, numberAr: string, numberEn: string, dateKey: string, dateAr: string, dateEn: string, partyAlias: string) {
  return [
    field(numberKey, numberAr, numberEn, "text", ["رقم المستند", "document number"], true),
    field(dateKey, dateAr, dateEn, "date", ["التاريخ", "date"], true),
    field("partyKey", "العميل أو المورد", "Party", "text", ["الرقم الموحد", partyAlias], true),
    field("itemCode", "كود المادة", "Item Code", "text", ["المادة", "item"], true),
    field("lineNumber", "رقم السطر", "Line Number", "number", ["السطر", "line"], true),
    field("quantity", "الكمية", "Quantity", "number", ["qty"], true),
    field("unitPrice", "سعر الوحدة", "Unit Price", "number", ["السعر", "price"], true),
    field("discount", "الخصم", "Discount", "number", []),
    field("vatRate", "نسبة الضريبة", "VAT Rate", "number", ["vat", "ضريبة"]),
    field("currency", "العملة", "Currency", "text", []),
    field("exchangeRate", "سعر الصرف", "Exchange Rate", "number", ["rate"]),
    field("referenceNumber", "المرجع", "Reference", "text", []),
    field("dueDate", "تاريخ الاستحقاق", "Due Date", "date", []),
    field("notes", "ملاحظات", "Notes", "text", []),
  ];
}

function financialVoucherFields(numberKey: string, numberAr: string, dateKey: string, dateAr: string, typeKey: string, typeAr: string) {
  return [
    field(numberKey, numberAr, "Voucher Number", "text", ["رقم السند"], true),
    field(dateKey, dateAr, "Date", "date", ["التاريخ"], true),
    field(typeKey, typeAr, "Type", "text", ["النوع"], true),
    field("description", "البيان", "Description", "text", ["الوصف"]),
    field("amountBeforeVat", "المبلغ قبل الضريبة", "Amount Before VAT", "number", ["المبلغ"], true),
    field("vatAmount", "الضريبة", "VAT Amount", "number", []),
    field("currency", "العملة", "Currency", "text", []),
    field("exchangeRate", "سعر الصرف", "Exchange Rate", "number", []),
    field("referenceNumber", "المرجع", "Reference", "text", []),
    field("notes", "ملاحظات", "Notes", "text", []),
  ];
}

export function normalizeImportHeader(value: unknown) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u064B-\u065F\u0670]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function getImportTarget(key: string) {
  return importTargets.find((target) => target.key === key.toUpperCase()) ?? null;
}

export function suggestImportMapping(headers: string[], target: ImportTargetDefinition) {
  const normalized = new Map(headers.map((header) => [normalizeImportHeader(header), header]));
  const mapping: Record<string, string> = {};
  for (const targetField of target.fields) {
    const match = targetField.aliases
      .map(normalizeImportHeader)
      .map((alias) => normalized.get(alias))
      .find(Boolean);
    if (match) mapping[targetField.key] = match;
  }
  return mapping;
}

export function coerceImportValue(value: unknown, type: ImportFieldType) {
  if (value === null || value === undefined || value === "") return null;
  if (type === "text") return String(value).trim();
  if (type === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    const normalized = String(value).replace(/[,%،\s]/g, "").replace(/٫/g, ".");
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (type === "boolean") {
    const normalized = normalizeImportHeader(value);
    if (["1", "true", "yes", "نعم", "عميل", "مورد"].includes(normalized)) return true;
    if (["0", "false", "no", "لا"].includes(normalized)) return false;
    return null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number") {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(excelEpoch.getTime() + value * 86_400_000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function mapImportRow(raw: Record<string, unknown>, mapping: Record<string, string>, target: ImportTargetDefinition) {
  const mapped: Record<string, unknown> = {};
  const errors: string[] = [];
  for (const definition of target.fields) {
    const sourceHeader = mapping[definition.key];
    const rawValue = sourceHeader ? raw[sourceHeader] : null;
    const value = coerceImportValue(rawValue, definition.type);
    mapped[definition.key] = value;
    if (definition.required && (value === null || value === "")) errors.push(`${definition.labelAr} مطلوب أو غير صالح`);
  }
  return { mapped, errors };
}

export function importDuplicateKey(target: ImportTargetDefinition, mapped: Record<string, unknown>) {
  if (target.key === "PARTIES" && !mapped.unifiedNumber) return `NAME:${String(mapped.nameAr ?? "").toLowerCase()}`;
  if (target.key === "SALES") return `${mapped.invoiceNumber ?? ""}:${mapped.lineNumber ?? "1"}`;
  if (target.key === "PURCHASES") return `${mapped.purchaseNumber ?? ""}:${mapped.lineNumber ?? "1"}`;
  return target.duplicateKey.map((key) => String(mapped[key] ?? "").toLowerCase()).join(":");
}
