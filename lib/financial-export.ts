type Cell = string | number | null | undefined;
export type ReportTable = { title: string; subtitle?: string; columns: string[]; rows: Cell[][] };

const titles: Record<string, string> = {
  "profit-and-loss": "قائمة الدخل", "balance-sheet": "المركز المالي", "cash-flow": "قائمة التدفقات النقدية",
  "changes-in-equity": "التغيرات في حقوق الملكية", "trial-balance": "ميزان المراجعة", "general-ledger": "دفتر الأستاذ",
  "account-statement": "كشف الحساب", "ar-aging": "أعمار ذمم العملاء", "ap-aging": "أعمار ذمم الموردين",
  vat: "ضريبة القيمة المضافة", "budget-vs-actual": "الميزانية مقابل الفعلي",
};
const number = (value: unknown) => typeof value === "number" ? value : Number(value ?? 0);

export function toReportTable(report: string, data: unknown, subtitle?: string): ReportTable {
  const value = data as Record<string, unknown>;
  const title = titles[report] ?? report;
  if (report === "trial-balance") {
    const totals = (value.totals ?? {}) as Record<string, unknown>;
    const rows: Cell[][] = ((value.rows ?? []) as Array<Record<string, unknown>>).map(row => [String(row.code), String(row.name), number(row.openingDebit), number(row.openingCredit), number(row.debit), number(row.credit), number(row.closingDebit ?? Math.max(number(row.balance), 0)), number(row.closingCredit ?? Math.max(-number(row.balance), 0))]);
    if (value.totals) rows.push(["", "الإجمالي", number(totals.openingDebit), number(totals.openingCredit), number(totals.debit), number(totals.credit), number(totals.closingDebit), number(totals.closingCredit)]);
    return { title, subtitle, columns: ["رقم الحساب", "اسم الحساب", "أول المدة مدين", "أول المدة دائن", "الحركة مدين", "الحركة دائن", "آخر المدة مدين", "آخر المدة دائن"], rows };
  }
  if (report === "general-ledger") return { title, subtitle, columns: ["التاريخ", "القيد", "المرجع", "الحساب", "البيان", "عملة الحركة", "مدين أجنبي", "دائن أجنبي", "مدين وظيفي", "دائن وظيفي", "رصيد الحساب"], rows: (data as Array<Record<string, unknown>>).map((row) => [date(row.date), row.entryNumber as Cell, row.referenceNumber as Cell, row.accountCode as Cell, row.description as Cell, row.transactionCurrency as Cell, number(row.transactionDebit), number(row.transactionCredit), number(row.debit), number(row.credit), number(row.balance)]) };
  if (report === "account-statement") return { title, subtitle, columns: ["التاريخ", "القيد", "المرجع", "البيان", "مدين", "دائن", "الرصيد"], rows: [["", "", "", "رصيد أول المدة", null, null, number(value.openingBalance)], ...((value.rows ?? []) as Array<Record<string, unknown>>).map((row) => [date(row.date), row.entryNumber as Cell, row.referenceNumber as Cell, row.description as Cell, number(row.debit), number(row.credit), number(row.balance)]), ["", "", "", "رصيد آخر المدة", null, null, number(value.closingBalance)]] };
  if (report === "ar-aging" || report === "ap-aging") return { title, subtitle, columns: ["المستند", "الجهة", "تاريخ الفاتورة", "الاستحقاق", "الإجمالي", "المسدد", "المتبقي", "أيام التأخر", "فئة التأخر"], rows: ((value.items ?? []) as Array<Record<string, unknown>>).map((row) => [row.number as Cell, row.partyName as Cell, date(row.invoiceDate), date(row.dueDate), number(row.total), number(row.paid), number(row.outstanding), number(row.ageDays), row.bucket as Cell]) };
  if (report === "cash-flow") {
    const categories: Record<string, string> = { OPERATING: "التشغيل", INVESTING: "الاستثمار", FINANCING: "التمويل", UNCLASSIFIED: "غير مصنف", OPENING: "تسوية افتتاحية", EXCHANGE: "فروق الصرف" };
    const totals = (value.totals ?? {}) as Record<string, unknown>;
    const rows: Cell[][] = ((value.rows ?? []) as Array<Record<string, unknown>>).map(row => [date(row.transactionDate), categories[String(row.category)] ?? String(row.category), row.entryNumber as Cell, row.accountName as Cell, row.description as Cell, number(row.amountIn), number(row.amountOut)]);
    for (const [key, label] of [["openingCash", "النقد أول المدة"], ["operating", "صافي التشغيل"], ["investing", "صافي الاستثمار"], ["financing", "صافي التمويل"], ["unclassified", "تدفقات تحتاج تصنيفًا"], ["net", "صافي التدفق النقدي"], ["openingAdjustments", "تسويات الأرصدة الافتتاحية"], ["exchangeDifferences", "أثر فروق الصرف"], ["closingCash", "النقد آخر المدة"]]) rows.push(["", label, "", "", "", number(totals[key]), null]);
    return { title, subtitle, columns: ["التاريخ", "النشاط", "القيد", "الحساب المقابل", "البيان", "داخل", "خارج"], rows };
  }
  if (report === "changes-in-equity") {
    const totals = (value.totals ?? {}) as Record<string, unknown>;
    const rows: Cell[][] = ((value.rows ?? []) as Array<Record<string, unknown>>).map(row => [row.code as Cell, row.name as Cell, number(row.opening), number(row.directChanges), number(row.closingBeforeProfit)]);
    rows.push(["", "أرباح أول المدة غير المقفلة", number(totals.openingUnclosedProfit), null, null], ["", "صافي ربح الفترة", null, number(totals.currentProfit), null], ["", "الإجمالي شامل الأرباح", number(totals.openingEquity), number(totals.directChanges) + number(totals.currentProfit), number(totals.closingEquity)]);
    return { title, subtitle, columns: ["رقم الحساب", "الحساب", "أول المدة", "التغيرات", "آخر المدة"], rows };
  }
  if (report === "vat") return { title, subtitle, columns: ["التاريخ", "القيد", "الحساب", "مدين", "دائن"], rows: ((value.lines ?? []) as Array<Record<string, unknown>>).map((row) => [date(row.date), row.entryNumber as Cell, row.accountName as Cell, number(row.debit), number(row.credit)]) };
  if (report === "budget-vs-actual") return { title, subtitle, columns: ["رقم الحساب", "الحساب", "الفترة", "مركز التكلفة", "الإدارة", "المشروع", "المخطط", "الفعلي", "الانحراف", "الانحراف %"], rows: ((value.rows ?? []) as Array<Record<string, unknown>>).map((row) => [row.accountCode as Cell, row.accountName as Cell, row.periodName as Cell, row.costCenter as Cell, row.department as Cell, row.projectCode as Cell, number(row.budget), number(row.actual), number(row.varianceAmount), row.variancePercent == null ? null : number(row.variancePercent)]) };
  if (report === "profit-and-loss" || report === "balance-sheet") {
    const source = report === "profit-and-loss" ? value.profitAndLoss as Record<string, unknown> : value.balanceSheet as Record<string, unknown>;
    const groups = report === "profit-and-loss" ? ["revenueAccounts", "expenseAccounts"] : ["assetAccounts", "liabilityAccounts", "equityAccounts"];
    const rows = groups.flatMap((key) => ((source[key] ?? []) as Array<Record<string, unknown>>).map((row) => [row.code as Cell, row.name as Cell, String(row.type), number(row.reportAmount)]));
    if (report === "profit-and-loss") {
      rows.push(["", "إجمالي الإيرادات", "TOTAL", number(source.revenue)], ["", "إجمالي المصروفات", "TOTAL", number(source.expenses)], ["", "صافي الربح / الخسارة", "TOTAL", number(source.netProfit)]);
    } else rows.push(["", "إجمالي الأصول", "TOTAL", number(source.assets)], ["", "إجمالي الخصوم", "TOTAL", number(source.liabilities)], ["", "حقوق الملكية", "TOTAL", number(source.equity)], ["", "أرباح غير مقفلة", "EQUITY", number(source.currentProfit)], ["", "إجمالي الخصوم وحقوق الملكية", "TOTAL", number(source.liabilitiesAndEquity)], ["", "فرق التوازن", "CHECK", number(source.difference)]);
    return { title, subtitle, columns: ["رقم الحساب", "الحساب", "القسم", "المبلغ"], rows };
  }
  throw new Error("Unsupported financial export report");
}

