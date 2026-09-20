import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import * as XLSX from "@stackline/xlsx";

const DATABASE_URL = process.env.DATABASE_URL ?? "file:./prisma/netaj.db";
const TENANT_ID = 1;
const COMPANY_ID = 1;
const BATCH_NUMBER = "NETAJ-LEGACY-20260919-V1";
const IMPORTED_BY = "NETAJ legacy migration";
const EXECUTE = process.argv.includes("--execute");
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DATABASE_URL }) });

const sources = {
  comprehensive: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/B6E2B77C-2E0D-4E1D-800A-45BEAB29939B/أكسيل شامل 19-9-2026م.xlsx",
  journal: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/5059352D-C63B-4679-A4A2-EF3B9E962543/القيود اليومية.xlsx",
  trial: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/8B034DD7-7639-4AAC-8119-78D1BC3D650A/ميزان المراجعة كما في 19-9-2026م.xlsx",
  customers: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/CB858127-EEC5-403C-AB5C-D6EB9138B2EB/تقرير العملاء بتاريخ 19-9-2026م.xlsx",
  suppliers: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/753C6DA1-A5C4-4F9E-8A23-A77DA16035B7/تقرير الموردين بتاريخ 19-9-2026م.xlsx",
  sales: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/EC3C46EA-2362-4B8B-9888-C1EFA9EF404A/تقرير المبيعات من 1-1-إلى 19-9-2026م.xlsx",
  purchases: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/651763A1-B5B7-4D23-9334-777554D66904/تقرير المشتريات بتاريخ 19-9-2026م.xlsx",
  salesVat: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/6D900152-41E7-406D-A1C3-E5D9416C440D/ضريبة المبيعات بتاريخ 19-9-2026م.xlsx",
  purchaseVat: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/72FEFEF5-3090-42F2-A2A4-8976ED8CEC15/ضريبة المشتريات بتاريخ 19-9-2026م.xlsx",
  receipts: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/F72BCD4F-1ED7-4ABF-891B-6C615EDA2CED/سندات القبض بتاريخ 19-9-2026م.xlsx",
  bankAhli: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/8150D534-5F84-465C-B134-3CC7D52E295F/كشف حساب البنك الأهلي بتاريخ 19-9-2026م.xlsx",
  bankBilad: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/57C2824D-1218-4695-883D-4F3C12754361/كشف بنك البلاد بتاريخ 19-9-2026م.xlsx",
  cashJeddah: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/2670B45C-6C84-4F57-8463-7071B12F611B/صندوق جدة 2026.xlsx",
  income: "/Users/bilalhashlamoun/Library/Containers/net.whatsapp.WhatsApp/Data/tmp/documents/26FA0786-A7F8-413D-927F-06462BAD6A2E/قائمة الدخل للسنة المالية  2026  .xlsx",
};

const clean = (value) => String(value ?? "").trim();
const amount = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const normalized = clean(value).replace(/[٬،\s]/g, "").replace(/٫/g, ".").replace(/,/g, "").replace(/[()]/g, "");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
};
const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const validDate = (value) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};
const normalize = (value) => clean(value).normalize("NFKD").replace(/[\u064B-\u065F\u0670]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ـ/g, "").replace(/[^\p{L}\p{N}]+/gu, "").toLowerCase();
const fileHash = (path) => createHash("sha256").update(readFileSync(path)).digest("hex");
const sourceManifestHash = createHash("sha256").update(Object.values(sources).map(fileHash).join("|")).digest("hex");

function workbook(path) {
  return XLSX.read(readFileSync(path), { type: "buffer", cellDates: true, raw: true, dense: true });
}

function matrix(book, sheetName = book.SheetNames[0], maxCols = 100) {
  const sheet = book.Sheets[sheetName];
  const ref = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true, range: { s: { r: 0, c: 0 }, e: { r: ref.e.r, c: Math.min(ref.e.c, maxCols - 1) } } });
}

function parseTrialBalance() {
  const book = workbook(sources.trial);
  return matrix(book).slice(2).map((row, index) => ({
    sourceRow: index + 3,
    code: clean(row[0]), name: clean(row[1]), openingDebit: amount(row[2]), openingCredit: amount(row[3]),
    periodDebit: amount(row[4]), periodCredit: amount(row[5]), closingDebit: amount(row[6]), closingCredit: amount(row[7]),
  })).filter((row) => row.code && row.name);
}

function parseJournal() {
  const rows = matrix(workbook(sources.journal), undefined, 13).slice(1);
  const entries = [];
  let current = null;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (clean(row[0])) {
      current = { number: clean(row[0]), date: validDate(row[1]), branch: clean(row[2]), type: clean(row[3]), entryType: clean(row[4]), reference: clean(row[5]), status: clean(row[12]), sourceRow: index + 2, lines: [] };
      entries.push(current);
    }
    const accountText = clean(row[6]);
    if (!current || !accountText) continue;
    const match = accountText.match(/\(([^()]*)\)\s*$/);
    current.lines.push({ sourceRow: index + 2, accountCode: clean(match?.[1]), accountName: match ? accountText.slice(0, match.index).trim() : accountText, debit: amount(row[7]), credit: amount(row[8]), costCenter: clean(row[9]), notes: clean(row[10]) });
  }
  return entries.filter((entry) => entry.number && entry.date && entry.lines.some((line) => line.accountCode));
}

