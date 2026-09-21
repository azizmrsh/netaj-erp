"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

type Row = Record<string, unknown>;
type Filters = { report: string; from: string; to: string; accountId: string; costCenterId: string; branchId: string; level: string; budgetId: string; includeZero: boolean; includeChildren: boolean };
type Column = { key: string; title: string; format?: "money" | "date" | "percent" };
const titles: Record<string, string> = { "trial-balance": "ميزان المراجعة", "profit-and-loss": "قائمة الدخل", "balance-sheet": "المركز المالي", "cash-flow": "قائمة التدفقات النقدية", "general-ledger": "دفتر الأستاذ", "account-statement": "كشف حساب تفصيلي", "changes-in-equity": "التغيرات في حقوق الملكية", "ar-aging": "أعمار ذمم العملاء", "ap-aging": "أعمار ذمم الموردين", vat: "ضريبة القيمة المضافة", "budget-vs-actual": "الميزانية مقابل الفعلي" };
const input = "min-w-0 w-full rounded-xl border border-[#e4d7be] bg-white px-3 py-2.5 text-sm text-[#172033]";
const button = "rounded-xl border border-[#c9972b] bg-gradient-to-b from-[#ebcf87] to-[#c9972b] px-4 py-2.5 text-sm font-bold text-[#172033] disabled:opacity-50";
const money = (value: unknown) => Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rowsOf = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];
const objectOf = (value: unknown): Row => value && typeof value === "object" && !Array.isArray(value) ? value as Row : {};
const moneyColumn = (key: string, title: string): Column => ({ key, title, format: "money" });
const defaultFilters = (report?: string): Filters => ({ report: report && titles[report] ? report : "trial-balance", from: "", to: "", accountId: "", costCenterId: "", branchId: "", level: "", budgetId: "", includeZero: false, includeChildren: false });
const supportsAccount = (report: string) => ["trial-balance", "general-ledger", "account-statement"].includes(report);
const supportsCenter = (report: string) => [...["trial-balance", "general-ledger", "account-statement"], "profit-and-loss", "balance-sheet"].includes(report);
const supportsBranch = (report: string) => !["ar-aging", "ap-aging", "budget-vs-actual"].includes(report);
const supportsFrom = (report: string) => !["balance-sheet", "ar-aging", "ap-aging", "budget-vs-actual"].includes(report);
const dateInput = (value: string | null) => value?.slice(0, 10) ?? "";
function paramsFor(filters: Filters) {
  const params = new URLSearchParams({ report: filters.report });
  if (supportsFrom(filters.report) && filters.from) params.set("from", filters.from);
  if (filters.report !== "budget-vs-actual" && filters.to) params.set("to", filters.to);
  if (supportsAccount(filters.report) && filters.accountId) params.set("accountId", filters.accountId);
  if (supportsCenter(filters.report) && filters.costCenterId) params.set("costCenterId", filters.costCenterId);
  if (supportsBranch(filters.report) && filters.branchId) params.set("branchId", filters.branchId);
  if (supportsAccount(filters.report) && filters.includeChildren) params.set("includeChildren", "1");
  if (filters.report === "budget-vs-actual" && filters.budgetId) params.set("budgetId", filters.budgetId);
  if (filters.report === "trial-balance" && filters.includeZero) params.set("includeZero", "1");
  if (filters.report === "trial-balance" && filters.level) params.set("level", filters.level);
  return params;
}

