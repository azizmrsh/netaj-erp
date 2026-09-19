"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Field = { key: string; labelAr: string; labelEn: string; type: string; required?: boolean };
type Target = { key: string; labelAr: string; labelEn: string; moduleKey: string; accountingSensitive?: boolean; fields: Field[] };
type ImportRow = { id: number; sourceSheet: string; sourceRow: number; status: string; mappedData?: Record<string, unknown>; errors?: string[]; warnings?: string[]; entityType?: string | null; entityId?: number | null; operation?: string | null };
type Batch = { id: number; batchNumber: string; targetType: string; importMode: string; duplicateStrategy: string; sourceFile: string; status: string; totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; createdRows: number; updatedRows: number; skippedRows: number; createdAt: string; executedAt?: string | null; rolledBackAt?: string | null; rows?: ImportRow[]; mapping?: Record<string, string>; sheets?: { name: string; rowCount: number; headers: string[] }[] };
type MappingTemplate = { id: number; targetType: string; name: string; mapping: Record<string, string>; isDefault: boolean };
type InspectResult = { filename: string; headers: string[]; sheets: { name: string; headers: string[]; rowCount: number }[]; mapping: Record<string, string>; fields: Field[]; sampleRows: { sourceSheet: string; sourceRow: number; raw: Record<string, unknown> }[] };

const statusLabels: Record<string, string> = { PREVIEW: "معاينة", QUEUED:"في طابور التنفيذ", RUNNING: "قيد التنفيذ", COMPLETED: "مكتملة", FAILED: "فشلت", ROLLED_BACK: "تم التراجع", VALID: "صالح", INVALID: "خطأ", DUPLICATE: "مكرر", IMPORTED: "مستورد", SKIPPED: "متجاوز", ROLLED_BACK_ROW: "تم التراجع" };
const badge: Record<string, string> = { COMPLETED: "bg-emerald-100 text-emerald-800", VALID: "bg-emerald-100 text-emerald-800", IMPORTED: "bg-emerald-100 text-emerald-800", INVALID: "bg-red-100 text-red-800", FAILED: "bg-red-100 text-red-800", DUPLICATE: "bg-amber-100 text-amber-900", PREVIEW: "bg-blue-100 text-blue-800", QUEUED:"bg-indigo-100 text-indigo-800", ROLLED_BACK: "bg-slate-200 text-slate-700", SKIPPED: "bg-slate-200 text-slate-700" };

