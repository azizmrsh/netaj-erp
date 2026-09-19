export type ImportFieldType = "text" | "number" | "date" | "boolean";

export type ImportFieldDefinition = {
  key: string;
  labelAr: string;
  labelEn: string;
  type: ImportFieldType;
  required?: boolean;
  allowNegative?: boolean;
  aliases: string[];
};

export type ImportTargetDefinition = {
  key: string;
  labelAr: string;
  labelEn: string;
  moduleKey: string;
  accountingSensitive?: boolean;
  referenceOnly?: boolean;
  supportedModes?: ("HISTORICAL" | "OPENING" | "FULL")[];
  fields: ImportFieldDefinition[];
  duplicateKey: string[];
};

const field = (
  key: string,
  labelAr: string,
  labelEn: string,
  type: ImportFieldType,
  aliases: string[],
  required = false,
  allowNegative = false
): ImportFieldDefinition => ({ key, labelAr, labelEn, type, aliases: [key, labelAr, labelEn, ...aliases], required, allowNegative });

export const importTargets: ImportTargetDefinition[] = [
  {
    key: "PARTIES", labelAr: "العملاء والموردون", labelEn: "Customers and suppliers", moduleKey: "CORE", duplicateKey: ["unifiedNumber", "nameAr"],
    fields: [
      field("nameAr", "الاسم العربي", "Arabic Name", "text", ["الاسم", "اسم العميل", "اسم المورد", "customer", "supplier"], true),
      field("nameEn", "الاسم الإنجليزي", "English Name", "text", ["english name"]),
      field("unifiedNumber", "الرقم الموحد", "Unified Number", "text", ["رقم موحد", "commercial number", "cr", "رقم العميل", "كود العميل", "customer code", "account no", "customer id", "supplier code", "كود المورد"]),
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
      field("quantity", "الكمية", "Quantity", "number", ["رصيد", "balance"], true, true),
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
  { key: "CUSTOMERS", labelAr: "العملاء", labelEn: "Customers", moduleKey: "CORE", duplicateKey: ["legacyCode", "unifiedNumber", "nameAr"], fields: partyMasterFields("CUSTOMER") },
  { key: "SUPPLIERS", labelAr: "الموردون", labelEn: "Suppliers", moduleKey: "CORE", duplicateKey: ["legacyCode", "unifiedNumber", "nameAr"], fields: partyMasterFields("SUPPLIER") },
  {
    key: "CHART_OF_ACCOUNTS", labelAr: "دليل الحسابات", labelEn: "Chart of accounts", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["accountCode"], supportedModes: ["HISTORICAL", "FULL"],
    fields: [field("accountCode", "كود الحساب", "Account Code", "text", ["رقم الحساب", "account no", "gl code"], true), field("accountNameAr", "اسم الحساب العربي", "Arabic Account Name", "text", ["اسم الحساب", "account name"], true), field("accountNameEn", "اسم الحساب الإنجليزي", "English Account Name", "text", []), field("accountType", "نوع الحساب", "Account Type", "text", ["التصنيف", "type"], true), field("parentCode", "الحساب الأب", "Parent Account", "text", ["parent code"]), field("allowPosting", "يسمح بالترحيل", "Allow Posting", "boolean", ["posting"]), field("legacyCode", "الكود القديم", "Legacy Code", "text", ["old code"])],
  },
  {
    key: "TRIAL_BALANCE_REFERENCE", labelAr: "ميزان مراجعة مرجعي", labelEn: "Trial balance reference", moduleKey: "ACCOUNTING", accountingSensitive: true, referenceOnly: true, duplicateKey: ["accountCode", "asOfDate"], supportedModes: ["HISTORICAL"],
    fields: referenceAccountFields(),
  },
  {
    key: "INVENTORY_MOVEMENTS", labelAr: "حركات المخزون القديمة", labelEn: "Inventory movements", moduleKey: "INVENTORY", duplicateKey: ["legacyDocumentNumber", "movementDate", "itemCode", "partyKey", "quantity"], supportedModes: ["HISTORICAL", "FULL"],
    fields: [field("legacyDocumentNumber", "رقم الحركة القديم", "Legacy Movement Number", "text", ["رقم المستند", "movement no", "document number"], true), field("movementDate", "تاريخ الحركة", "Movement Date", "date", ["التاريخ"], true), field("itemCode", "كود المادة", "Item Code", "text", ["المادة", "item"], true), field("partyKey", "العميل", "Party", "text", ["customer code", "كود العميل"]), field("ownershipType", "نوع الملكية", "Ownership Type", "text", ["الملكية"], true), field("direction", "اتجاه الحركة", "Direction", "text", ["وارد صادر", "in out"], true), field("quantity", "الكمية", "Quantity", "number", ["qty"], true), field("unitCost", "تكلفة الوحدة", "Unit Cost", "number", ["التكلفة"]), field("reference", "المرجع", "Reference", "text", []), field("notes", "ملاحظات", "Notes", "text", [])],
  },
  { key: "RECEIPTS", labelAr: "سندات القبض", labelEn: "Receipts", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["voucherNumber", "voucherDate", "partyKey", "amount", "referenceNumber"], fields: voucherImportFields("RECEIPT") },
  { key: "PAYMENTS", labelAr: "سندات الصرف", labelEn: "Payments", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["voucherNumber", "voucherDate", "partyKey", "amount", "referenceNumber"], fields: voucherImportFields("PAYMENT") },
  {
    key: "JOURNAL_ENTRIES", labelAr: "القيود اليومية", labelEn: "Journal entries", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["entryNumber", "lineNumber"], supportedModes: ["HISTORICAL", "FULL"],
    fields: [field("entryNumber", "رقم القيد القديم", "Legacy Entry Number", "text", ["رقم القيد", "journal no"], true), field("entryDate", "تاريخ القيد", "Entry Date", "date", ["التاريخ"], true), field("lineNumber", "رقم السطر", "Line Number", "number", ["السطر"], true), field("accountCode", "كود الحساب", "Account Code", "text", ["رقم الحساب"], true), field("debit", "مدين", "Debit", "number", ["debit amount"]), field("credit", "دائن", "Credit", "number", ["credit amount"]), field("partyKey", "العميل أو المورد", "Party", "text", ["party code"]), field("currency", "العملة", "Currency", "text", []), field("exchangeRate", "سعر الصرف", "Exchange Rate", "number", ["rate"]), field("description", "البيان", "Description", "text", ["الوصف"]), field("referenceNumber", "المرجع", "Reference", "text", [])],
  },
  {
    key: "AR_AP_BALANCES", labelAr: "أرصدة العملاء والموردين", labelEn: "AR/AP balances", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["partyKey", "balanceType", "asOfDate"], supportedModes: ["HISTORICAL", "OPENING"],
    fields: [field("partyKey", "العميل أو المورد", "Party", "text", ["customer code", "supplier code", "account no"], true), field("balanceType", "نوع الرصيد", "Balance Type", "text", ["ar ap", "مدين دائن"], true), field("amount", "الرصيد", "Balance", "number", ["amount"], true, true), field("currency", "العملة", "Currency", "text", []), field("exchangeRate", "سعر الصرف", "Exchange Rate", "number", ["rate"]), field("asOfDate", "تاريخ الرصيد", "As Of Date", "date", ["التاريخ"], true), field("legacyDocumentNumber", "رقم المستند القديم", "Legacy Document Number", "text", ["document no"]), field("notes", "ملاحظات", "Notes", "text", [])],
  },
  {
    key: "BANKS_CASH", labelAr: "البنوك والصناديق", labelEn: "Banks and cash", moduleKey: "ACCOUNTING", accountingSensitive: true, duplicateKey: ["iban", "accountNumber", "name"], supportedModes: ["HISTORICAL", "OPENING", "FULL"],
    fields: [field("name", "اسم الحساب البنكي أو الصندوق", "Bank/Cash Name", "text", ["اسم البنك", "cash account"], true), field("bankName", "اسم البنك", "Bank Name", "text", []), field("accountNumber", "رقم الحساب", "Account Number", "text", ["account no"]), field("iban", "الآيبان", "IBAN", "text", []), field("ledgerAccountCode", "كود حساب الأستاذ", "Ledger Account Code", "text", ["gl code"], true), field("currency", "العملة", "Currency", "text", []), field("openingBalance", "الرصيد الافتتاحي", "Opening Balance", "number", ["الرصيد"], false, true), field("cutoverDate", "تاريخ الرصيد", "Balance Date", "date", ["التاريخ"]), field("legacyCode", "الكود القديم", "Legacy Code", "text", [])],
  },
  {
    key: "VAT_REFERENCE", labelAr: "بيانات ضريبة القيمة المضافة المرجعية", labelEn: "VAT reference", moduleKey: "ACCOUNTING", accountingSensitive: true, referenceOnly: true, duplicateKey: ["period", "documentNumber", "vatAmount"], supportedModes: ["HISTORICAL"],
    fields: [field("period", "الفترة", "Period", "text", ["tax period"], true), field("documentNumber", "رقم المستند", "Document Number", "text", ["invoice no"]), field("documentDate", "تاريخ المستند", "Document Date", "date", ["التاريخ"]), field("direction", "نوع الضريبة", "VAT Direction", "text", ["input output"]), field("taxableAmount", "المبلغ الخاضع", "Taxable Amount", "number", ["net amount"], false, true), field("vatAmount", "مبلغ الضريبة", "VAT Amount", "number", ["tax amount"], false, true), field("partyKey", "العميل أو المورد", "Party", "text", [])],
  },
  {
    key: "FACTORY_RAW_MATERIAL", labelAr: "المصنع والمواد الخام", labelEn: "Factory/raw material", moduleKey: "FACTORY", duplicateKey: ["transactionNumber", "transactionDate", "partyKey", "itemCode"], supportedModes: ["HISTORICAL", "FULL"],
    fields: [field("transactionNumber", "رقم العملية القديم", "Legacy Transaction Number", "text", ["رقم المستند"], true), field("transactionDate", "تاريخ العملية", "Transaction Date", "date", ["التاريخ"], true), field("transactionType", "نوع العملية", "Transaction Type", "text", ["النوع"], true), field("partyKey", "العميل", "Party", "text", ["customer code"]), field("itemCode", "كود المادة", "Item Code", "text", ["المادة"], true), field("quantity", "الكمية", "Quantity", "number", ["tons", "الطن"], true), field("feePerTon", "أجرة التصنيع للطن", "Fee Per Ton", "number", ["manufacturing fee"]), field("vatRate", "نسبة الضريبة", "VAT Rate", "number", ["vat"]), field("referenceNumber", "المرجع", "Reference", "text", []), field("notes", "ملاحظات", "Notes", "text", [])],
  },
  {
    key: "PROJECTS", labelAr: "المشاريع والمقاولات", labelEn: "Projects and contracting", moduleKey: "PROJECTS", duplicateKey: ["projectNumber"], supportedModes: ["HISTORICAL", "FULL"],
    fields: [field("projectNumber", "رقم المشروع", "Project Number", "text", ["project code"], true), field("name", "اسم المشروع", "Project Name", "text", ["المشروع"], true), field("partyKey", "العميل", "Customer", "text", ["customer code"], true), field("costCenterCode", "مركز التكلفة", "Cost Center Code", "text", ["cost center"], true), field("startDate", "تاريخ البداية", "Start Date", "date", ["تاريخ المشروع"], true), field("endDate", "تاريخ النهاية", "End Date", "date", []), field("contractValue", "قيمة العقد", "Contract Value", "number", ["contract amount"]), field("advanceAmount", "الدفعة المقدمة", "Advance Amount", "number", []), field("retentionPercent", "نسبة الاستقطاع", "Retention Percent", "number", ["retention"]), field("status", "الحالة", "Status", "text", []), field("legacyCode", "الكود القديم", "Legacy Code", "text", [])],
  },
  { key: "INCOME_STATEMENT_REFERENCE", labelAr: "قائمة دخل مرجعية", labelEn: "Income statement reference", moduleKey: "ACCOUNTING", accountingSensitive: true, referenceOnly: true, duplicateKey: ["lineCode", "period"], supportedModes: ["HISTORICAL"], fields: referenceReportFields() },
  { key: "BALANCE_SHEET_REFERENCE", labelAr: "ميزانية عمومية مرجعية", labelEn: "Balance sheet reference", moduleKey: "ACCOUNTING", accountingSensitive: true, referenceOnly: true, duplicateKey: ["lineCode", "period"], supportedModes: ["HISTORICAL"], fields: referenceReportFields() },
  { key: "SUMMARY_REPORT_REFERENCE", labelAr: "تقرير ملخص مرجعي", labelEn: "Summary report reference", moduleKey: "CORE", referenceOnly: true, duplicateKey: ["lineCode", "period"], supportedModes: ["HISTORICAL"], fields: referenceReportFields() },
];

function partyMasterFields(role: "CUSTOMER" | "SUPPLIER") {
  const roleAliases = role === "CUSTOMER" ? ["رقم العميل", "كود العميل", "customer code", "customer id", "account no"] : ["رقم المورد", "كود المورد", "supplier code", "vendor id", "account no"];
  return [field("legacyCode", role === "CUSTOMER" ? "كود العميل القديم" : "كود المورد القديم", "Legacy Code", "text", roleAliases), field("nameAr", "الاسم العربي", "Arabic Name", "text", ["الاسم", role === "CUSTOMER" ? "اسم العميل" : "اسم المورد", role === "CUSTOMER" ? "customer name" : "supplier name"], true), field("nameEn", "الاسم الإنجليزي", "English Name", "text", ["name english"]), field("unifiedNumber", "الرقم الموحد", "Unified Number", "text", ["commercial number", "cr"]), field("vatNumber", "الرقم الضريبي", "VAT Number", "text", ["tax number"]), field("telephone", "الهاتف", "Telephone", "text", ["جوال", "phone", "mobile"]), field("email", "البريد الإلكتروني", "Email", "text", ["بريد"]), field("city", "المدينة", "City", "text", []), field("district", "الحي", "District", "text", []), field("street", "الشارع", "Street", "text", []), field("postalCode", "الرمز البريدي", "Postal Code", "text", ["zip"]), field("notes", "ملاحظات", "Notes", "text", [])];
}

function voucherImportFields(type: "RECEIPT" | "PAYMENT") {
  return [field("voucherNumber", type === "RECEIPT" ? "رقم سند القبض" : "رقم سند الصرف", "Voucher Number", "text", ["رقم السند", "voucher no"], true), field("voucherDate", "تاريخ السند", "Voucher Date", "date", ["التاريخ"], true), field("partyKey", "العميل أو المورد", "Party", "text", ["customer code", "supplier code"]), field("bankKey", "البنك أو الصندوق", "Bank/Cash", "text", ["bank account", "cash"], true), field("amount", "المبلغ", "Amount", "number", ["paid", "received"], true), field("currency", "العملة", "Currency", "text", []), field("exchangeRate", "سعر الصرف", "Exchange Rate", "number", ["rate"]), field("paymentMethod", "طريقة الدفع", "Payment Method", "text", ["method"]), field("referenceNumber", "المرجع", "Reference", "text", ["cheque no"]), field("description", "البيان", "Description", "text", ["الوصف"]), field("legacyDocumentNumber", "رقم المستند القديم", "Legacy Document Number", "text", ["document number"])];
}

function referenceAccountFields() { return [field("accountCode", "كود الحساب", "Account Code", "text", ["account no"], true), field("accountName", "اسم الحساب", "Account Name", "text", [], true), field("openingDebit", "افتتاحي مدين", "Opening Debit", "number", [], false, true), field("openingCredit", "افتتاحي دائن", "Opening Credit", "number", [], false, true), field("periodDebit", "حركة مدين", "Period Debit", "number", [], false, true), field("periodCredit", "حركة دائن", "Period Credit", "number", [], false, true), field("closingDebit", "ختامي مدين", "Closing Debit", "number", [], false, true), field("closingCredit", "ختامي دائن", "Closing Credit", "number", [], false, true), field("asOfDate", "حتى تاريخ", "As Of Date", "date", ["التاريخ"], true)]; }
function referenceReportFields() { return [field("lineCode", "كود البند", "Line Code", "text", ["account code"]), field("lineName", "اسم البند", "Line Name", "text", ["account name", "البند"], true), field("period", "الفترة", "Period", "text", ["month", "year"], true), field("amount", "المبلغ", "Amount", "number", ["balance", "value"], true, true), field("comparativeAmount", "المبلغ المقارن", "Comparative Amount", "number", ["previous amount"], false, true), field("notes", "ملاحظات", "Notes", "text", [])]; }

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
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ـ/g, "")
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

export function getImportTarget(key: string) {
  return importTargets.find((target) => target.key === key.toUpperCase()) ?? null;
}

export function suggestImportMapping(headers: string[], target: ImportTargetDefinition) {
  const normalized = headers.map((header) => ({ raw: header, value: normalizeImportHeader(header) }));
  const mapping: Record<string, string> = {};
  for (const targetField of target.fields) {
    const aliases = targetField.aliases.map(normalizeImportHeader).filter(Boolean);
    const ranked = normalized.map((header) => ({ header: header.raw, score: Math.max(...aliases.map((alias) => alias === header.value ? 100 : alias.length >= 3 && (alias.includes(header.value) || header.value.includes(alias)) ? 82 : tokenSimilarity(alias, header.value))) })).sort((a, b) => b.score - a.score);
    if (ranked[0]?.score >= 60 && !Object.values(mapping).includes(ranked[0].header)) mapping[targetField.key] = ranked[0].header;
  }
  return mapping;
}

function tokenSimilarity(left: string, right: string) {
  const tokens = (value: string) => new Set(value.split(/(?=[a-z])|(?=\d)/).filter((token) => token.length > 1));
  const a = tokens(left), b = tokens(right); if (!a.size || !b.size) return 0;
  const intersection = [...a].filter((entry) => b.has(entry)).length;
  return Math.round(intersection / Math.max(a.size, b.size) * 70);
}

export function importHeaderFingerprint(headers: string[]) { return headers.map(normalizeImportHeader).filter(Boolean).sort().join("|"); }

export function normalizeArabicDigits(value: unknown) {
  return String(value ?? "").replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)));
}