function parsePartyFile(path, role) {
  return matrix(workbook(path), undefined, 12).slice(2).map((row, index) => ({
    sourceRow: index + 3, code: clean(row[0]), name: clean(row[1]), phone: clean(row[2]), city: clean(row[3]), role,
    opening: amount(row[role === "CUSTOMER" ? 6 : 5]), debit: amount(row[role === "CUSTOMER" ? 8 : 7]), credit: amount(row[role === "CUSTOMER" ? 9 : 8]), balance: amount(row[role === "CUSTOMER" ? 10 : 9]),
  })).filter((row) => row.code && row.name);
}

function accountType(code) {
  if (/^(201|202)/.test(code)) return "EQUITY";
  if (code.startsWith("1")) return "ASSET";
  if (code.startsWith("2")) return "LIABILITY";
  if (/^[35]/.test(code)) return "EXPENSE";
  if (/^[46]/.test(code)) return "REVENUE";
  return "ASSET";
}

function itemCode(name) {
  const n = normalize(name);
  if (/asphalt6070|اسفلت6070/.test(n)) return "ASPHALT-60-70";
  if (/pg76s10cr/.test(n)) return "PG-76-S10-CR";
  if (/cb001mc1|mc1/.test(n)) return "MC1";
  if (/rc2/.test(n)) return "RC2";
  if (/isolatedbitumen/.test(n)) return "ISOLATED-BITUMEN";
  if (/crudeoil|زيتخام/.test(n)) return "CRUDE-OIL";
  return `LEGACY-${createHash("sha1").update(clean(name)).digest("hex").slice(0, 10).toUpperCase()}`;
}

function scanOperationalWorkbook() {
  const book = workbook(sources.comprehensive);
  const customerSheets = [];
  const sheetSnapshots = [];
  const itemNames = new Set(["ASPHALT 60-70", "PG 76 S - 10 CR", "CB 001 MC 1", "CRUDE OIL", "ISOLATED BITUMEN"]);
  for (const sheetName of book.SheetNames) {
    const rows = matrix(book, sheetName, 100);
    const trimmed = rows.map((row) => {
      let end = row.length - 1;
      while (end >= 0 && !clean(row[end])) end -= 1;
      return row.slice(0, end + 1);
    }).filter((row) => row.some((value) => clean(value)));
    sheetSnapshots.push({ sheetName, rows: trimmed, rowCount: trimmed.length });
    const first = rows.slice(0, 8).flat().map(clean);
    const customerLabel = first.find((value) => /^customer\s*name\s*:/i.test(value));
    const headerIndex = rows.findIndex((row) => row.some((value) => /^(date|التاريخ)$/i.test(clean(value))) && row.some((value) => /document|السند/i.test(clean(value))));
    if (!customerLabel || headerIndex < 0) continue;
    const headers = rows[headerIndex].map((value) => clean(value).toLowerCase());
    const dateIndex = headers.findIndex((value) => /^(date|التاريخ)$/.test(value));
    const documentIndex = headers.findIndex((value) => /document|السند/.test(value));
    const productIndexes = headers.map((value, index) => /product|المادة/.test(value) ? index : -1).filter((index) => index >= 0);
    const receiptIndex = headers.findIndex((value) => /receipts|الوارد/.test(value));
    const issueIndex = headers.findIndex((value) => /issues|الصادر/.test(value));
    const balanceIndex = headers.findIndex((value) => /balance|الرصيد/.test(value));
    const rateIndex = headers.findIndex((value) => /rate|سعر/.test(value));
    const movements = [];
    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex], date = validDate(row[dateIndex]), document = clean(row[documentIndex]);
      const quantityIn = Math.abs(amount(row[receiptIndex])), quantityOut = Math.abs(amount(row[issueIndex]));
      if (!date || (!quantityIn && !quantityOut && !/opening balance/i.test(document))) continue;
      let product = productIndexes.map((index) => clean(row[index])).find(Boolean);
      if (!product) product = rows.slice(headerIndex, Math.min(rows.length, headerIndex + 3)).flatMap((candidate) => productIndexes.map((index) => clean(candidate[index]))).find((value) => value && !/product|quantity/i.test(value));
      if (!product) product = "ASPHALT 60-70";
      itemNames.add(product);
      movements.push({ sourceRow: rowIndex + 1, date, document: document || `ROW-${rowIndex + 1}`, product, quantityIn, quantityOut, sourceBalance: amount(row[balanceIndex]), rate: amount(row[rateIndex]) });
    }
    if (movements.length) customerSheets.push({ sheetName, customerName: customerLabel.replace(/^customer\s*name\s*:\s*/i, "").trim() || sheetName, movements });
  }
  return { book, customerSheets, sheetSnapshots, itemNames: [...itemNames] };
}

function parseCompanyStock(book) {
  const rows = matrix(book, "الخام", 35);
  return rows.slice(2).map((row, index) => ({ sourceRow: index + 3, date: validDate(row[1]), document: clean(row[2]), party: clean(row[3]), product: clean(row[4]) || "ASPHALT 60-70", quantityIn: Math.abs(amount(row[5])), quantityOut: Math.abs(amount(row[6])), sourceBalance: amount(row[7]), purchaseRate: amount(row[8]), inwardTransportRate: amount(row[10]), saleRate: amount(row[12]), driver: clean(row[17]) })).filter((row) => row.date && (row.quantityIn || row.quantityOut || /opening balance/i.test(row.document)));
}

function parseControlReport(path) {
  const book = workbook(path), rows = matrix(book, undefined, 20);
  let debit = 0, credit = 0, closing = 0;
  for (const row of rows.slice(2)) { debit += amount(row[6]); credit += amount(row[7]); if (clean(row[8])) closing = amount(row[8]); }
  return { sheet: book.SheetNames[0], rows: rows.length, debit: round(debit), credit: round(credit), closing: round(closing), sample: rows.slice(0, 8) };
}

