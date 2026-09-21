"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

type Center = { id: number; code: string; nameAr: string; nameEn: string | null; isActive: boolean; parentId: number | null; parentName: string | null; level: number; branchId: number | null; branchName: string | null; allowPosting: boolean; centerType: string; linkedEntityId: number | null; notes: string; childCount: number };
type Workspace = { rows: Center[]; branches: { id: number; nameAr: string; isActive: boolean }[]; projects: { id: number; name: string; projectCode: string }[]; vehicles: { id: number; plateNumber: string }[]; departments: { id: number; nameAr: string }[]; company: { nameAr: string; baseCurrencyCode: string } | null };
type Movement = { id: number; centerCode: string; centerName: string; branchName: string; journalId: number; entryNumber: string; date: string; accountCode: string; accountName: string; description: string | null; referenceType: string | null; referenceNumber: string | null; debit: number; credit: number; balance: number };
type Report = { rows: Movement[]; totals: { opening: number; debit: number; credit: number; closing: number; revenue: number; costs: number; netProfit: number }; comparison: { id: number; code: string; nameAr: string; revenue: number; costs: number; netProfit: number }[] };
type Entry = { entryNumber: string; entryDate: string; description: string; referenceNumber: string; totalDebit: string; totalCredit: string; lines: { id: number; accountCode: string; accountName: string; debit: string; credit: string; description: string }[] };
const api = "/api/finance/cost-centers";
const field = "w-full rounded-xl border border-[#e4d7bf] bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#bd913f]";
const button = "rounded-xl border border-[#cba454] bg-gradient-to-l from-[#b98d38] to-[#ebce83] px-4 py-2.5 text-sm font-bold text-slate-900 disabled:opacity-50";
const secondary = "rounded-xl border border-[#dfd2ba] bg-white px-4 py-2.5 text-sm text-slate-800 disabled:opacity-50";
const typeNames: Record<string, string> = { GENERAL: "عام", PROJECT: "مشروع", VEHICLE: "مركبة", FACTORY: "مصنع", DEPARTMENT: "إدارة" };
const money = (value: number | string) => Number(value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function CostCentersPanel({ mode = "directory" }: { mode?: "directory" | "detail" }) {
  const [data, setData] = useState<Workspace | null>(null), [report, setReport] = useState<Report | null>(null);
  const [message, setMessage] = useState(""), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(""), [branchId, setBranchId] = useState(""), [status, setStatus] = useState("");
  const [tree, setTree] = useState(true), [collapsed, setCollapsed] = useState<Set<number>>(new Set()), [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Partial<Center> | null>(null), [entry, setEntry] = useState<Entry | null>(null);
  const [reportParams, setReportParams] = useState("view=detail"), [reportLoading, setReportLoading] = useState(false);
  const load = useCallback(async () => {
    const response = await fetch(api, { cache: "no-store" }), body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "تعذر تحميل المراكز");
    setData(body);
  }, []);
  const loadReport = useCallback(async (params: string) => {
    setReportLoading(true);
    try { const response = await fetch(`${api}?${params}`, { cache: "no-store" }), body = await response.json(); if (!response.ok) throw new Error(body.error); setReport(body); setReportParams(params); setPage(1); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر إعداد التقرير"); }
    finally { setReportLoading(false); }
  }, []);
  useEffect(() => { let active = true; load().catch(error => { if (active) setMessage(error.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [load]);
  useEffect(() => { if (mode === "detail") void loadReport("view=detail"); setPage(1); }, [mode, loadReport]);
  useEffect(() => { setPage(1); }, [query, branchId, status, tree]);
  useEffect(() => { if (!editing && !entry) return; const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) { setEditing(null); setEntry(null); } }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [editing, entry, busy]);

  const visible = useMemo(() => {
    if (!data) return [];
    const rows = data.rows.filter(row => (!query || `${row.code} ${row.nameAr} ${row.nameEn ?? ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (!branchId || row.branchId === Number(branchId)) && (!status || row.isActive === (status === "active")));
    if (!tree || query || branchId || status) return rows;
    const result: Center[] = [], seen = new Set<number>();
    const visit = (row: Center) => { if (seen.has(row.id)) return; seen.add(row.id); result.push(row); if (!collapsed.has(row.id)) rows.filter(child => child.parentId === row.id).forEach(visit); };
    rows.filter(row => !row.parentId || !rows.some(parent => parent.id === row.parentId)).forEach(visit);
    return result;
  }, [data, query, branchId, status, tree, collapsed]);
  const directoryParams = new URLSearchParams({ q: query, branchId, status });
  const activeParams = mode === "detail" ? reportParams : directoryParams.toString();
  const count = mode === "detail" ? report?.rows.length ?? 0 : visible.length;
  const pages = Math.max(1, Math.ceil(count / 25)), currentPage = Math.min(page, pages);
  const edit = (row?: Center) => { setMessage(""); setEditing(row ? { ...row } : { code: "", nameAr: "", nameEn: "", isActive: true, parentId: null, branchId: null, allowPosting: true, centerType: "GENERAL", linkedEntityId: null, notes: "" }); };
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editing || busy) return; setBusy(true); setMessage("");
    try { const response = await fetch(api, { method: editing.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(editing) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); setEditing(null); setMessage("تم حفظ مركز التكلفة وربطه بالشركة وسجل التدقيق"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); }
    finally { setBusy(false); }
  }
  async function toggle(row: Center) {
    setBusy(true); setMessage("");
    try { const response = await fetch(api, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: row.id, isActive: !row.isActive }) }), body = await response.json(); if (!response.ok) throw new Error(body.error); await load(); setMessage(row.isActive ? "تم إيقاف المركز مع الاحتفاظ بحركاته" : "تم تفعيل المركز"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحديث الحالة"); }
    finally { setBusy(false); }
  }
  async function openEntry(id: number) {
    setMessage("");
    try { const response = await fetch(`${api}?entryId=${id}`, { cache: "no-store" }), body = await response.json(); if (!response.ok) throw new Error(body.error); setEntry(body); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر تحميل القيد"); }
  }
  function submitReport(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const values = new FormData(event.currentTarget), params = new URLSearchParams({ view: "detail" }); for (const [key, value] of values) if (String(value)) params.set(key, String(value)); void loadReport(params.toString()); }
  const modal = editing || entry ? createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15,23,42,.48)" }}><section role="dialog" aria-modal="true" aria-labelledby="cost-center-dialog-title" dir="rtl" className="w-full max-w-3xl overflow-auto rounded-3xl border border-[#dccba8] bg-[#fffdf8] p-6 shadow-2xl" style={{ maxHeight: "90dvh" }}>
    <header className="mb-5 flex items-center justify-between border-b border-[#e5d8c0] pb-4"><h2 id="cost-center-dialog-title" className="text-xl font-bold">{entry ? `القيد ${entry.entryNumber}` : editing?.id ? "تعديل مركز التكلفة" : "إضافة مركز تكلفة"}</h2><button type="button" aria-label="إغلاق" disabled={busy} className={secondary} onClick={() => { setEditing(null); setEntry(null); }}>×</button></header>
    {message && <p role="status" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">{message}</p>}
    {editing && <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
      <label>رمز المركز<input required maxLength={50} value={editing.code ?? ""} disabled={!!editing.id} onChange={event => setEditing({ ...editing, code: event.target.value })} className={field}/></label>
      <label>الاسم العربي<input required maxLength={200} value={editing.nameAr ?? ""} onChange={event => setEditing({ ...editing, nameAr: event.target.value })} className={field}/></label>
      <label>الاسم الإنجليزي<input value={editing.nameEn ?? ""} onChange={event => setEditing({ ...editing, nameEn: event.target.value })} className={field}/></label>
      <label>المركز الأب<select value={editing.parentId ?? ""} onChange={event => { const parent = data?.rows.find(row => row.id === Number(event.target.value)); setEditing({ ...editing, parentId: Number(event.target.value) || null, branchId: parent?.branchId ?? editing.branchId }); }} className={field}><option value="">بدون مركز أب</option>{data?.rows.filter(row => row.id !== editing.id && row.isActive && !row.allowPosting).map(row => <option key={row.id} value={row.id}>{row.code} — {row.nameAr}</option>)}</select></label>
      <label>فرع المركز<select value={editing.branchId ?? ""} onChange={event => setEditing({ ...editing, branchId: Number(event.target.value) || null })} className={field}><option value="">كل الفروع</option>{data?.branches.filter(row => row.isActive).map(row => <option key={row.id} value={row.id}>{row.nameAr}</option>)}</select></label>
      <label>نوع المركز<select value={editing.centerType ?? "GENERAL"} onChange={event => setEditing({ ...editing, centerType: event.target.value, linkedEntityId: null })} className={field}>{Object.entries(typeNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
      {["PROJECT", "VEHICLE", "DEPARTMENT"].includes(editing.centerType ?? "") && <label>الربط التشغيلي<select value={editing.linkedEntityId ?? ""} onChange={event => setEditing({ ...editing, linkedEntityId: Number(event.target.value) || null })} className={field}><option value="">غير مرتبط</option>{editing.centerType === "PROJECT" ? data?.projects.map(row => <option key={row.id} value={row.id}>{row.projectCode} — {row.name}</option>) : editing.centerType === "VEHICLE" ? data?.vehicles.map(row => <option key={row.id} value={row.id}>{row.plateNumber}</option>) : data?.departments.map(row => <option key={row.id} value={row.id}>{row.nameAr}</option>)}</select></label>}
      <label>طبيعة المركز<select value={editing.allowPosting ? "posting" : "group"} onChange={event => setEditing({ ...editing, allowPosting: event.target.value === "posting" })} className={field}><option value="posting">مركز حركة — يسمح بالترحيل</option><option value="group">مركز رئيسي — يمنع الترحيل المباشر</option></select></label>
      <label>الحالة<select value={editing.isActive ? "active" : "inactive"} onChange={event => setEditing({ ...editing, isActive: event.target.value === "active" })} className={field}><option value="active">نشط</option><option value="inactive">موقوف</option></select></label>
      <label className="sm:col-span-2">ملاحظات<textarea value={editing.notes ?? ""} onChange={event => setEditing({ ...editing, notes: event.target.value })} className={field}/></label>
      <div className="flex gap-3 sm:col-span-2"><button disabled={busy} className={button}>{busy ? "جارٍ الحفظ…" : "حفظ مركز التكلفة"}</button><button type="button" disabled={busy} className={secondary} onClick={() => setEditing(null)}>إلغاء</button></div>
    </form>}
    {entry && <><p className="mb-4">{entry.entryDate.slice(0, 10)} · {entry.description} · {entry.referenceNumber}</p><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-[#f1e8d7]"><tr>{["الحساب", "الاسم", "البيان", "مدين", "دائن"].map(label => <th key={label} className="p-3 text-right">{label}</th>)}</tr></thead><tbody>{entry.lines.map(row => <tr key={row.id} className="border-b"><td className="p-3">{row.accountCode}</td><td>{row.accountName}</td><td>{row.description}</td><td>{money(row.debit)}</td><td>{money(row.credit)}</td></tr>)}</tbody><tfoot><tr><th colSpan={3} className="p-3 text-right">الإجمالي</th><th>{money(entry.totalDebit)}</th><th>{money(entry.totalCredit)}</th></tr></tfoot></table></div></>}
  </section></div>, document.body) : null;

  if (loading) return <p role="status" className="p-6">جارٍ تحميل مراكز التكلفة…</p>;
  if (!data) return <div className="rounded-2xl border p-6"><p role="alert">{message || "تعذر تحميل المراكز"}</p><button className={button} onClick={() => { setLoading(true); load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }}>إعادة المحاولة</button></div>;
  return <section dir="rtl" className="space-y-5 rounded-3xl border border-[#e3d4b8] bg-white p-5 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900">{mode === "detail" ? "مركز التكلفة التفصيلي" : "مراكز التكلفة"}</h2><p className="mt-1 text-sm text-slate-500">{mode === "detail" ? `حركات الأستاذ المرحلة · ${data.company?.baseCurrencyCode ?? ""}` : `${data.rows.length} مركزًا · ${data.company?.nameAr ?? ""}`}</p></div>{mode === "directory" && <button type="button" className={button} onClick={() => edit()}>+ إضافة مركز تكلفة</button>}</header>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm">{message}</p>}
    {mode === "directory" ? <div className="grid gap-3 md:grid-cols-4"><input aria-label="بحث المراكز" value={query} onChange={event => setQuery(event.target.value)} placeholder="رقم أو اسم مركز التكلفة" className={field}/><select aria-label="فلترة فرع المركز" value={branchId} onChange={event => setBranchId(event.target.value)} className={field}><option value="">كل الفروع</option>{data.branches.map(row => <option key={row.id} value={row.id}>{row.nameAr}</option>)}</select><select aria-label="فلترة الحالة" value={status} onChange={event => setStatus(event.target.value)} className={field}><option value="">كل الحالات</option><option value="active">نشط</option><option value="inactive">موقوف</option></select><button type="button" className={secondary} onClick={() => setTree(value => !value)}>{tree ? "عرض جدولي" : "عرض شجري"}</button></div>
    : <form onSubmit={submitReport} className="grid gap-3 md:grid-cols-3"><label>مركز التكلفة<select name="centerId" className={field}><option value="">مقارنة كل المراكز</option>{data.rows.map(row => <option key={row.id} value={row.id}>{row.code} — {row.nameAr}</option>)}</select></label><label>من تاريخ<input name="from" type="date" className={field}/></label><label>إلى تاريخ<input name="to" type="date" className={field}/></label><label>فرع المركز<select name="branchId" className={field}><option value="">كل الفروع</option>{data.branches.map(row => <option key={row.id} value={row.id}>{row.nameAr}</option>)}</select></label><label>بحث في القيد أو الحساب<input name="q" className={field} placeholder="رقم القيد أو الحساب أو البيان"/></label><label>نطاق المركز<select name="includeChildren" className={field}><option value="true">يشمل المراكز الفرعية</option><option value="false">المركز المحدد فقط</option></select></label><button disabled={reportLoading} className={button}>{reportLoading ? "جارٍ إعداد التقرير…" : "عرض الحركات"}</button></form>}
    <div className="flex flex-wrap gap-2"><a className={secondary} href={`${api}?${activeParams}&format=xlsx`}>Excel</a><a className={secondary} href={`${api}?${activeParams}&format=print`} target="_blank" rel="noreferrer">طباعة / حفظ PDF</a>{mode === "directory" && tree && <><button className={secondary} onClick={() => setCollapsed(new Set())}>توسيع الكل</button><button className={secondary} onClick={() => setCollapsed(new Set(data.rows.filter(row => row.childCount).map(row => row.id)))}>طي الكل</button></>}</div>
    {mode === "detail" && report && <><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{([["رصيد أول الفترة", report.totals.opening], ["الإيرادات", report.totals.revenue], ["التكاليف", report.totals.costs], ["صافي الربح / الخسارة", report.totals.netProfit]] as const).map(([label, value]) => <div key={label} className="rounded-2xl bg-[#f4eddf] p-4"><p className="text-sm text-slate-600">{label}</p><strong dir="ltr" className="mt-2 block text-xl">{money(value)}</strong></div>)}</div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm"><thead className="bg-[#f1e8d7]"><tr>{["المركز", "الإيرادات", "التكاليف", "النتيجة"].map(label => <th key={label} className="p-3 text-right">{label}</th>)}</tr></thead><tbody>{report.comparison.map(row => <tr key={row.id} className="border-b border-[#eee5d7]"><td className="p-3">{row.code} — {row.nameAr}</td><td>{money(row.revenue)}</td><td>{money(row.costs)}</td><td>{money(row.netProfit)}</td></tr>)}</tbody></table></div></>}
    <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-sm"><thead className="bg-[#f1e8d7]"><tr>{(mode === "directory" ? ["الرمز", "المركز", "المستوى", "الفرع", "النوع", "الترحيل المباشر", "الحالة", "الإجراءات"] : ["التاريخ", "المركز", "القيد / المصدر", "الحساب", "البيان", "مدين", "دائن", "الرصيد"]).map(label => <th key={label} className="p-3 text-right whitespace-nowrap">{label}</th>)}</tr></thead><tbody>
      {mode === "directory" ? visible.slice((currentPage - 1) * 25, currentPage * 25).map(row => <tr key={row.id} className="border-b border-[#eee5d7]"><td className="p-3" dir="ltr">{row.code}</td><td className="p-3"><span style={{ paddingInlineStart: tree && !query ? (row.level - 1) * 16 : 0 }}>{tree && row.childCount > 0 && <button aria-label={`${collapsed.has(row.id) ? "توسيع" : "طي"} ${row.nameAr}`} className="mx-1 font-bold text-[#a07b2c]" onClick={() => setCollapsed(previous => { const next = new Set(previous); if (next.has(row.id)) next.delete(row.id); else next.add(row.id); return next; })}>{collapsed.has(row.id) ? "+" : "−"}</button>}{row.nameAr}</span>{row.nameEn && <small className="block text-slate-500">{row.nameEn}</small>}</td><td className="p-3">{row.level}</td><td>{row.branchName ?? "كل الفروع"}</td><td>{typeNames[row.centerType]}</td><td>{row.allowPosting ? "مسموح" : "مركز رئيسي"}</td><td>{row.isActive ? "نشط" : "موقوف"}</td><td className="p-3"><div className="flex gap-2"><button disabled={busy} className={button} onClick={() => edit(row)}>تحرير</button><button disabled={busy} className={secondary} onClick={() => toggle(row)}>{row.isActive ? "إيقاف" : "تفعيل"}</button></div></td></tr>)
      : report?.rows.slice((currentPage - 1) * 25, currentPage * 25).map(row => <tr key={row.id} className="border-b border-[#eee5d7]"><td className="p-3 whitespace-nowrap">{row.date}</td><td className="p-3">{row.centerCode}<br/>{row.centerName}</td><td className="p-3"><button className="text-[#997126] underline" onClick={() => openEntry(row.journalId)}>{row.entryNumber}</button><small className="block text-slate-500">{row.referenceNumber}</small></td><td className="p-3">{row.accountCode}<br/>{row.accountName}</td><td className="p-3">{row.description}</td><td className="p-3" dir="ltr">{money(row.debit)}</td><td className="p-3" dir="ltr">{money(row.credit)}</td><td className="p-3" dir="ltr">{money(row.balance)}</td></tr>)}
    </tbody>{mode === "detail" && report && <tfoot className="bg-[#f4eddf]"><tr><th colSpan={5} className="p-3 text-right">إجمالي الحركة ورصيد نهاية الفترة</th><th>{money(report.totals.debit)}</th><th>{money(report.totals.credit)}</th><th>{money(report.totals.closing)}</th></tr></tfoot>}</table></div>
    {!count && <p className="py-5 text-center text-slate-500">{mode === "detail" ? "لا توجد حركات مرحلة ضمن الفترة والفلاتر المحددة." : "لا توجد مراكز مطابقة للفلاتر."}</p>}
    <footer className="flex flex-wrap items-center justify-between gap-3 text-sm"><span>{count} {mode === "detail" ? "حركة" : "مركزًا"} · الصفحة {currentPage} من {pages}</span><div className="flex gap-2"><button className={secondary} disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>السابق</button><button className={secondary} disabled={currentPage === pages} onClick={() => setPage(currentPage + 1)}>التالي</button></div></footer>{modal}
  </section>;
}