export function coerceImportValue(value: unknown, type: ImportFieldType) {
  if (value === null || value === undefined || value === "") return null;
  if (type === "text") return String(value).trim();
  if (type === "number") {
    if (typeof value === "number") return Number.isFinite(value) ? value : null;
    let normalized = normalizeArabicDigits(value).trim().replace(/[٪%]/g, "").replace(/[٬،\s]/g, "").replace(/٫/g, ".").replace(/SAR|ر\.؟س|ريال|USD|EUR|GBP/gi, "");
    const negative = /^\(.*\)$/.test(normalized) || /-$/.test(normalized); normalized = normalized.replace(/[()]/g, "").replace(/-$/, "");
    if (normalized.includes(",") && !normalized.includes(".")) normalized = normalized.replace(",", "."); else normalized = normalized.replace(/,/g, "");
    const parsed = Number(normalized) * (negative ? -1 : 1);
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
  const normalized = normalizeArabicDigits(value).trim();
  const local = normalized.match(/^(\d{1,4})[\/-](\d{1,2})[\/-](\d{1,4})$/);
  const parsed = local ? (local[1].length === 4 ? new Date(Date.UTC(Number(local[1]), Number(local[2]) - 1, Number(local[3]))) : new Date(Date.UTC(Number(local[3]), Number(local[2]) - 1, Number(local[1])))) : new Date(normalized);
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
