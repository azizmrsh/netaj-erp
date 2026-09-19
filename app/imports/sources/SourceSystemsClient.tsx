"use client";

import { useEffect, useState } from "react";

type Source = { id: number; code: string; name: string; vendor: string | null; version: string | null; description: string | null; isActive: boolean; _count: { batches: number; templates: number } };

export default function SourceSystemsClient() {
  const [sources, setSources] = useState<Source[]>([]), [message, setMessage] = useState(""), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ code: "", name: "", vendor: "", version: "", description: "" });
  async function load() { const response = await fetch("/api/imports/source-systems", { cache: "no-store" }), body = await response.json(); if (!response.ok) throw new Error(body.error); setSources(body); }
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/imports/source-systems", { cache: "no-store", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok) throw new Error(body.error); return body; })
      .then(setSources)
      .catch((error) => { if (error.name !== "AbortError") setMessage(error.message); });
    return () => controller.abort();
  }, []);
  async function create() {
    setBusy(true); setMessage("");
    try { const response = await fetch("/api/imports/source-systems", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) }), body = await response.json(); if (!response.ok) throw new Error(body.error); setForm({ code: "", name: "", vendor: "", version: "", description: "" }); await load(); setMessage("تمت إضافة نظام المصدر."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); } finally { setBusy(false); }
  }
  return <div className="mx-auto max-w-6xl space-y-6 p-5">
    {message && <div className="rounded-xl border bg-white p-4">{message}</div>}
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="text-lg font-bold">إضافة نظام قديم</h2><p className="mt-1 text-sm text-slate-500">تعريف المصدر مرة واحدة يسمح بإعادة استخدام ملفات الربط تلقائيًا للشركات التي تستخدم النظام نفسه.</p>
      <div className="mt-4 grid gap-3 md:grid-cols-2"><Input label="الكود" value={form.code} onChange={(value) => setForm({ ...form, code: value })}/><Input label="الاسم" value={form.name} onChange={(value) => setForm({ ...form, name: value })}/><Input label="الشركة المنتجة" value={form.vendor} onChange={(value) => setForm({ ...form, vendor: value })}/><Input label="الإصدار" value={form.version} onChange={(value) => setForm({ ...form, version: value })}/><label className="text-sm md:col-span-2"><span className="mb-1 block text-slate-600">الوصف</span><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="w-full rounded-lg border p-2"/></label></div>
      <button disabled={busy || !form.code || !form.name} onClick={create} className="mt-4 rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white disabled:opacity-40">حفظ نظام المصدر</button>
    </section>
    <section className="rounded-2xl border bg-white p-5 shadow-sm"><h2 className="font-bold">أنظمة المصدر</h2><div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr><th className="p-3 text-right">الكود</th><th className="p-3 text-right">النظام</th><th className="p-3 text-right">المورد / الإصدار</th><th className="p-3 text-right">قوالب الربط</th><th className="p-3 text-right">الدفعات</th><th className="p-3 text-right">الحالة</th></tr></thead><tbody>{sources.map((source) => <tr key={source.id} className="border-b"><td className="p-3 font-mono">{source.code}</td><td className="p-3"><b>{source.name}</b><p className="text-xs text-slate-500">{source.description}</p></td><td className="p-3">{[source.vendor, source.version].filter(Boolean).join(" · ") || "—"}</td><td className="p-3">{source._count.templates}</td><td className="p-3">{source._count.batches}</td><td className="p-3">{source.isActive ? "نشط" : "متوقف"}</td></tr>)}</tbody></table>{!sources.length && <p className="p-8 text-center text-slate-500">لا توجد أنظمة مصدر بعد.</p>}</div></section>
  </div>;
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm"><span className="mb-1 block text-slate-600">{label}</span><input value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border p-2"/></label>; }