export default function FinancialReportPanel({ initialReport, accounts, costCenters, budgets, branches = [] }: { initialReport?: string; accounts: Row[]; costCenters: Row[]; budgets: Row[]; branches?: Row[] }) {
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(initialReport));
  const [applied, setApplied] = useState<Filters>(() => defaultFilters(initialReport));
  const [data, setData] = useState<Row | Row[] | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [page, setPage] = useState(1), [pageSize, setPageSize] = useState(25);
  const request = useRef(0);

  async function load(next: Filters) {
    const token = ++request.current;
    setBusy(true); setError("");
    try {
      if (next.report === "account-statement" && !next.accountId) throw new Error("اختر حسابًا لإعداد كشف الحساب.");
      if (next.report === "budget-vs-actual" && !next.budgetId) throw new Error("اختر ميزانية معتمدة للمقارنة.");
      if (supportsFrom(next.report) && next.from && next.to && next.from > next.to) throw new Error("بداية الفترة يجب أن تسبق نهايتها.");
      const response = await fetch(`/api/finance/reports?${paramsFor(next)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "تعذر إعداد التقرير");
      if (token !== request.current) return;
      setData(result); setApplied(next); setPage(1);
    } catch (cause) {
      if (token === request.current) { setError(cause instanceof Error ? cause.message : "تعذر إعداد التقرير"); setData(null); }
    } finally { if (token === request.current) setBusy(false); }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = { ...defaultFilters(initialReport), from: dateInput(params.get("from")), to: dateInput(params.get("to")), accountId: params.get("accountId") ?? "", costCenterId: params.get("costCenterId") ?? "", budgetId: params.get("budgetId") ?? "", branchId: params.get("branchId") ?? "", level: params.get("level") ?? "", includeChildren: params.get("includeChildren") === "1", includeZero: params.get("includeZero") === "1" };
    setFilters(next); void load(next);
    return () => { request.current += 1; };
    // Each route initializes its own report and cancels responses from the old one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReport]);

  function update<K extends keyof Filters>(key: K, value: Filters[K]) { setFilters(current => ({ ...current, [key]: value })); }
  function drilldown(row: Row) {
    const params = new URL(String(row.drilldownUrl), window.location.origin).searchParams;
    const next = { ...applied, report: "account-statement", accountId: params.get("accountId") ?? "", includeChildren: params.get("includeChildren") === "1", from: dateInput(params.get("from")), to: dateInput(params.get("to")) };
    setFilters(next); void load(next);
  }
  function exportReport(format: "xlsx" | "print") {
    const params = paramsFor(applied); params.set("format", format);
    window.open(`/api/finance/reports/export?${params}`, "_blank", "noopener,noreferrer");
  }
  const view = data ? describeReport(applied.report, data) : null;
  const pages = Math.max(1, Math.ceil((view?.rows.length ?? 0) / pageSize));
  const changed = paramsFor(filters).toString() !== paramsFor(applied).toString();
  return <section className="space-y-5 rounded-2xl border border-[#e4d7be] bg-white p-5" dir="rtl" data-financial-report={filters.report}>
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-bold text-[#172033]">{titles[filters.report]}</h2><p className="mt-1 text-sm text-slate-500">الأرقام بالعملة الأساسية للشركة ومن القيود المرحلة. {filters.report === "balance-sheet" ? "المركز المالي تراكمي حتى نهاية الفترة." : filters.report === "cash-flow" ? "الطريقة المباشرة من حركات الحسابات النقدية في دفتر الأستاذ." : "اختر الفترة وأبعاد التقرير."}</p></div></header>
    <form className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={(event: FormEvent) => { event.preventDefault(); void load(filters); }}>
      <label className="space-y-1 text-sm">التقرير<select className={input} value={filters.report} onChange={event => { const next = { ...filters, report: event.target.value, accountId: "", costCenterId: "" }; setFilters(next); void load(next); }}>{Object.entries(titles).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      {supportsFrom(filters.report) && <label className="space-y-1 text-sm">من تاريخ<input type="date" className={input} value={filters.from} onChange={event => update("from", event.target.value)}/></label>}
      {filters.report !== "budget-vs-actual" && <label className="space-y-1 text-sm">{filters.report === "balance-sheet" ? "المركز المالي في تاريخ" : "إلى تاريخ"}<input type="date" className={input} value={filters.to} onChange={event => update("to", event.target.value)}/></label>}
      {supportsAccount(filters.report) && <label className="space-y-1 text-sm">الحساب<select className={input} value={filters.accountId} onChange={event => update("accountId", event.target.value)}><option value="">{filters.report === "account-statement" ? "اختر الحساب" : "جميع الحسابات"}</option>{accounts.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.code)} — {String(row.nameAr)}</option>)}</select></label>}
      {supportsCenter(filters.report) && <label className="space-y-1 text-sm">مركز التكلفة<select className={input} value={filters.costCenterId} onChange={event => update("costCenterId", event.target.value)}><option value="">جميع مراكز التكلفة</option>{costCenters.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.code)} — {String(row.nameAr)}</option>)}</select></label>}
      {supportsBranch(filters.report) && <label className="space-y-1 text-sm">الفرع<select className={input} value={filters.branchId} onChange={event => update("branchId", event.target.value)}><option value="">كل الفروع وغير المعيّن</option>{branches.map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.nameAr ?? row.name)}</option>)}</select></label>}
      {filters.report === "trial-balance" && <label className="space-y-1 text-sm">مستوى التجميع<select className={input} value={filters.level} onChange={event => update("level", event.target.value)}><option value="">تفصيلي — دون تجميع</option>{[1, 2, 3, 4, 5, 6, 7].map(level => <option key={level} value={level}>المستوى {level}</option>)}</select></label>}
      {supportsAccount(filters.report) && filters.accountId && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.includeChildren} onChange={event => update("includeChildren", event.target.checked)}/>تضمين الحسابات التابعة</label>}
      {filters.report === "budget-vs-actual" && <label className="space-y-1 text-sm">الميزانية المعتمدة<select className={input} value={filters.budgetId} onChange={event => update("budgetId", event.target.value)}><option value="">اختر الميزانية</option>{budgets.filter(row => row.status === "APPROVED").map(row => <option key={String(row.id)} value={String(row.id)}>{String(row.name)}</option>)}</select></label>}
      {filters.report === "trial-balance" && <label className="flex items-center gap-2 py-2 text-sm"><input type="checkbox" checked={filters.includeZero} onChange={event => update("includeZero", event.target.checked)}/>إظهار الحسابات الصفرية</label>}
      <button className={button} disabled={busy} type="submit">{busy ? "جارٍ إعداد التقرير…" : "إعداد التقرير"}</button>
    </form>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-800">{error}</p>}
    {changed && data && <p className="text-sm text-amber-800">تغيّرت الفلاتر؛ اضغط «إعداد التقرير» لتحديث النتائج.</p>}
    {supportsBranch(filters.report) && <p className="text-sm text-slate-500">الحركات التاريخية غير المربوطة بفرع تدخل في «كل الفروع» فقط؛ اختيار فرع يعرض الحركات المرتبطة به صراحة.</p>}
    {view && <div className={busy ? "space-y-4 opacity-50" : "space-y-4"} aria-busy={busy}>
      <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{titles[applied.report]} <span className="text-sm font-normal text-slate-500">{applied.report === "budget-vs-actual" ? "حسب فترات الميزانية المختارة" : `${supportsFrom(applied.report) ? applied.from || "من البداية" : "حتى تاريخ"} — ${applied.to || "الآن"}`}</span></h3><div className="flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => exportReport("xlsx")}>Excel</button><button className={button} disabled={busy} onClick={() => exportReport("print")}>طباعة / حفظ PDF</button></div></div>
      {view.warnings.map(warning => <p key={warning} role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{view.summaries.map(([title, value]) => <div className="rounded-xl bg-[#f3ecdf] p-3" key={title}><span className="text-sm text-slate-600">{title}</span><b dir="ltr" className="mt-1 block text-lg text-[#172033]">{money(value)}</b></div>)}</div>
      <div className="overflow-x-auto rounded-xl border border-[#e4d7be]"><table className="w-full min-w-[800px] text-sm"><thead className="bg-[#f3ecdf]"><tr>{view.columns.map(column => <th className="whitespace-nowrap px-3 py-3 text-right" key={column.key}>{column.title}</th>)}<th className="px-3 py-3">التفاصيل</th></tr></thead><tbody>{view.rows.slice((page - 1) * pageSize, page * pageSize).map((row, index) => <tr className="border-t border-[#e4d7be] even:bg-[#fcfaf5]" key={String(row.id ?? row.accountId ?? `${page}-${index}`)}>{view.columns.map(column => <td className="px-3 py-3" key={column.key}>{renderCell(row[column.key], column.format)}</td>)}<td className="px-3 py-3">{row.drilldownUrl && row.accountId ? <button className="whitespace-nowrap font-semibold text-[#8a641b] underline" onClick={() => drilldown(row)}>كشف الحساب</button> : row.sourceUrl ? <a className="whitespace-nowrap font-semibold text-[#8a641b] underline" href={String(row.sourceUrl)}>فتح القيد / المصدر</a> : "—"}</td></tr>)}{view.rows.length === 0 && <tr><td className="p-8 text-center text-slate-500" colSpan={view.columns.length + 1}>لا توجد حركات مرحلة مطابقة للفلاتر.</td></tr>}</tbody></table></div>
      <footer className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{view.rows.length} بندًا — صفحة {page} من {pages}</span><div className="flex items-center gap-2"><label>بنود الصفحة <select className="rounded-lg border p-2" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}>{[25, 50, 100].map(size => <option key={size}>{size}</option>)}</select></label><button className={button} disabled={page <= 1} onClick={() => setPage(current => current - 1)}>السابق</button><button className={button} disabled={page >= pages} onClick={() => setPage(current => current + 1)}>التالي</button></div></footer>
    </div>}
  </section>;
}

function renderCell(value: unknown, format?: Column["format"]): ReactNode {
  if (value == null || value === "") return "—";
  if (format === "money" || format === "percent") return <span dir="ltr" className="inline-block whitespace-nowrap tabular-nums">{money(value)}{format === "percent" ? "%" : ""}</span>;
  if (format === "date") return <span dir="ltr">{String(value).slice(0, 10)}</span>;
  return String(value);
}

function describeReport(name: string, data: Row | Row[]): { rows: Row[]; columns: Column[]; summaries: Array<[string, unknown]>; warnings: string[] } {
  const value = objectOf(data), totals = objectOf(value.totals), warnings: string[] = [];
  const account: Column[] = [{ key: "code", title: "رقم الحساب" }, { key: "name", title: "اسم الحساب" }];
  if (Number(value.unmappedAccountCount) > 0) warnings.push(`توجد ${String(value.unmappedAccountCount)} حسابات غير مصنّفة في الدليل؛ يلزم ربطها قبل الاعتماد على القوائم المالية.`);
  if (Number(value.unassignedEntryCount) > 0) warnings.push(`يشمل التقرير ${String(value.unassignedEntryCount)} قيدًا غير معيّن لفرع. لا توزّع هذه الأرصدة على الفروع تلقائيًا.`);
  if (name === "trial-balance") {
    if (value.balanced === false) warnings.push(`ميزان المراجعة غير متوازن ضمن الفلاتر المختارة؛ الفرق ${money(value.difference)}.`);
    return { rows: rowsOf(value.rows), columns: [...account, moneyColumn("openingDebit", "أول المدة مدين"), moneyColumn("openingCredit", "أول المدة دائن"), moneyColumn("debit", "الحركة مدين"), moneyColumn("credit", "الحركة دائن"), moneyColumn("closingDebit", "آخر المدة مدين"), moneyColumn("closingCredit", "آخر المدة دائن")], summaries: [["مدين الحركة", totals.debit], ["دائن الحركة", totals.credit], ["مدين الإقفال", totals.closingDebit], ["دائن الإقفال", totals.closingCredit]], warnings };
  }
  if (name === "profit-and-loss" || name === "balance-sheet") {
    const statement = objectOf(name === "profit-and-loss" ? value.profitAndLoss : value.balanceSheet);
    if (name === "balance-sheet" && statement.balanced === false) warnings.push(`المركز المالي غير متوازن ضمن الفلاتر المختارة؛ الفرق ${money(statement.difference)}.`);
    const groups = name === "profit-and-loss" ? [["revenueAccounts", "الإيرادات"], ["expenseAccounts", "المصروفات"]] : [["assetAccounts", "الأصول"], ["liabilityAccounts", "الخصوم"], ["equityAccounts", "حقوق الملكية"]];
    const rows: Row[] = groups.flatMap(([key, section]) => rowsOf(statement[key]).map(row => ({ ...row, section })));
    if (name === "balance-sheet") rows.push({ code: "—", name: "أرباح غير مقفلة حتى تاريخ التقرير", section: "حقوق الملكية", reportAmount: statement.currentProfit });
    return { rows, columns: [{ key: "section", title: "القسم" }, ...account, moneyColumn("reportAmount", "الرصيد")], summaries: name === "profit-and-loss" ? [["صافي المبيعات المرتبطة", statement.netSales], ["إيرادات أخرى", statement.otherRevenue], ["تكلفة المبيعات المرتبطة", statement.costOfSales], ["مجمل الربح", statement.grossProfit], ["مصروفات تشغيلية وأخرى", statement.operatingExpenses], ["إجمالي الإيرادات", statement.revenue], ["إجمالي المصروفات", statement.expenses], ["صافي الربح / الخسارة", statement.netProfit], ...(statement.profitMargin == null ? [] : [["هامش صافي الربح %", statement.profitMargin] as [string, unknown]])] : [["إجمالي الأصول", statement.assets], ["إجمالي الخصوم", statement.liabilities], ["حقوق الملكية والأرباح", Number(statement.equity) + Number(statement.currentProfit)], ["إجمالي الخصوم وحقوق الملكية", statement.liabilitiesAndEquity]], warnings };
  }
  if (name === "cash-flow") {
    const category: Record<string, string> = { OPERATING: "تشغيل", INVESTING: "استثمار", FINANCING: "تمويل", UNCLASSIFIED: "غير مصنف", OPENING: "تسوية افتتاحية", EXCHANGE: "فروق صرف" };
    if (value.classificationComplete === false) warnings.push("بعض التدفقات تحتاج ربط الحساب المقابل بنشاط تشغيل أو استثمار أو تمويل. تظهر مستقلة أدناه وتدخل في إجمالي النقد.");
    if (!Number(value.cashAccountCount)) warnings.push("لم تُربط حسابات بنوك أو صناديق بدفتر الأستاذ بعد.");
    return { rows: rowsOf(value.rows).map(row => ({ ...row, categoryName: category[String(row.category)] ?? "غير مصنف" })), columns: [{ key: "transactionDate", title: "التاريخ", format: "date" }, { key: "categoryName", title: "النشاط" }, { key: "entryNumber", title: "رقم القيد" }, { key: "accountName", title: "الحساب المقابل" }, { key: "description", title: "البيان" }, moneyColumn("amountIn", "تدفق داخل"), moneyColumn("amountOut", "تدفق خارج")], summaries: [["النقد أول المدة", totals.openingCash], ["صافي التشغيل", totals.operating], ["صافي الاستثمار", totals.investing], ["صافي التمويل", totals.financing], ["غير مصنف", totals.unclassified], ["صافي التدفق", totals.net], ["تسويات افتتاحية", totals.openingAdjustments], ["فروق الصرف", totals.exchangeDifferences], ["النقد آخر المدة", totals.closingCash], ["فرق المطابقة مع الأستاذ", totals.reconciliationDifference]], warnings };
  }
  if (name === "general-ledger" || name === "account-statement") return { rows: name === "general-ledger" ? rowsOf(data) : rowsOf(value.rows), columns: [{ key: "date", title: "التاريخ", format: "date" }, { key: "entryNumber", title: "رقم القيد" }, ...(name === "general-ledger" ? [{ key: "accountCode", title: "رقم الحساب" }, { key: "accountName", title: "اسم الحساب" }] : []), { key: "referenceNumber", title: "المرجع" }, { key: "description", title: "البيان" }, moneyColumn("debit", "مدين"), moneyColumn("credit", "دائن"), moneyColumn("balance", "رصيد الحساب")], summaries: name === "account-statement" ? [["رصيد أول المدة", value.openingBalance], ["إجمالي المدين", totals.debit], ["إجمالي الدائن", totals.credit], ["رصيد آخر المدة", value.closingBalance]] : [], warnings };
  if (name === "ar-aging" || name === "ap-aging") return { rows: rowsOf(value.items), columns: [{ key: "number", title: "المستند" }, { key: "partyName", title: "الجهة" }, { key: "invoiceDate", title: "التاريخ", format: "date" }, { key: "dueDate", title: "الاستحقاق", format: "date" }, moneyColumn("total", "الإجمالي"), moneyColumn("paid", "المسدد"), moneyColumn("outstanding", "المتبقي"), { key: "ageDays", title: "أيام التأخر" }], summaries: [["غير مستحق", totals.current], ["1–30 يومًا", totals.days1to30], ["31–60 يومًا", totals.days31to60], ["61–90 يومًا", totals.days61to90], ["أكثر من 90 يومًا", totals.over90], ["إجمالي المستحق", totals.total]], warnings };
  if (name === "changes-in-equity") return { rows: rowsOf(value.rows), columns: [...account, moneyColumn("opening", "أول المدة"), moneyColumn("directChanges", "الحركات المباشرة"), moneyColumn("closingBeforeProfit", "الرصيد قبل الربح")], summaries: [["حقوق أول المدة", totals.openingEquity], ["الحركات المباشرة", totals.directChanges], ["صافي ربح الفترة", totals.currentProfit], ["حقوق آخر المدة", totals.closingEquity]], warnings };
  if (name === "vat") return { rows: rowsOf(value.lines), columns: [{ key: "date", title: "التاريخ", format: "date" }, { key: "entryNumber", title: "القيد" }, { key: "accountName", title: "الحساب" }, moneyColumn("debit", "مدين"), moneyColumn("credit", "دائن")], summaries: [["ضريبة المخرجات", value.outputVat], ["ضريبة المدخلات", value.inputVat], ["صافي الضريبة", value.netVatDue]], warnings };
  return { rows: rowsOf(value.rows), columns: [{ key: "accountCode", title: "رقم الحساب" }, { key: "accountName", title: "اسم الحساب" }, { key: "periodName", title: "الفترة" }, { key: "costCenter", title: "مركز التكلفة" }, moneyColumn("budget", "المخطط"), moneyColumn("actual", "الفعلي"), moneyColumn("varianceAmount", "الانحراف"), { key: "variancePercent", title: "الانحراف %", format: "percent" }], summaries: [["إجمالي المخطط", totals.budget], ["إجمالي الفعلي", totals.actual], ["الانحراف", totals.varianceAmount]], warnings };
}