const trial = parseTrialBalance();
const journals = parseJournal();
const customers = parsePartyFile(sources.customers, "CUSTOMER");
const suppliers = parsePartyFile(sources.suppliers, "SUPPLIER");
const operational = scanOperationalWorkbook();
const companyMovements = parseCompanyStock(operational.book);
const unbalanced = journals.map((entry) => ({ number: entry.number, difference: round(entry.lines.reduce((sum, line) => sum + line.debit - line.credit, 0)) })).filter((entry) => entry.difference !== 0);
const controls = Object.fromEntries(Object.entries(sources).filter(([key]) => !["comprehensive", "journal", "trial", "customers", "suppliers", "income", "receipts"].includes(key)).map(([key, path]) => [key, parseControlReport(path)]));
const ahliTrial = trial.find((row) => row.code === "1030110");
const excludedAhli = controls.bankAhli.closing === 4840.41
  && round((ahliTrial?.closingDebit ?? 0) - (ahliTrial?.closingCredit ?? 0)) === 364840.41
  && !journals.some((entry) => entry.number === "20260002237");

const dryRun = {
  execute: EXECUTE,
  sourceFiles: Object.keys(sources).length,
  accounts: trial.length,
  journalEntries: journals.length,
  journalLines: journals.reduce((sum, entry) => sum + entry.lines.length, 0),
  roundingAdjustments: unbalanced.length,
  roundingNet: round(unbalanced.reduce((sum, row) => sum + row.difference, 0)),
  customers: customers.length,
  suppliers: suppliers.length,
  items: operational.itemNames.length,
  companyStockMovements: companyMovements.length,
  partyStockSheets: operational.customerSheets.length,
  partyStockMovements: operational.customerSheets.reduce((sum, sheet) => sum + sheet.movements.length, 0),
  referenceSheets: operational.sheetSnapshots.length,
  excludedNationalBankTransfer360000: excludedAhli,
  controlBalances: Object.fromEntries(Object.entries(controls).map(([key, value]) => [key, value.closing])),
};

console.log(JSON.stringify({ stage: "DRY_RUN", ...dryRun }, null, 2));
if (!EXECUTE) {
  await prisma.$disconnect();
  process.exit(0);
}
if (!excludedAhli) throw new Error("تعذر إثبات استبعاد حوالة البنك الأهلي 360,000؛ أوقف الاستيراد");

const existingBatch = await prisma.importBatch.findUnique({ where: { batchNumber: BATCH_NUMBER } });
if (existingBatch?.status === "COMPLETED") {
  console.log(JSON.stringify({ stage: "ALREADY_COMPLETED", batchId: existingBatch.id }));
  await prisma.$disconnect();
  process.exit(0);
}

const sourceSystem = await prisma.legacySourceSystem.upsert({
  where: { tenantId_companyId_code: { tenantId: TENANT_ID, companyId: COMPANY_ID, code: "NETAJ-LEGACY-XLSX" } },
  update: { name: "NETAj legacy Excel workbooks", detectionJson: JSON.stringify({ files: Object.values(sources).map((path) => basename(path)), manifestHash: sourceManifestHash }) },
  create: { tenantId: TENANT_ID, companyId: COMPANY_ID, code: "NETAJ-LEGACY-XLSX", name: "NETAj legacy Excel workbooks", vendor: "Legacy Excel", description: "Verified migration from the supplied NETAj workbooks", detectionJson: JSON.stringify({ files: Object.values(sources).map((path) => basename(path)), manifestHash: sourceManifestHash }), createdBy: IMPORTED_BY },
});

const batch = existingBatch ?? await prisma.importBatch.create({ data: {
  tenantId: TENANT_ID, companyId: COMPANY_ID, batchNumber: BATCH_NUMBER, targetType: "NETAJ_FULL_VERIFIED", importMode: "FULL", duplicateStrategy: "SKIP", sourceSystemId: sourceSystem.id,
  legacySystem: "NETAJ LEGACY EXCEL", sourceFile: `${Object.keys(sources).length} verified XLSX files`, fileHash: sourceManifestHash, status: "RUNNING", cutoverDate: new Date("2026-09-19T23:59:59+03:00"),
  mappingJson: JSON.stringify({ accountingSource: "القيود اليومية.xlsx", controls: Object.values(sources).filter((path) => path !== sources.journal).map((path) => basename(path)), excluded: ["20260002237 / 360000 SAR"] }),
  sheetsJson: JSON.stringify(operational.sheetSnapshots.map((sheet) => ({ name: sheet.sheetName, rows: sheet.rowCount }))), summaryJson: JSON.stringify(dryRun), totalRows: dryRun.journalEntries + dryRun.companyStockMovements + dryRun.partyStockMovements, validRows: dryRun.journalEntries + dryRun.companyStockMovements + dryRun.partyStockMovements,
  createdBy: IMPORTED_BY, dryRunAt: new Date(), approvedAt: new Date(), approvedBy: IMPORTED_BY,
} });