const date = (value: unknown) => value ? new Date(String(value)).toISOString().slice(0, 10) : "";
const xml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const columnName = (index: number) => { let result = ""; for (let n = index + 1; n; n = Math.floor((n - 1) / 26)) result = String.fromCharCode(65 + (n - 1) % 26) + result; return result; };

export function createXlsx(table: ReportTable) {
  const rows: Cell[][] = [[table.title], [table.subtitle ?? ""], table.columns, ...table.rows];
  const sheetRows = rows.map((row, rowIndex) => `<row r="${rowIndex + 1}"${rowIndex === 0 ? ' ht="28" customHeight="1"' : ""}>${row.map((cell, columnIndex) => {
    const ref = `${columnName(columnIndex)}${rowIndex + 1}`, style = rowIndex === 0 ? 1 : rowIndex === 2 ? 2 : typeof cell === "number" ? 3 : 0;
    return typeof cell === "number" && Number.isFinite(cell) ? `<c r="${ref}" s="${style}"><v>${cell}</v></c>` : `<c r="${ref}" s="${style}" t="inlineStr"><is><t>${xml(cell)}</t></is></c>`;
  }).join("")}</row>`).join("");
  const lastColumn = columnName(Math.max(0, table.columns.length - 1));
  const files: Record<string, string> = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Financial Report" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="18"/><color rgb="FF17365D"/><name val="Aptos Display"/></font><font><b/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`,
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0" rightToLeft="1"><pane ySplit="3" topLeftCell="A4" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${table.columns.map((_, index) => `<col min="${index + 1}" max="${index + 1}" width="${index < 2 ? 22 : 15}" customWidth="1"/>`).join("")}</cols><sheetData>${sheetRows}</sheetData><mergeCells count="2"><mergeCell ref="A1:${lastColumn}1"/><mergeCell ref="A2:${lastColumn}2"/></mergeCells><autoFilter ref="A3:${lastColumn}${rows.length}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`,
  };
  return zip(files);
}

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (data: Buffer) => { let crc = 0xffffffff; for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; };
function zip(files: Record<string, string>) {
  const local: Buffer[] = [], central: Buffer[] = []; let offset = 0;
  for (const [name, contents] of Object.entries(files)) {
    const filename = Buffer.from(name), data = Buffer.from(contents), crc = crc32(data);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt32LE(crc, 14); header.writeUInt32LE(data.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    local.push(header, filename, data);
    const directory = Buffer.alloc(46); directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6); directory.writeUInt32LE(crc, 16); directory.writeUInt32LE(data.length, 20); directory.writeUInt32LE(data.length, 24); directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(offset, 42);
    central.push(directory, filename); offset += header.length + filename.length + data.length;
  }
  const centralBuffer = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuffer, end]);
}

const pdfText = (value: Cell) => String(value ?? "").normalize("NFKD").replace(/[^\x20-\x7E]/g, " ").replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
export function createPdf(table: ReportTable) {
  const maxRows = 24, pages: Cell[][][] = [];
  for (let index = 0; index < Math.max(1, table.rows.length); index += maxRows) pages.push(table.rows.slice(index, index + maxRows));
  const objects: Buffer[] = [], add = (body: string | Buffer) => { objects.push(Buffer.isBuffer(body) ? body : Buffer.from(body)); return objects.length; };
  const catalogId = add(""), pagesId = add(""), fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];
  pages.forEach((rows, pageIndex) => {
    const width = 760 / Math.max(1, table.columns.length), commands = ["1 1 1 rg", "0 0 842 595 re f", "0.09 0.21 0.36 rg", "40 548 762 28 re f", "1 1 1 rg", `BT /F1 16 Tf 50 557 Td (${pdfText(table.title)}) Tj ET`, "0 0 0 rg", `BT /F1 9 Tf 50 535 Td (${pdfText(table.subtitle ?? "")}) Tj ET`, "0.12 0.31 0.47 rg", "40 503 762 22 re f", "1 1 1 rg"];
    table.columns.forEach((column, index) => commands.push(`BT /F1 7 Tf ${42 + index * width} 511 Td (${pdfText(column).slice(0, 24)}) Tj ET`));
    rows.forEach((row, rowIndex) => { const y = 488 - rowIndex * 18; if (rowIndex % 2 === 0) commands.push("0.95 0.97 0.98 rg", `40 ${y - 5} 762 17 re f`); commands.push("0 0 0 rg"); row.forEach((cell, index) => commands.push(`BT /F1 7 Tf ${42 + index * width} ${y} Td (${pdfText(typeof cell === "number" ? cell.toLocaleString("en-US", { maximumFractionDigits: 2 }) : cell).slice(0, 24)}) Tj ET`)); });
    commands.push(`BT /F1 7 Tf 730 22 Td (Page ${pageIndex + 1} of ${pages.length}) Tj ET`, `BT /F1 7 Tf 40 22 Td (NETAj ERP - Generated ${new Date().toISOString().slice(0, 10)}) Tj ET`);
    const stream = Buffer.from(commands.join("\n")), contentId = add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")]));
    const pageId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`); pageIds.push(pageId);
  });
  objects[catalogId - 1] = Buffer.from(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects[pagesId - 1] = Buffer.from(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`);
  const chunks = [Buffer.from("%PDF-1.7\n%NETAJ\n")], offsets = [0]; let position = chunks[0].length;
  objects.forEach((body, index) => { offsets[index + 1] = position; const object = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), body, Buffer.from("\nendobj\n")]); chunks.push(object); position += object.length; });
  const xref = position, lines = [`xref`, `0 ${objects.length + 1}`, "0000000000 65535 f ", ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `), `trailer << /Size ${objects.length + 1} /Root ${catalogId} 0 R >>`, "startxref", String(xref), "%%EOF"];
  chunks.push(Buffer.from(lines.join("\n"))); return Buffer.concat(chunks);
}
