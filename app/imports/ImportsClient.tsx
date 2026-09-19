"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Field = { key: string; labelAr: string; labelEn: string; type: string; required?: boolean };
type Target = { key: string; labelAr: string; labelEn: string; moduleKey: string; accountingSensitive?: boolean; fields: Field[] };
type ImportRow = { id: number; sourceSheet: string; sourceRow: number; status: string; mappedData?: Record<string, unknown>; errors?: string[]; warnings?: string[]; entityType?: string | null; entityId?: number | null; operation?: string | null };
type Impact = { expectedCreated?: number; expectedUpdated?: number; expectedSkipped?: number; referenceRows?: number; accounting?: { debit: number; credit: number; vat: number }; inventory?: { quantity: number; value: number }; safeguards?: string[] };
type Batch = { id: number; batchNumber: string; targetType: string; importMode: string; duplicateStrategy: string; sourceFile: string; status: string; totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; warningRows?: number; createdRows: number; updatedRows: number; skippedRows: number; createdAt: string; executedAt?: string | null; rolledBackAt?: string | null; rows?: ImportRow[]; mapping?: Record<string, string>; sheets?: { name: string; rowCount: number; headers: string[] }[]; impact?: Impact; reconciliation?: Record<string, unknown>; summary?: { missingReferences?: number; referenceOnly?: boolean } };
type MappingTemplate = { id: number; targetType: string; name: string; mapping: Record<string, string>; isDefault: boolean; sourceSystemId?: number | null };
type SourceSystem = { id: number; code: string; name: string };
type InspectResult = { filename: string; headers: string[]; sheets: { name: string; headers: string[]; rowCount: number }[]; mapping: Record<string, string>; fields: Field[]; sampleRows: { sourceSheet: string; sourceRow: number; raw: Record<string, unknown> }[]; headerFingerprint: string; detectedProfile?: { id: number; name: string } | null; intelligence?: { suggestedTarget: { key: string; labelAr: string; confidence: number } | null; probableDateFormat: string; currencies: string[]; debitCreditPattern: string; duplicateKeySuggestion: string[]; confidence: number; reasons: string[]; warnings: string[]; requiresConfirmation: boolean } };
type CertificateControl = { key: string; label: string; legacyTotal: number; netajTotal: number; difference: number; status: "MATCHED" | "WARNING" | "MISMATCH"; explanation: string; drillDown?: string };
type Certificate = { id: number; importBatchId: number; certificateNumber: string; status: string; generatedAt: string; certifiedAt?: string | null; controls: CertificateControl[]; summary: Record<string, unknown> };

const statusLabels: Record<string, string> = { PREVIEW: "معاينة", DRY_RUN: "فحص جاف", APPROVED: "معتمدة", QUEUED:"في طابور التنفيذ", RUNNING: "قيد التنفيذ", COMPLETED: "مكتملة", FAILED: "فشلت", ROLLED_BACK: "تم التراجع", VALID: "صالح", INVALID: "خطأ", DUPLICATE: "مكرر", IMPORTED: "مستورد", SKIPPED: "متجاوز", ROLLED_BACK_ROW: "تم التراجع" };
const badge: Record<string, string> = { COMPLETED: "bg-emerald-100 text-emerald-800", VALID: "bg-emerald-100 text-emerald-800", IMPORTED: "bg-emerald-100 text-emerald-800", INVALID: "bg-red-100 text-red-800", FAILED: "bg-red-100 text-red-800", DUPLICATE: "bg-amber-100 text-amber-900", PREVIEW: "bg-blue-100 text-blue-800", DRY_RUN: "bg-violet-100 text-violet-800", APPROVED: "bg-emerald-100 text-emerald-800", QUEUED:"bg-indigo-100 text-indigo-800", ROLLED_BACK: "bg-slate-200 text-slate-700", SKIPPED: "bg-slate-200 text-slate-700" };