const provenance = async (sourceSheet, sourceRow, raw, entityType, entityId, legacyCode, legacyDocumentNumber, sourceFile = basename(sources.journal)) => {
  const row = await prisma.importRow.upsert({
    where: { importBatchId_sourceSheet_sourceRow: { importBatchId: batch.id, sourceSheet, sourceRow } },
    update: { mappedDataJson: JSON.stringify(raw), status: "IMPORTED", entityType, entityId, operation: "CREATE", importedAt: new Date() },
    create: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id, sourceSheet, sourceRow, rawDataJson: JSON.stringify(raw), mappedDataJson: JSON.stringify(raw), status: "IMPORTED", entityType, entityId, operation: "CREATE", importedAt: new Date() },
  });
  await prisma.legacyRecordLink.upsert({
    where: { importRowId: row.id },
    update: { entityType, entityId, legacyCode, legacyDocumentNumber, sourceFile, sourceSheet, sourceRow },
    create: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id, importRowId: row.id, entityType, entityId, legacySource: "NETAJ_VERIFIED_MIGRATION", legacySystem: "NETAJ LEGACY EXCEL", legacyCode, legacyDocumentNumber, sourceFile, sourceSheet, sourceRow, importedBy: IMPORTED_BY, wasCreated: true },
  });
};

const usedAccountCodes = new Set(journals.flatMap((entry) => entry.lines.map((line) => line.accountCode)));
const allAccountCodes = trial.map((row) => row.code);
const accountByCode = new Map();
for (const row of [...trial].sort((left, right) => left.code.length - right.code.length)) {
  const parentCode = allAccountCodes.filter((code) => code.length < row.code.length && row.code.startsWith(code)).sort((left, right) => right.length - left.length)[0];
  const record = await prisma.account.upsert({ where: { code: row.code }, update: { nameAr: row.name, accountType: accountType(row.code), parentId: parentCode ? accountByCode.get(parentCode)?.id ?? null : null, allowPosting: usedAccountCodes.has(row.code) }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, code: row.code, nameAr: row.name, accountType: accountType(row.code), parentId: parentCode ? accountByCode.get(parentCode)?.id ?? null : null, allowPosting: usedAccountCodes.has(row.code) } });
  accountByCode.set(row.code, record);
}
const roundingAccount = await prisma.account.upsert({ where: { code: "5999999999" }, update: { nameAr: "فروقات تقريب الترحيل التاريخي", nameEn: "Legacy migration rounding", accountType: "EXPENSE", allowPosting: true }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, code: "5999999999", nameAr: "فروقات تقريب الترحيل التاريخي", nameEn: "Legacy migration rounding", accountType: "EXPENSE", allowPosting: true } });
accountByCode.set(roundingAccount.code, roundingAccount);

const partiesByAccount = new Map();
const partiesByName = new Map();
const allParties = [...customers, ...suppliers];
for (const source of allParties) {
  const nameKey = normalize(source.name);
  let party = partiesByName.get(nameKey) ?? await prisma.party.findFirst({ where: { OR: [{ unifiedNumber: source.code }, { nameAr: source.name }] } });
  const isCustomer = source.role === "CUSTOMER" || Boolean(party?.isCustomer), isSupplier = source.role === "SUPPLIER" || Boolean(party?.isSupplier);
  if (party) party = await prisma.party.update({ where: { id: party.id }, data: { nameAr: party.nameAr || source.name, telephone: party.telephone || source.phone || null, isCustomer, isSupplier } });
  else party = await prisma.party.create({ data: { tenantId: TENANT_ID, companyId: COMPANY_ID, nameAr: source.name, unifiedNumber: source.code, telephone: source.phone || null, isCustomer, isSupplier, notes: "مرحل من تقارير العملاء والموردين بتاريخ 19-09-2026" } });
  if (source.city) await prisma.partyAddress.upsert({ where: { partyId: party.id }, update: { city: source.city }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, partyId: party.id, city: source.city } });
  partiesByName.set(nameKey, party); partiesByAccount.set(source.code, party);
}
for (const entry of journals) for (const line of entry.lines) {
  if (!/^(10201\d+|204\d{4,})$/.test(line.accountCode) || partiesByAccount.has(line.accountCode)) continue;
  const role = line.accountCode.startsWith("10201") ? "CUSTOMER" : "SUPPLIER", nameKey = normalize(line.accountName);
  let party = partiesByName.get(nameKey) ?? await prisma.party.findFirst({ where: { nameAr: line.accountName } });
  if (party) party = await prisma.party.update({ where: { id: party.id }, data: { isCustomer: role === "CUSTOMER" || party.isCustomer, isSupplier: role === "SUPPLIER" || party.isSupplier } });
  else party = await prisma.party.create({ data: { tenantId: TENANT_ID, companyId: COMPANY_ID, nameAr: line.accountName, unifiedNumber: line.accountCode, isCustomer: role === "CUSTOMER", isSupplier: role === "SUPPLIER", notes: "مرحل من حساب طرف مستخدم في القيود اليومية" } });
  partiesByName.set(nameKey, party); partiesByAccount.set(line.accountCode, party);
}
const cashCustomer = await prisma.party.upsert({ where: { unifiedNumber: "LEGACY-CASH-CUSTOMER" }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, nameAr: "عميل نقدي تاريخي", nameEn: "Legacy cash customer", unifiedNumber: "LEGACY-CASH-CUSTOMER", isCustomer: true } });
const cashSupplier = await prisma.party.upsert({ where: { unifiedNumber: "LEGACY-CASH-SUPPLIER" }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, nameAr: "مورد نقدي تاريخي", nameEn: "Legacy cash supplier", unifiedNumber: "LEGACY-CASH-SUPPLIER", isSupplier: true } });