export default function ImportsClient() {
  const [catalog, setCatalog] = useState<Target[]>([]), [batches, setBatches] = useState<Batch[]>([]), [templates, setTemplates] = useState<MappingTemplate[]>([]);
  const [targetType, setTargetType] = useState("PARTIES"), [mode, setMode] = useState("FULL"), [strategy, setStrategy] = useState("SKIP"), [file, setFile] = useState<File | null>(null);
  const [inspect, setInspect] = useState<InspectResult | null>(null), [mapping, setMapping] = useState<Record<string, string>>({}), [selected, setSelected] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [historyFilter, setHistoryFilter] = useState("");
  const target = catalog.find((row) => row.key === targetType);

  const load = useCallback(async () => {
    const response = await fetch("/api/imports", { cache: "no-store" }), body = await response.json();
    if (!response.ok) throw new Error(body.error); setCatalog(body.catalog); setBatches(body.batches); setTemplates(body.templates);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/imports", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then((body) => { setCatalog(body.catalog); setBatches(body.batches); setTemplates(body.templates); })
      .catch((error) => { if (error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, []);

  function changeTarget(value: string) {
    setTargetType(value); setInspect(null); setMapping({});
  }

  async function inspectFile() {
    if (!file) return setMessage("اختر ملفًا أولًا");
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("targetType", targetType);
      const response = await fetch("/api/imports/inspect", { method: "POST", body: form }), body = await response.json();
      if (!response.ok) throw new Error(body.error); setInspect(body); setMapping(body.mapping);
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحليل الملف"); }
    finally { setBusy(false); }
  }

  async function createPreview() {
    if (!file || !inspect) return setMessage("حلّل الملف واربط الأعمدة أولًا");
    const missing = inspect.fields.filter((field) => field.required && !mapping[field.key]);
    if (missing.length) return setMessage(`اربط الحقول المطلوبة: ${missing.map((field) => field.labelAr).join("، ")}`);
    setBusy(true); setMessage("");
    try {
      const form = new FormData(); form.set("file", file); form.set("targetType", targetType); form.set("importMode", mode); form.set("duplicateStrategy", strategy); form.set("mapping", JSON.stringify(mapping));
      const response = await fetch("/api/imports", { method: "POST", body: form }), body = await response.json();
      if (!response.ok) throw new Error(body.error); setSelected(body); await load(); setMessage("اكتملت المعاينة. راجع الأخطاء والتكرارات قبل التنفيذ.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إنشاء المعاينة"); }
    finally { setBusy(false); }
  }

  async function openBatch(id: number) {
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/imports/${id}`, { cache: "no-store" }), body = await response.json(); if (!response.ok) throw new Error(body.error); setSelected(body); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر فتح الدفعة"); }
    finally { setBusy(false); }
  }

  async function batchAction(action: "QUEUE_EXECUTE" | "ROLLBACK") {
    if (!selected) return;
    if (action === "ROLLBACK" && !window.confirm("سيحذف النظام فقط السجلات التي أنشأتها هذه الدفعة إذا لم ترتبط بحركات لاحقة. هل تريد المتابعة؟")) return;
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/imports/${selected.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load();await openBatch(selected.id); setMessage(action === "QUEUE_EXECUTE" ? "أضيفت الدفعة إلى طابور التنفيذ الخلفي." : "تم التراجع الآمن عن السجلات المنشأة."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء"); }
    finally { setBusy(false); }
  }

  async function saveTemplate() {
    if (!inspect) return;
    const name = window.prompt("اسم قالب ربط الأعمدة"); if (!name) return;
    setBusy(true);
    try { const response = await fetch("/api/imports/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, name, mapping }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); setMessage("تم حفظ قالب الربط."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ القالب"); }
    finally { setBusy(false); }
  }

  const filteredBatches = useMemo(() => batches.filter((batch) => !historyFilter || `${batch.batchNumber} ${batch.sourceFile} ${batch.targetType}`.toLowerCase().includes(historyFilter.toLowerCase())), [batches, historyFilter]);
  const currentTemplates = templates.filter((template) => template.targetType === targetType);
  return <div className="mx-auto grid max-w-7xl gap-6 p-5 lg:grid-cols-[1.4fr_0.8fr]">
    <div className="space-y-6">
      {message && <div className={`rounded-xl border p-4 ${message.includes("بنجاح") || message.includes("اكتملت") || message.includes("تم حفظ") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{message}</div>}
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5"><h2 className="text-lg font-bold">1. الملف والهدف</h2><p className="text-sm text-slate-500">يدعم XLSX وXLS وCSV وجميع أوراق العمل. لا تُكتب أي بيانات في الوحدات أثناء المعاينة.</p></div>
        <div className="grid gap-4 md:grid-cols-2"><Select label="هدف الاستيراد" value={targetType} onChange={changeTarget} options={catalog.map((row) => [row.key, `${row.labelAr} (${row.moduleKey})`])}/><label className="text-sm"><span className="mb-1 block text-slate-600">ملف المصدر</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="w-full rounded-lg border p-2"/></label><Select label="وضع الاستيراد" value={mode} onChange={setMode} options={[["FULL","تشغيلي كامل"],["HISTORICAL","تاريخي دون ترحيل إضافي"],["OPENING","أرصدة افتتاحية / Cutover"]]}/><Select label="معالجة التكرار" value={strategy} onChange={setStrategy} options={[["SKIP","تجاوز"],["UPDATE","تحديث الموجود"],["MERGE","دمج الحقول الفارغة"],["CREATE","إنشاء جديد إذا سمحت القيود"]]}/></div>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || !file} onClick={inspectFile} className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50">تحليل الأعمدة</button>{target && <a href={`/api/imports/template?target=${target.key}`} className="rounded-lg border px-4 py-2 font-bold text-blue-700">تنزيل قالب Excel</a>}{currentTemplates.map((template) => <button key={template.id} onClick={() => setMapping(template.mapping)} className="rounded-lg border px-3 py-2 text-sm">تطبيق: {template.name}</button>)}</div>
      </section>
      {inspect && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">2. ربط الأعمدة والتحقق</h2><p className="text-sm text-slate-500">{inspect.sheets.map((sheet) => `${sheet.name}: ${sheet.rowCount}`).join(" · ")}</p></div><button onClick={saveTemplate} disabled={busy} className="rounded-lg border px-3 py-2 text-sm font-bold">حفظ الربط كقالب</button></div>
        <div className="grid gap-3 md:grid-cols-2">{inspect.fields.map((field) => <label key={field.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm"><span>{field.labelAr}{field.required && <b className="text-red-600"> *</b>}<small className="block text-slate-400">{field.type}</small></span><select value={mapping[field.key] ?? ""} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })} className="rounded-lg border bg-white px-3 py-2"><option value="">غير مربوط</option>{inspect.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-right">الورقة</th><th className="p-2 text-right">الصف</th>{inspect.headers.slice(0,6).map((header) => <th key={header} className="p-2 text-right">{header}</th>)}</tr></thead><tbody>{inspect.sampleRows.map((row) => <tr key={`${row.sourceSheet}-${row.sourceRow}`} className="border-b"><td className="p-2">{row.sourceSheet}</td><td>{row.sourceRow}</td>{inspect.headers.slice(0,6).map((header) => <td key={header} className="max-w-40 truncate p-2">{String(row.raw[header] ?? "")}</td>)}</tr>)}</tbody></table></div>
        <button disabled={busy} onClick={createPreview} className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white disabled:opacity-50">إنشاء معاينة التحقق</button>
      </section>}
      {selected && (
        <BatchDetails batch={selected} target={catalog.find((row) => row.key === selected.targetType)} busy={busy} execute={() => batchAction("QUEUE_EXECUTE")} rollback={() => batchAction("ROLLBACK")} />
      )}
    </div>
    <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-4"><h2 className="font-bold">سجل دفعات الاستيراد</h2><input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="بحث بالملف أو رقم الدفعة" className="my-4 w-full rounded-lg border px-3 py-2 text-sm"/><div className="max-h-[70vh] space-y-2 overflow-y-auto">{filteredBatches.map((batch) => <button key={batch.id} onClick={() => openBatch(batch.id)} className={`w-full rounded-xl border p-3 text-right ${selected?.id === batch.id ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><b className="text-sm">{batch.batchNumber}</b><Status value={batch.status}/></div><p className="mt-1 truncate text-xs text-slate-500">{batch.sourceFile}</p><p className="mt-2 text-xs">{batch.targetType} · {batch.totalRows} صف</p></button>)}</div></aside>
  </div>;
}

function BatchDetails({ batch, target, busy, execute, rollback }: { batch: Batch; target?: Target; busy: boolean; execute: () => void; rollback: () => void }) {
  const fields = target?.fields ?? [];
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">3. نتيجة الدفعة {batch.batchNumber}</h2><p className="text-sm text-slate-500">{batch.sourceFile} · {target?.labelAr ?? batch.targetType}</p></div><Status value={batch.status}/></div>
    <div className="my-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="الإجمالي" value={batch.totalRows}/><Metric label="صالح" value={batch.validRows} tone="green"/><Metric label="أخطاء" value={batch.invalidRows} tone="red"/><Metric label="مكرر" value={batch.duplicateRows} tone="amber"/><Metric label="أُنشئ" value={batch.createdRows}/><Metric label="حُدّث" value={batch.updatedRows}/></div>
    <div className="mb-4 flex gap-2">{batch.status === "PREVIEW" && <button disabled={busy || batch.invalidRows > 0} onClick={execute} className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white disabled:opacity-40">تنفيذ الاستيراد</button>}{batch.status === "COMPLETED" && <button disabled={busy} onClick={rollback} className="rounded-lg border border-red-300 px-5 py-2.5 font-bold text-red-700 disabled:opacity-40">تراجع آمن</button>}</div>
    <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-right">المصدر</th><th className="p-2 text-right">الحالة</th>{fields.slice(0,5).map((field) => <th key={field.key} className="p-2 text-right">{field.labelAr}</th>)}<th className="p-2 text-right">الملاحظات</th></tr></thead><tbody>{(batch.rows ?? []).map((row) => <tr key={row.id} className={`border-b ${row.status === "INVALID" ? "bg-red-50" : row.status === "DUPLICATE" ? "bg-amber-50" : ""}`}><td className="whitespace-nowrap p-2">{row.sourceSheet} / {row.sourceRow}</td><td><Status value={row.status}/></td>{fields.slice(0,5).map((field) => <td key={field.key} className="max-w-40 truncate p-2">{String(row.mappedData?.[field.key] ?? "")}</td>)}<td className="p-2 text-xs text-red-700">{[...(row.errors ?? []), ...(row.warnings ?? [])].join("، ")}</td></tr>)}</tbody></table></div>
    {batch.totalRows > 500 && <p className="mt-3 text-xs text-slate-500">تعرض الواجهة أول 500 صف. ملخص الدفعة يشمل جميع الصفوف.</p>}
  </section>;
}
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="text-sm"><span className="mb-1 block text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2.5">{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>; }
function Status({ value }: { value: string }) { return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${badge[value] ?? "bg-slate-100 text-slate-700"}`}>{statusLabels[value] ?? value}</span>; }
function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" | "amber" }) { return <div className={`rounded-xl p-3 ${tone === "green" ? "bg-emerald-50" : tone === "red" ? "bg-red-50" : tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}><p className="text-xs text-slate-500">{label}</p><b className="text-xl">{value}</b></div>; }