export default function ImportsClient() {
  const [catalog, setCatalog] = useState<Target[]>([]), [batches, setBatches] = useState<Batch[]>([]), [templates, setTemplates] = useState<MappingTemplate[]>([]), [sourceSystems, setSourceSystems] = useState<SourceSystem[]>([]), [certificates, setCertificates] = useState<Certificate[]>([]);
  const [targetType, setTargetType] = useState("PARTIES"), [mode, setMode] = useState("FULL"), [strategy, setStrategy] = useState("SKIP"), [file, setFile] = useState<File | null>(null);
  const [sourceSystemId, setSourceSystemId] = useState(""), [cutoverDate, setCutoverDate] = useState("");
  const [inspect, setInspect] = useState<InspectResult | null>(null), [mapping, setMapping] = useState<Record<string, string>>({}), [selected, setSelected] = useState<Batch | null>(null);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [historyFilter, setHistoryFilter] = useState("");
  const target = catalog.find((row) => row.key === targetType);

  const load = useCallback(async () => {
    const [response, certificateResponse] = await Promise.all([fetch("/api/imports", { cache: "no-store" }), fetch("/api/imports/certification", { cache: "no-store" })]), [body, certificateBody] = await Promise.all([response.json(), certificateResponse.json()]);
    if (!response.ok) throw new Error(body.error); if (!certificateResponse.ok) throw new Error(certificateBody.error); setCatalog(body.catalog); setBatches(body.batches); setTemplates(body.templates); setSourceSystems(body.sourceSystems ?? []); setCertificates(certificateBody);
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetch("/api/imports", { cache: "no-store", signal: controller.signal }), fetch("/api/imports/certification", { cache: "no-store", signal: controller.signal })])
      .then(async ([response, certificateResponse]) => { const [body, certificateBody] = await Promise.all([response.json(), certificateResponse.json()]); if (!response.ok) throw new Error(body.error); if (!certificateResponse.ok) throw new Error(certificateBody.error); return { body, certificateBody }; })
      .then(({ body, certificateBody }) => { setCatalog(body.catalog); setBatches(body.batches); setTemplates(body.templates); setSourceSystems(body.sourceSystems ?? []); setCertificates(certificateBody); })
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
      const form = new FormData(); form.set("file", file); form.set("targetType", targetType); if (sourceSystemId) form.set("sourceSystemId", sourceSystemId);
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
      const form = new FormData(); form.set("file", file); form.set("targetType", targetType); form.set("importMode", mode); form.set("duplicateStrategy", strategy); form.set("mapping", JSON.stringify(mapping)); if (sourceSystemId) form.set("sourceSystemId", sourceSystemId); if (cutoverDate) form.set("cutoverDate", cutoverDate);
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

  async function batchAction(action: "DRY_RUN" | "APPROVE" | "QUEUE_EXECUTE" | "ROLLBACK") {
    if (!selected) return;
    if (action === "ROLLBACK" && !window.confirm("سيحذف النظام فقط السجلات التي أنشأتها هذه الدفعة إذا لم ترتبط بحركات لاحقة. هل تريد المتابعة؟")) return;
    setBusy(true); setMessage("");
    try { const response = await fetch(`/api/imports/${selected.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load();await openBatch(selected.id); setMessage(action === "DRY_RUN" ? "اكتمل الفحص الجاف دون تغيير البيانات." : action === "APPROVE" ? "تم اعتماد الدفعة وهي جاهزة للتنفيذ." : action === "QUEUE_EXECUTE" ? "أضيفت الدفعة إلى طابور التنفيذ الخلفي." : "تم التراجع الآمن عن السجلات المنشأة."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تنفيذ الإجراء"); }
    finally { setBusy(false); }
  }

  async function saveTemplate() {
    if (!inspect) return;
    const name = window.prompt("اسم قالب ربط الأعمدة"); if (!name) return;
    setBusy(true);
    try { const response = await fetch("/api/imports/templates", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ targetType, name, mapping, sourceSystemId: sourceSystemId || null, headerFingerprint: inspect.headerFingerprint }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); setMessage("تم حفظ قالب الربط."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر حفظ القالب"); }
    finally { setBusy(false); }
  }

  async function createCertificate() {
    if (!selected) return;
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/imports/certification", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ importBatchId: selected.id }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); setMessage(body.status === "MATCHED" ? "اكتملت شهادة المطابقة واعتمدت جميع الضوابط." : "أُنشئت شهادة المطابقة مع فروقات تتطلب المراجعة."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إنشاء شهادة المطابقة"); }
    finally { setBusy(false); }
  }

  const filteredBatches = useMemo(() => batches.filter((batch) => !historyFilter || `${batch.batchNumber} ${batch.sourceFile} ${batch.targetType}`.toLowerCase().includes(historyFilter.toLowerCase())), [batches, historyFilter]);
  const currentTemplates = templates.filter((template) => template.targetType === targetType);
  return <div className="mx-auto grid max-w-7xl gap-6 p-5 lg:grid-cols-[1.4fr_0.8fr]">
    <div className="space-y-6">
      {message && <div className={`rounded-xl border p-4 ${message.includes("بنجاح") || message.includes("اكتملت") || message.includes("تم حفظ") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>{message}</div>}
      <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold">1. الملف والهدف</h2><p className="text-sm text-slate-500">يدعم XLSX وXLS وCSV وجميع أوراق العمل. رفع الملف لا يغيّر البيانات.</p></div><a href="/imports/sources" className="rounded-lg border px-3 py-2 text-sm font-bold text-blue-700">أنظمة المصدر</a></div>
        <div className="grid gap-4 md:grid-cols-2"><Select label="نظام المصدر" value={sourceSystemId} onChange={setSourceSystemId} options={[["","مصدر عام"], ...sourceSystems.map((row) => [String(row.id), `${row.name} (${row.code})`])]}/><Select label="هدف الاستيراد" value={targetType} onChange={changeTarget} options={catalog.map((row) => [row.key, `${row.labelAr} (${row.moduleKey})`])}/><label className="text-sm"><span className="mb-1 block text-slate-600">ملف المصدر</span><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="w-full rounded-lg border p-2"/></label><label className="text-sm"><span className="mb-1 block text-slate-600">تاريخ التحول Cutover</span><input type="date" value={cutoverDate} onChange={(event) => setCutoverDate(event.target.value)} className="w-full rounded-lg border p-2.5"/></label><Select label="وضع الاستيراد" value={mode} onChange={setMode} options={[["FULL","تشغيلي كامل"],["HISTORICAL","مرجع تاريخي فقط"],["OPENING","أرصدة افتتاحية / Cutover"]]}/><Select label="معالجة التكرار" value={strategy} onChange={setStrategy} options={[["SKIP","تجاوز"],["UPDATE","تحديث الموجود"],["MERGE","دمج الحقول الفارغة"],["CREATE","إنشاء جديد إذا سمحت القيود"]]}/></div>
        <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || !file} onClick={inspectFile} className="rounded-lg bg-slate-900 px-4 py-2 font-bold text-white disabled:opacity-50">تحليل الأعمدة</button>{target && <a href={`/api/imports/template?target=${target.key}`} className="rounded-lg border px-4 py-2 font-bold text-blue-700">تنزيل قالب Excel</a>}{currentTemplates.map((template) => <button key={template.id} onClick={() => setMapping(template.mapping)} className="rounded-lg border px-3 py-2 text-sm">تطبيق: {template.name}</button>)}</div>
      </section>
      {inspect && <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">2. اكتشاف الأوراق والعناوين والربط</h2><p className="text-sm text-slate-500">{inspect.sheets.map((sheet) => `${sheet.name}: ${sheet.rowCount}`).join(" · ")}</p>{inspect.detectedProfile && <p className="mt-1 text-xs font-bold text-emerald-700">تم تطبيق ملف الربط: {inspect.detectedProfile.name}</p>}</div><button onClick={saveTemplate} disabled={busy} className="rounded-lg border px-3 py-2 text-sm font-bold">حفظ الربط كملف تعريف</button></div>
        {inspect.intelligence && <div className="mb-5 rounded-2xl border border-amber-200 bg-gradient-to-l from-amber-50 to-white p-4"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black tracking-wider text-amber-700">مساعد ترحيل NETAJ</p><h3 className="font-bold">تحليل قابل للتفسير — اقتراح فقط</h3></div><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">ثقة الربط {inspect.intelligence.confidence}%</span></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4"><p><b>نوع الملف:</b> {inspect.intelligence.suggestedTarget?.labelAr ?? "غير محسوم"}</p><p><b>التاريخ:</b> {inspect.intelligence.probableDateFormat}</p><p><b>العملة:</b> {inspect.intelligence.currencies.join("، ") || "غير مكتشفة"}</p><p><b>تكرار محتمل:</b> {inspect.intelligence.duplicateKeySuggestion.join(" + ") || "—"}</p></div><p className="mt-3 text-xs text-slate-600">{inspect.intelligence.reasons.join(" · ")} · لا يعتمد النظام هذه الاقتراحات قبل مراجعتك وإنشاء المعاينة وDry Run.</p>{inspect.intelligence.warnings.map((warning) => <p key={warning} className="mt-2 rounded-lg bg-amber-100 p-2 text-xs font-bold text-amber-900">{warning}</p>)}</div>}
        <div className="grid gap-3 md:grid-cols-2">{inspect.fields.map((field) => <label key={field.key} className="grid grid-cols-[1fr_1.2fr] items-center gap-2 rounded-lg border bg-slate-50 p-3 text-sm"><span>{field.labelAr}{field.required && <b className="text-red-600"> *</b>}<small className="block text-slate-400">{field.type}</small></span><select value={mapping[field.key] ?? ""} onChange={(event) => setMapping({ ...mapping, [field.key]: event.target.value })} className="rounded-lg border bg-white px-3 py-2"><option value="">غير مربوط</option>{inspect.headers.map((header) => <option key={header} value={header}>{header}</option>)}</select></label>)}</div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-right">الورقة</th><th className="p-2 text-right">الصف</th>{inspect.headers.slice(0,6).map((header) => <th key={header} className="p-2 text-right">{header}</th>)}</tr></thead><tbody>{inspect.sampleRows.map((row) => <tr key={`${row.sourceSheet}-${row.sourceRow}`} className="border-b"><td className="p-2">{row.sourceSheet}</td><td>{row.sourceRow}</td>{inspect.headers.slice(0,6).map((header) => <td key={header} className="max-w-40 truncate p-2">{String(row.raw[header] ?? "")}</td>)}</tr>)}</tbody></table></div>
        <button disabled={busy} onClick={createPreview} className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white disabled:opacity-50">إنشاء معاينة التحقق</button>
      </section>}
      {selected && (
        <BatchDetails batch={selected} target={catalog.find((row) => row.key === selected.targetType)} certificate={certificates.find((row) => row.importBatchId === selected.id)} busy={busy} dryRun={() => batchAction("DRY_RUN")} approve={() => batchAction("APPROVE")} execute={() => batchAction("QUEUE_EXECUTE")} rollback={() => batchAction("ROLLBACK")} createCertificate={createCertificate} />
      )}
    </div>
    <aside className="h-fit rounded-2xl border bg-white p-5 shadow-sm lg:sticky lg:top-4"><h2 className="font-bold">سجل دفعات الاستيراد</h2><input value={historyFilter} onChange={(event) => setHistoryFilter(event.target.value)} placeholder="بحث بالملف أو رقم الدفعة" className="my-4 w-full rounded-lg border px-3 py-2 text-sm"/><div className="max-h-[70vh] space-y-2 overflow-y-auto">{filteredBatches.map((batch) => <button key={batch.id} onClick={() => openBatch(batch.id)} className={`w-full rounded-xl border p-3 text-right ${selected?.id === batch.id ? "border-blue-500 bg-blue-50" : "hover:bg-slate-50"}`}><div className="flex items-center justify-between gap-2"><b className="text-sm">{batch.batchNumber}</b><Status value={batch.status}/></div><p className="mt-1 truncate text-xs text-slate-500">{batch.sourceFile}</p><p className="mt-2 text-xs">{batch.targetType} · {batch.totalRows} صف</p></button>)}</div></aside>
  </div>;
}

function BatchDetails({ batch, target, certificate, busy, dryRun, approve, execute, rollback, createCertificate }: { batch: Batch; target?: Target; certificate?: Certificate; busy: boolean; dryRun: () => void; approve: () => void; execute: () => void; rollback: () => void; createCertificate: () => void }) {
  const fields = target?.fields ?? [];
  const impact = batch.impact;
  return <section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-bold">3. المعاينة والفحص والاعتماد {batch.batchNumber}</h2><p className="text-sm text-slate-500">{batch.sourceFile} · {target?.labelAr ?? batch.targetType}</p></div><Status value={batch.status}/></div>
    <div className="mt-4 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">{["رفع الملف","كشف الأوراق والعناوين","ربط ومعاينة","Dry Run واعتماد","تنفيذ وتسوية"].map((step, index) => <div key={step} className={`rounded-lg border p-2 text-center ${(["PREVIEW","DRY_RUN","APPROVED","QUEUED","RUNNING","COMPLETED"].indexOf(batch.status) >= Math.max(0,index-1)) ? "border-blue-300 bg-blue-50" : "bg-slate-50"}`}>{step}</div>)}</div>
    <div className="my-5 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="الإجمالي" value={batch.totalRows}/><Metric label="صالح" value={batch.validRows} tone="green"/><Metric label="أخطاء" value={batch.invalidRows} tone="red"/><Metric label="تحذيرات" value={batch.warningRows ?? 0} tone="amber"/><Metric label="مكرر" value={batch.duplicateRows} tone="amber"/><Metric label="مراجع مفقودة" value={batch.summary?.missingReferences ?? 0} tone="red"/></div>
    {impact && <div className="mb-5 rounded-xl border bg-slate-50 p-4"><h3 className="font-bold">أثر الاستيراد المتوقع — Dry Run</h3><div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-6"><Metric label="سجلات جديدة" value={impact.expectedCreated ?? 0}/><Metric label="تحديثات" value={impact.expectedUpdated ?? 0}/><Metric label="متجاوز" value={impact.expectedSkipped ?? 0}/><Metric label="مرجع فقط" value={impact.referenceRows ?? 0}/><Metric label="أثر المخزون" value={impact.inventory?.quantity ?? 0}/><Metric label="الأثر المحاسبي" value={(impact.accounting?.debit ?? 0) - (impact.accounting?.credit ?? 0)}/></div><p className="mt-3 text-xs text-slate-600">{impact.safeguards?.join(" · ")}</p></div>}
    <div className="mb-4 flex flex-wrap gap-2">{batch.status === "PREVIEW" && <button disabled={busy || batch.invalidRows > 0} onClick={dryRun} className="rounded-lg bg-violet-700 px-5 py-2.5 font-bold text-white disabled:opacity-40">تشغيل Dry Run</button>}{batch.status === "DRY_RUN" && <button disabled={busy} onClick={approve} className="rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white disabled:opacity-40">اعتماد الاستيراد</button>}{batch.status === "APPROVED" && <button disabled={busy} onClick={execute} className="rounded-lg bg-emerald-700 px-5 py-2.5 font-bold text-white disabled:opacity-40">تنفيذ الدفعة المعتمدة</button>}{batch.status === "COMPLETED" && <><button disabled={busy} onClick={createCertificate} className="rounded-lg bg-slate-900 px-5 py-2.5 font-bold text-white disabled:opacity-40">{certificate ? "تحديث شهادة المطابقة" : "إنشاء شهادة المطابقة"}</button><button disabled={busy} onClick={rollback} className="rounded-lg border border-red-300 px-5 py-2.5 font-bold text-red-700 disabled:opacity-40">تراجع آمن</button></>}</div>
    {batch.status === "COMPLETED" && batch.reconciliation && <details open className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"><summary className="cursor-pointer font-bold text-emerald-900">تقرير التسوية بعد الاستيراد</summary><pre dir="ltr" className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(batch.reconciliation, null, 2)}</pre></details>}
    {certificate && <MigrationCertificate certificate={certificate}/>}
    <div className="overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-2 text-right">المصدر</th><th className="p-2 text-right">الحالة</th>{fields.slice(0,5).map((field) => <th key={field.key} className="p-2 text-right">{field.labelAr}</th>)}<th className="p-2 text-right">الملاحظات</th></tr></thead><tbody>{(batch.rows ?? []).map((row) => <tr key={row.id} className={`border-b ${row.status === "INVALID" ? "bg-red-50" : row.status === "DUPLICATE" ? "bg-amber-50" : ""}`}><td className="whitespace-nowrap p-2">{row.sourceSheet} / {row.sourceRow}</td><td><Status value={row.status}/></td>{fields.slice(0,5).map((field) => <td key={field.key} className="max-w-40 truncate p-2">{String(row.mappedData?.[field.key] ?? "")}</td>)}<td className="p-2 text-xs text-red-700">{[...(row.errors ?? []), ...(row.warnings ?? [])].join("، ")}</td></tr>)}</tbody></table></div>
    {batch.totalRows > 500 && <p className="mt-3 text-xs text-slate-500">تعرض الواجهة أول 500 صف. ملخص الدفعة يشمل جميع الصفوف.</p>}
  </section>;
}
function MigrationCertificate({ certificate }: { certificate: Certificate }) { return <section className="migration-certificate mb-5 rounded-xl border-2 border-amber-300 bg-amber-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-black tracking-widest text-amber-700">NETAJ MIGRATION CERTIFICATE</p><h3 className="text-lg font-black">شهادة مطابقة الترحيل</h3><p className="text-xs text-slate-500">{certificate.certificateNumber} · {new Date(certificate.generatedAt).toLocaleString("ar-SA")}</p></div><span className={`rounded-full px-3 py-1 text-xs font-black ${certificate.status === "MATCHED" ? "bg-emerald-700 text-white" : certificate.status === "MISMATCH" ? "bg-red-700 text-white" : "bg-amber-300 text-amber-950"}`}>{certificate.status}</span></div>{certificate.status !== "MATCHED" && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm font-bold text-red-800">لا تُعد الهجرة ناجحة نهائيًا حتى تفسير الفروقات غير الصفرية واعتمادها.</p>}<div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead><tr className="border-b border-amber-300"><th className="p-2 text-right">الضابط</th><th>النظام القديم</th><th>NETAJ</th><th>الفرق</th><th>الحالة</th></tr></thead><tbody>{certificate.controls.map((row) => <tr key={row.key} className="border-b border-amber-200"><td className="p-2"><b>{row.label}</b><small className="block text-slate-500">{row.explanation}</small></td><td className="text-center">{row.legacyTotal.toLocaleString()}</td><td className="text-center">{row.netajTotal.toLocaleString()}</td><td className={`text-center font-bold ${row.difference ? "text-red-700" : "text-emerald-700"}`}>{row.difference.toLocaleString()}</td><td className="text-center">{row.status}</td></tr>)}</tbody></table></div><div className="mt-4 flex flex-wrap gap-2 print:hidden"><a href={`/api/imports/certification/${certificate.id}/export?format=xlsx`} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">Excel</a><a href={`/api/imports/certification/${certificate.id}/export?format=pdf`} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">PDF</a><button onClick={() => window.print()} className="rounded-lg border bg-white px-3 py-2 text-sm font-bold">طباعة</button></div></section>; }
function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[][] }) { return <label className="text-sm"><span className="mb-1 block text-slate-600">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border bg-white px-3 py-2.5">{options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>; }
function Status({ value }: { value: string }) { return <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-bold ${badge[value] ?? "bg-slate-100 text-slate-700"}`}>{statusLabels[value] ?? value}</span>; }
function Metric({ label, value, tone }: { label: string; value: number; tone?: "green" | "red" | "amber" }) { return <div className={`rounded-xl p-3 ${tone === "green" ? "bg-emerald-50" : tone === "red" ? "bg-red-50" : tone === "amber" ? "bg-amber-50" : "bg-slate-50"}`}><p className="text-xs text-slate-500">{label}</p><b className="text-xl">{value}</b></div>; }