const unit = await prisma.unit.upsert({ where: { code: "TON" }, update: { nameAr: "طن", nameEn: "Ton" }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, code: "TON", nameAr: "طن", nameEn: "Ton" } });
const itemByName = new Map();
for (const name of operational.itemNames) {
  const code = itemCode(name), item = await prisma.item.upsert({ where: { code }, update: { isActive: true }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, code, nameAr: clean(name), nameEn: /[A-Za-z]/.test(name) ? clean(name) : null, unitId: unit.id, vatRate: 15 } });
  itemByName.set(normalize(name), item);
}
const resolveItem = async (name) => {
  const key = normalize(name), known = itemByName.get(key); if (known) return known;
  const code = itemCode(name), item = await prisma.item.upsert({ where: { code }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, code, nameAr: clean(name), nameEn: /[A-Za-z]/.test(name) ? clean(name) : null, unitId: unit.id, vatRate: 15 } }); itemByName.set(key, item); return item;
};

for (const entry of journals) {
  if (entry.number === "20260002237") throw new Error("الحركة المستبعدة 360,000 ظهرت في ملف القيود على خلاف التحليل");
  let journal = await prisma.journalEntry.findUnique({ where: { entryNumber: entry.number } });
  if (!journal) {
    const sourceDebit = round(entry.lines.reduce((sum, line) => sum + line.debit, 0)), sourceCredit = round(entry.lines.reduce((sum, line) => sum + line.credit, 0)), difference = round(sourceDebit - sourceCredit);
    const lines = entry.lines.map((line) => { const account = accountByCode.get(line.accountCode); if (!account) throw new Error(`حساب غير موجود ${line.accountCode} في القيد ${entry.number}`); return { tenantId: TENANT_ID, companyId: COMPANY_ID, accountId: account.id, accountCode: account.code, accountName: account.nameAr, debit: line.debit, credit: line.credit, transactionDebit: line.debit, transactionCredit: line.credit, transactionCurrencyCode: "SAR", exchangeRate: 1, partyId: partiesByAccount.get(line.accountCode)?.id ?? null, costCenter: line.costCenter || null, description: line.notes || null }; });
    if (difference !== 0) lines.push({ tenantId: TENANT_ID, companyId: COMPANY_ID, accountId: roundingAccount.id, accountCode: roundingAccount.code, accountName: roundingAccount.nameAr, debit: difference < 0 ? Math.abs(difference) : 0, credit: difference > 0 ? difference : 0, transactionDebit: difference < 0 ? Math.abs(difference) : 0, transactionCredit: difference > 0 ? difference : 0, transactionCurrencyCode: "SAR", exchangeRate: 1, partyId: null, costCenter: null, description: `موازنة فرق تقريب مثبت في المصدر (${difference.toFixed(2)})` });
    const totalDebit = round(lines.reduce((sum, line) => sum + line.debit, 0)), totalCredit = round(lines.reduce((sum, line) => sum + line.credit, 0));
    journal = await prisma.journalEntry.create({ data: { tenantId: TENANT_ID, companyId: COMPANY_ID, entryNumber: entry.number, entryDate: entry.date, description: `قيد تاريخي مرحل — ${entry.type}${entry.branch ? ` — ${entry.branch}` : ""}`, referenceType: "LEGACY_JOURNAL", referenceNumber: entry.reference || entry.number, status: "POSTED", totalDebit, totalCredit, transactionCurrencyCode: "SAR", functionalCurrencyCode: "SAR", exchangeRate: 1, totalTransactionDebit: totalDebit, totalTransactionCredit: totalCredit, postedAt: entry.date, lines: { create: lines } } });
  }
  await provenance("القيود اليومية", entry.sourceRow, entry, "JOURNAL_ENTRY", journal.id, entry.number, entry.reference || entry.number);
}

const journalNumberSet = new Set(journals.map((entry) => entry.number));
const journalRecords = (await prisma.journalEntry.findMany({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID }, include: { lines: true }, orderBy: [{ entryDate: "asc" }, { id: "asc" }] })).filter((entry) => journalNumberSet.has(entry.entryNumber));
const journalByNumber = new Map(journalRecords.map((entry) => [entry.entryNumber, entry]));

for (const source of journals.filter((entry) => entry.type === "المبيعات" || entry.type === "مردودات المبيعات")) {
  const journal = journalByNumber.get(source.number), partyLine = source.lines.find((line) => line.accountCode.startsWith("10201")), party = partyLine ? partiesByAccount.get(partyLine.accountCode) : cashCustomer;
  const subtotal = round(source.lines.filter((line) => line.accountCode.startsWith("401")).reduce((sum, line) => sum + line.credit - line.debit, 0));
  const vatAmount = round(source.lines.filter((line) => line.accountCode === "2050101").reduce((sum, line) => sum + line.credit - line.debit, 0));
  const totalAmount = round(subtotal + vatAmount), invoiceNumber = source.reference || `LEGACY-SALE-${source.number}`;
  const sale = await prisma.sale.upsert({ where: { invoiceNumber }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, invoiceNumber, invoiceDate: source.date, partyId: party.id, referenceNumber: source.number, currency: "SAR", exchangeRate: 1, subtotal, vatAmount, totalAmount, functionalSubtotal: subtotal, functionalVatAmount: vatAmount, functionalTotalAmount: totalAmount, status: source.type === "مردودات المبيعات" ? "CREDITED" : "POSTED", notes: "فاتورة تاريخية مستخرجة من القيد المعتمد؛ حركة المخزون مستقلة" } });
  const linkedSaleJournal = await prisma.journalEntry.findFirst({ where: { referenceType: "SALE", referenceId: sale.id } });
  if (journal?.referenceType === "LEGACY_JOURNAL" && !linkedSaleJournal) await prisma.journalEntry.update({ where: { id: journal.id }, data: { referenceType: "SALE", referenceId: sale.id, referenceNumber: invoiceNumber } });
  await provenance("فواتير المبيعات", source.sourceRow, source, "SALE", sale.id, source.number, invoiceNumber);
}
for (const source of journals.filter((entry) => entry.type === "المشتريات")) {
  const journal = journalByNumber.get(source.number), partyLine = source.lines.find((line) => line.accountCode.startsWith("204") || line.accountCode.startsWith("10201")), party = partyLine ? partiesByAccount.get(partyLine.accountCode) ?? cashSupplier : cashSupplier;
  const subtotal = round(source.lines.filter((line) => line.accountCode.startsWith("301")).reduce((sum, line) => sum + line.debit - line.credit, 0));
  const vatAmount = round(source.lines.filter((line) => line.accountCode === "1020401001").reduce((sum, line) => sum + line.debit - line.credit, 0));
  const totalAmount = round(subtotal + vatAmount), purchaseNumber = source.reference || `LEGACY-PUR-${source.number}`;
  const purchase = await prisma.purchase.upsert({ where: { purchaseNumber }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, purchaseNumber, purchaseDate: source.date, partyId: party.id, referenceNumber: source.number, currency: "SAR", exchangeRate: 1, subtotal, vatAmount, totalAmount, functionalSubtotal: subtotal, functionalVatAmount: vatAmount, functionalTotalAmount: totalAmount, status: "POSTED", notes: "فاتورة تاريخية مستخرجة من القيد المعتمد؛ حركة المخزون مستقلة" } });
  const linkedPurchaseJournal = await prisma.journalEntry.findFirst({ where: { referenceType: "PURCHASE", referenceId: purchase.id } });
  if (journal?.referenceType === "LEGACY_JOURNAL" && !linkedPurchaseJournal) await prisma.journalEntry.update({ where: { id: journal.id }, data: { referenceType: "PURCHASE", referenceId: purchase.id, referenceNumber: purchaseNumber } });
  await provenance("فواتير المشتريات", source.sourceRow, source, "PURCHASE", purchase.id, source.number, purchaseNumber);
}

const bankAccounts = new Map();
for (const row of trial.filter((account) => /^(10301|10303)/.test(account.code) && usedAccountCodes.has(account.code))) {
  const ledger = accountByCode.get(row.code), currency = /دولار|usd/i.test(row.name) ? "USD" : "SAR", openingBalance = round(row.openingDebit - row.openingCredit), currentBalance = round(row.closingDebit - row.closingCredit);
  let bank = await prisma.bankAccount.findFirst({ where: { ledgerAccountId: ledger.id } });
  if (!bank) bank = await prisma.bankAccount.create({ data: { tenantId: TENANT_ID, companyId: COMPANY_ID, name: row.name, bankName: /صندوق/.test(row.name) ? null : row.name, accountNumber: row.code, currency, openingBalance, currentBalance, ledgerAccountId: ledger.id, notes: "رصيد مرحل من ميزان المراجعة؛ لا ينشئ قيدًا إضافيًا" } });
  else bank = await prisma.bankAccount.update({ where: { id: bank.id }, data: { openingBalance, currentBalance } });
  bankAccounts.set(row.code, bank);
}
const runningBalances = new Map([...bankAccounts.keys()].map((code) => [code, 0]));
for (const journal of journalRecords) {
  const source = journals.find((entry) => entry.number === journal.entryNumber);
  for (const code of bankAccounts.keys()) {
    const lines = journal.lines.filter((line) => line.accountCode === code); if (!lines.length) continue;
    const amountIn = round(lines.reduce((sum, line) => sum + Number(line.debit), 0)), amountOut = round(lines.reduce((sum, line) => sum + Number(line.credit), 0)), balanceAfter = round((runningBalances.get(code) ?? 0) + amountIn - amountOut); runningBalances.set(code, balanceAfter);
    const bank = bankAccounts.get(code);
    await prisma.bankTransaction.upsert({ where: { bankAccountId_referenceType_referenceId: { bankAccountId: bank.id, referenceType: "LEGACY_JOURNAL", referenceId: journal.id } }, update: { balanceAfter }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, bankAccountId: bank.id, transactionDate: journal.entryDate, transactionType: source?.type || "LEGACY", amountIn, amountOut, balanceAfter, functionalAmountIn: amountIn, functionalAmountOut: amountOut, functionalBalanceAfter: balanceAfter, exchangeRate: 1, referenceType: "LEGACY_JOURNAL", referenceId: journal.id, referenceNumber: journal.entryNumber, description: source?.lines.find((line) => line.accountCode === code)?.notes || journal.description } });
  }
}
for (const [code, bank] of bankAccounts) await prisma.bankAccount.update({ where: { id: bank.id }, data: { currentBalance: runningBalances.get(code) ?? bank.currentBalance } });

for (const source of journals.filter((entry) => ["سند قبض", "سند صرف"].includes(entry.type))) {
  const journal = journalByNumber.get(source.number), isReceipt = source.type === "سند قبض", bankLine = source.lines.find((line) => bankAccounts.has(line.accountCode)), bank = bankLine ? bankAccounts.get(bankLine.accountCode) : null; if (!journal || !bank || journal.financialVoucher) continue;
  const partyLine = source.lines.find((line) => partiesByAccount.has(line.accountCode)), party = partyLine ? partiesByAccount.get(partyLine.accountCode) : null, value = round(isReceipt ? bankLine.debit : bankLine.credit), voucherNumber = `${isReceipt ? "RCV" : "PAY"}-${source.reference || source.number}`;
  const voucher = await prisma.financialVoucher.upsert({ where: { voucherNumber }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, voucherNumber, voucherType: isReceipt ? "CUSTOMER_RECEIPT" : "SUPPLIER_PAYMENT", voucherDate: source.date, partyId: party?.id ?? null, amount: value, currency: bank.currency, exchangeRate: 1, functionalAmount: value, paymentMethod: "LEGACY", bankAccountId: bank.id, referenceNumber: source.number, description: source.lines.map((line) => line.notes).find(Boolean) || `${source.type} تاريخي`, status: "POSTED", journalEntryId: journal.id, postedAt: source.date, notes: "مرحل من القيد المعتمد دون إنشاء قيد إضافي" } });
  await provenance("السندات المالية", source.sourceRow, source, "FINANCIAL_VOUCHER", voucher.id, source.number, voucherNumber);
}

const companyStates = new Map();
for (const movement of companyMovements) {
  const item = await resolveItem(movement.product), state = companyStates.get(item.id) ?? { balance: 0, average: 0 };
  const isOpening = /opening balance/i.test(movement.document);
  const quantityIn = isOpening && !movement.quantityIn && !movement.quantityOut ? movement.sourceBalance : movement.quantityIn;
  const inputCost = movement.purchaseRate + movement.inwardTransportRate || state.average, inValue = quantityIn * inputCost;
  if (quantityIn) { const priorValue = state.balance * state.average; state.balance += quantityIn; state.average = state.balance ? (priorValue + inValue) / state.balance : 0; }
  if (movement.quantityOut) state.balance -= movement.quantityOut;
  companyStates.set(item.id, state);
  const movementNumber = `LEG-COMP-${movement.sourceRow}`;
  const record = await prisma.stockMovement.upsert({ where: { movementNumber }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, movementNumber, movementDate: movement.date, itemId: item.id, ownershipType: "COMPANY", movementType: isOpening ? "OPENING" : quantityIn ? "LEGACY_IN" : "LEGACY_OUT", quantityIn, quantityOut: movement.quantityOut, unitCost: quantityIn ? inputCost : state.average, totalValue: round((quantityIn || movement.quantityOut) * (quantityIn ? inputCost : state.average)), balanceAfter: round(state.balance), referenceType: "LEGACY_IMPORT", referenceId: batch.id, referenceNumber: movement.document, notes: `${movement.party || ""}${movement.driver ? ` — السائق ${movement.driver}` : ""}`.trim() || null } });
  await provenance("المخزون/الخام", movement.sourceRow, movement, "STOCK_MOVEMENT", record.id, movement.document, movement.document, basename(sources.comprehensive));
  await prisma.companyStock.upsert({ where: { itemId: item.id }, update: { quantity: round(state.balance), averageCost: round(state.average) }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, itemId: item.id, quantity: round(state.balance), averageCost: round(state.average) } });
}

for (const sheet of operational.customerSheets) {
  const key = normalize(sheet.sheetName), candidate = [...partiesByName.entries()].find(([name]) => name.includes(key) || key.includes(name.slice(0, Math.min(name.length, 10))))?.[1];
  let party = candidate ?? partiesByName.get(normalize(sheet.customerName));
  if (!party) party = await prisma.party.create({ data: { tenantId: TENANT_ID, companyId: COMPANY_ID, nameAr: sheet.sheetName, nameEn: sheet.customerName, unifiedNumber: `LEGACY-STOCK-${createHash("sha1").update(sheet.sheetName).digest("hex").slice(0, 10).toUpperCase()}`, isCustomer: true, notes: "عميل مخزون أمانة مرحل من بطاقة الصنف" } });
  let balances = new Map();
  for (const movement of sheet.movements) {
    const item = await resolveItem(movement.product), isOpening = /opening balance/i.test(movement.document), quantityIn = isOpening && !movement.quantityIn && !movement.quantityOut ? movement.sourceBalance : movement.quantityIn, current = balances.get(item.id) ?? 0, next = round(current + quantityIn - movement.quantityOut); balances.set(item.id, next);
    const movementNumber = `LEG-PARTY-${createHash("sha1").update(`${sheet.sheetName}|${movement.sourceRow}|${movement.document}`).digest("hex").slice(0, 16).toUpperCase()}`;
    const record = await prisma.stockMovement.upsert({ where: { movementNumber }, update: {}, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, movementNumber, movementDate: movement.date, itemId: item.id, partyId: party.id, ownershipType: "PARTY", movementType: isOpening ? "OPENING" : quantityIn ? "LEGACY_IN" : "LEGACY_OUT", quantityIn, quantityOut: movement.quantityOut, unitCost: movement.rate, totalValue: round((quantityIn || movement.quantityOut) * movement.rate), balanceAfter: next, referenceType: "LEGACY_IMPORT", referenceId: batch.id, referenceNumber: movement.document, notes: `مرحل من بطاقة ${sheet.sheetName}` } });
    await provenance(`مخزون العملاء/${sheet.sheetName}`, movement.sourceRow, movement, "STOCK_MOVEMENT", record.id, movement.document, movement.document, basename(sources.comprehensive));
    await prisma.partyStockAccount.upsert({ where: { partyId_itemId: { partyId: party.id, itemId: item.id } }, update: { quantity: next, averageValue: movement.rate || undefined }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, partyId: party.id, itemId: item.id, quantity: next, averageValue: movement.rate } });
    if (movement.rate > 0) await prisma.partyStockValuationRate.upsert({ where: { partyId_itemId_effectiveAt: { partyId: party.id, itemId: item.id, effectiveAt: movement.date } }, update: { unitValue: movement.rate }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, partyId: party.id, itemId: item.id, effectiveAt: movement.date, unitValue: movement.rate, currency: "SAR", notes: "قيمة تاريخية من بطاقة العميل", createdBy: IMPORTED_BY } });
  }
}

for (let index = 0; index < operational.sheetSnapshots.length; index += 1) {
  const snapshot = operational.sheetSnapshots[index], sourceSheet = `مرجع شامل/${snapshot.sheetName}`, sourceRow = 1;
  const row = await prisma.importRow.upsert({ where: { importBatchId_sourceSheet_sourceRow: { importBatchId: batch.id, sourceSheet, sourceRow } }, update: { status: "IMPORTED", operation: "REFERENCE", importedAt: new Date() }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id, sourceSheet, sourceRow, rawDataJson: JSON.stringify({ sheet: snapshot.sheetName, rows: snapshot.rowCount }), mappedDataJson: JSON.stringify({ sheet: snapshot.sheetName, rows: snapshot.rowCount }), status: "IMPORTED", operation: "REFERENCE", importedAt: new Date() } });
  await prisma.legacyReferenceSnapshot.upsert({ where: { importRowId: row.id }, update: { dataJson: JSON.stringify({ sourceFile: basename(sources.comprehensive), sheet: snapshot.sheetName, rowCount: snapshot.rowCount, rows: snapshot.rows }) }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id, importRowId: row.id, reportType: "NETAJ_COMPREHENSIVE_SHEET", snapshotDate: new Date("2026-09-19T23:59:59+03:00"), legacyCode: snapshot.sheetName, dataJson: JSON.stringify({ sourceFile: basename(sources.comprehensive), sheet: snapshot.sheetName, rowCount: snapshot.rowCount, rows: snapshot.rows }), importedBy: IMPORTED_BY } });
}

for (const [key, path] of Object.entries(sources).filter(([name]) => name !== "comprehensive")) {
  const fallbackReport = key === "journal" ? { entries: journals.length, lines: dryRun.journalLines } : { rows: matrix(workbook(path), undefined, 20) };
  const sourceSheet = `مرجع ملف/${key}`, report = key === "journal" ? fallbackReport : key === "trial" ? { accounts: trial.length } : key === "customers" ? { parties: customers.length } : key === "suppliers" ? { parties: suppliers.length } : controls[key] ?? fallbackReport;
  const row = await prisma.importRow.upsert({ where: { importBatchId_sourceSheet_sourceRow: { importBatchId: batch.id, sourceSheet, sourceRow: 1 } }, update: { status: "IMPORTED", operation: "REFERENCE", importedAt: new Date() }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id, sourceSheet, sourceRow: 1, rawDataJson: JSON.stringify(report), mappedDataJson: JSON.stringify(report), status: "IMPORTED", operation: "REFERENCE", importedAt: new Date() } });
  await prisma.legacyReferenceSnapshot.upsert({ where: { importRowId: row.id }, update: { dataJson: JSON.stringify({ sourceFile: basename(path), fileHash: fileHash(path), ...report }) }, create: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id, importRowId: row.id, reportType: `NETAJ_SOURCE_${key.toUpperCase()}`, snapshotDate: new Date("2026-09-19T23:59:59+03:00"), legacyCode: key, dataJson: JSON.stringify({ sourceFile: basename(path), fileHash: fileHash(path), ...report }), importedBy: IMPORTED_BY } });
}

const totals = {
  parties: await prisma.party.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), accounts: await prisma.account.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), journals: await prisma.journalEntry.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), journalLines: await prisma.journalEntryLine.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), sales: await prisma.sale.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), purchases: await prisma.purchase.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), vouchers: await prisma.financialVoucher.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), bankTransactions: await prisma.bankTransaction.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), stockMovements: await prisma.stockMovement.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID } }), referenceSnapshots: await prisma.legacyReferenceSnapshot.count({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID, importBatchId: batch.id } }),
};
const gl = await prisma.journalEntry.aggregate({ where: { tenantId: TENANT_ID, companyId: COMPANY_ID, status: "POSTED" }, _sum: { totalDebit: true, totalCredit: true } });
const reconciliation = { ...totals, totalDebit: Number(gl._sum.totalDebit ?? 0), totalCredit: Number(gl._sum.totalCredit ?? 0), balanced: Math.abs(Number(gl._sum.totalDebit ?? 0) - Number(gl._sum.totalCredit ?? 0)) < 0.01, nationalBankBookBalance: Number((await prisma.bankAccount.findFirst({ where: { ledgerAccount: { code: "1030110" } } }))?.currentBalance ?? 0), excludedNationalBankTransfer360000: true, purchaseDifference236000: "PO/0817 imported from journal; income statement retained as reference discrepancy", roundingAdjustments: unbalanced.length, roundingNet: dryRun.roundingNet };
await prisma.importBatch.update({ where: { id: batch.id }, data: { status: "COMPLETED", createdRows: Object.values(totals).reduce((sum, value) => sum + value, 0), executedAt: new Date(), reconciliationJson: JSON.stringify(reconciliation), impactJson: JSON.stringify(dryRun), rollbackStatus: "BLOCKED", rollbackBlockedReason: "الدفعة مترابطة مع دفتر الأستاذ والمستندات التاريخية؛ الاسترجاع الآمن يتم من النسخة الاحتياطية المؤرخة فقط" } });

console.log(JSON.stringify({ stage: "COMPLETED", batchId: batch.id, reconciliation }, null, 2));
await prisma.$disconnect();
