"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

type Currency = { code: string; nameAr: string; nameEn: string; symbol: string | null; decimalPlaces: number; isActive: boolean };
type Workspace = { company: { legalNameAr: string; baseCurrencyCode: string }; currencies: Currency[]; baseLocked: boolean; canManageCatalog: boolean; canManageCompany: boolean; accounts: { id: number; code: string; nameAr: string; accountType: string }[]; mappings: { key: string; name: string; accountType: string; accountId: number | null }[] };
const field = "w-full rounded-xl border border-[#e4d7bf] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#bd913f] disabled:bg-[#f4f0e8]";
const gold = "rounded-xl border border-[#cba454] bg-gradient-to-l from-[#b98d38] to-[#ebce83] px-4 py-2.5 text-sm font-bold text-slate-900 disabled:opacity-50";
const secondary = "rounded-xl border border-[#dfd2ba] bg-white px-4 py-2.5 text-sm text-slate-800 disabled:opacity-50";
const blank: Currency = { code: "", nameAr: "", nameEn: "", symbol: "", decimalPlaces: 2, isActive: true };

export default function CurrencySetupPanel() {
  const [data, setData] = useState<Workspace | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""), [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Currency | null>(null), [creating, setCreating] = useState(false), [base, setBase] = useState("");
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    const response = await fetch("/api/finance/currency-setup", { cache: "no-store" }), body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "تعذر تحميل العملات");
    setData(body); setBase(body.company.baseCurrencyCode); setMappings(Object.fromEntries(body.mappings.map((row: Workspace["mappings"][number]) => [row.key, row.accountId ? String(row.accountId) : ""])));
  }, []);
  useEffect(() => { load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }, [load]);
  useEffect(() => { if (!editing) return; const previous = document.body.style.overflow; document.body.style.overflow = "hidden"; const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !busy) setEditing(null); }; document.addEventListener("keydown", close); return () => { document.body.style.overflow = previous; document.removeEventListener("keydown", close); }; }, [editing, busy]);
  async function save(event: FormEvent, action: "CATALOG" | "COMPANY") {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage("");
    try {
      const payload = action === "CATALOG" ? { action, ...editing } : { action, baseCurrencyCode: base, mappings };
      const response = await fetch("/api/finance/currency-setup", { method: action === "CATALOG" && creating ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "لم يتم الحفظ");
      await load(); setEditing(null); setMessage(action === "CATALOG" ? "تم حفظ تعريف العملة في الكتالوج المشترك" : "تم حفظ عملة الشركة وربط حسابات فروق الصرف الفعلية");
    } catch (error) { setMessage(error instanceof Error ? error.message : "تعذر الحفظ"); }
    finally { setBusy(false); }
  }
  const visible = data?.currencies.filter(row => `${row.code} ${row.nameAr} ${row.nameEn}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const modal = editing ? createPortal(<div style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "rgba(15,23,42,.48)" }}><section role="dialog" aria-modal="true" aria-labelledby="currency-dialog-title" dir="rtl" className="w-full max-w-2xl overflow-auto rounded-3xl border border-[#dccba8] bg-[#fffdf8] p-6 shadow-2xl" style={{ maxHeight: "90dvh" }}>
    <header className="mb-5 flex items-center justify-between border-b border-[#e5d8c0] pb-4"><h2 id="currency-dialog-title" className="text-xl font-bold">{creating ? "إضافة عملة" : `تحرير العملة ${editing.code}`}</h2><button disabled={busy} onClick={() => setEditing(null)} aria-label="إغلاق" className={secondary}>×</button></header>
    {message && <p role="alert" className="mb-4 rounded-xl bg-amber-50 p-3 text-sm">{message}</p>}
    <form onSubmit={event => save(event, "CATALOG")} className="space-y-4"><p className="text-sm text-slate-600">الكتالوج مشترك بين الشركات. تعديل الاسم أو الحالة لا يغير أسعار الصرف التاريخية أو المبالغ المرحلة.</p><div className="grid gap-4 sm:grid-cols-2">
      <label>رمز ISO<input required autoFocus={creating} readOnly={!creating} maxLength={3} pattern="[A-Z]{3}" value={editing.code} onChange={event => { const code = event.target.value.toUpperCase(); let decimalPlaces = 2; if (/^[A-Z]{3}$/.test(code)) decimalPlaces = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2; setEditing({ ...editing, code, decimalPlaces }); }} className={field} dir="ltr" /></label>
      <label>رمز العرض<input maxLength={12} value={editing.symbol ?? ""} onChange={event => setEditing({ ...editing, symbol: event.target.value })} className={field}/></label>
      <label>الاسم العربي<input required maxLength={100} value={editing.nameAr} onChange={event => setEditing({ ...editing, nameAr: event.target.value })} className={field}/></label>
      <label>الاسم الإنجليزي<input required maxLength={100} value={editing.nameEn} onChange={event => setEditing({ ...editing, nameEn: event.target.value })} className={field}/></label>
      <label>خانات الكسور وفق ISO<input type="number" min={0} max={4} required value={editing.decimalPlaces} onChange={event => setEditing({ ...editing, decimalPlaces: Number(event.target.value) })} className={field}/></label>
      <label>الحالة<select value={editing.isActive ? "active" : "inactive"} onChange={event => setEditing({ ...editing, isActive: event.target.value === "active" })} className={field}><option value="active">نشطة</option><option value="inactive">موقوفة</option></select></label>
    </div><div className="flex gap-3"><button disabled={busy} className={gold}>{busy ? "جارٍ الحفظ…" : "حفظ العملة"}</button><button type="button" disabled={busy} className={secondary} onClick={() => setEditing(null)}>إلغاء</button></div></form>
  </section></div>, document.body) : null;
  if (loading) return <p role="status" className="p-6">جارٍ تحميل إعدادات العملات…</p>;
  if (!data) return <div role="alert" className="rounded-xl bg-amber-50 p-4">{message}<button className={`${secondary} mr-4`} onClick={() => { setLoading(true); load().catch(error => setMessage(error.message)).finally(() => setLoading(false)); }}>إعادة المحاولة</button></div>;
  return <section dir="rtl" className="space-y-5 rounded-3xl border border-[#e3d4b8] bg-white p-5 md:p-6"><header className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold">تعريف العملات والربط المحاسبي</h2><p className="mt-1 text-sm text-slate-500">{data.company.legalNameAr} · العملة الوظيفية {data.company.baseCurrencyCode}</p></div>{data.canManageCatalog && <button className={gold} onClick={() => { setCreating(true); setEditing({ ...blank }); setMessage(""); }}>+ إضافة عملة</button>}</header>
    {message && <p role="status" className="rounded-xl bg-amber-50 p-3">{message}</p>}
    <label className="block max-w-lg">بحث العملة<input className={field} value={query} onChange={event => setQuery(event.target.value)} placeholder="الرمز أو الاسم"/></label>
    <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="bg-[#f1e8d7]"><tr>{["رمز ISO", "الاسم العربي", "الاسم الإنجليزي", "الرمز", "خانات الكسور", "الحالة", "الإجراء"].map(label => <th key={label} className="p-3 text-right">{label}</th>)}</tr></thead><tbody>{visible.map(row => <tr key={row.code} className="border-b border-[#eee5d7]"><td className="p-3 font-bold">{row.code}</td><td>{row.nameAr}</td><td>{row.nameEn}</td><td>{row.symbol ?? "—"}</td><td>{row.decimalPlaces}</td><td>{row.isActive ? "نشطة" : "موقوفة"}</td><td className="p-3">{data.canManageCatalog ? <button className={gold} onClick={() => { setCreating(false); setEditing({ ...row }); setMessage(""); }}>تحرير</button> : <span className="text-slate-500">للعرض</span>}</td></tr>)}</tbody></table></div>
    {!visible.length && <p className="text-center text-slate-500">لا توجد عملات تطابق البحث.</p>}
    <p className="text-sm text-slate-500">الكتالوج العام يديره مسؤول المنصة بصلاحية إدارة الإعدادات. أسعار الصرف وسجلها مستقلة لكل شركة؛ لا توجد أسعار شراء وبيع منفصلة في النظام الحالي.</p>
    <form onSubmit={event => save(event, "COMPANY")} className="space-y-4 rounded-2xl border border-[#e5d8c0] bg-[#fcfaf5] p-4"><h3 className="font-bold">العملة الوظيفية وحسابات فروق الصرف</h3><div className="grid gap-4 md:grid-cols-2"><label className="md:col-span-2">العملة الوظيفية<select className={field} disabled={data.baseLocked || !data.canManageCompany || busy} value={base} onChange={event => setBase(event.target.value)}>{data.currencies.filter(row => row.isActive || row.code === base).map(row => <option value={row.code} key={row.code} disabled={row.decimalPlaces !== 2 && row.code !== base}>{row.code} — {row.nameAr}{row.decimalPlaces !== 2 ? " (غير مدعومة كعملة وظيفية حاليًا)" : ""}</option>)}</select><small className="mt-1 block text-slate-500">{data.baseLocked ? "مقفلة لوجود معاملات أو أسعار صرف؛ تغييرها يحتاج تحويلًا محاسبيًا مستقلًا." : "محرك الدفتر يدعم حاليًا العملة الوظيفية ذات خانتين عشريتين."}</small></label>
      {data.mappings.map(row => <label key={row.key}>{row.name}<select className={field} required disabled={!data.canManageCompany || busy} value={mappings[row.key] ?? ""} onChange={event => setMappings({ ...mappings, [row.key]: event.target.value })}><option value="">اختر حساب حركة نشطًا</option>{data.accounts.filter(account => account.accountType === row.accountType).map(account => <option key={account.id} value={account.id}>{account.code} — {account.nameAr}</option>)}</select></label>)}
    </div><p className="text-sm text-slate-600">تستخدم التسويات وسندات السداد حسابات الفروق المحققة، وتستخدم إعادة تقييم نهاية الفترة الحسابات غير المحققة. تغيير الربط يؤثر على القيود الجديدة فقط.</p>{data.canManageCompany ? <button disabled={busy} className={gold}>{busy ? "جارٍ الحفظ…" : "حفظ الربط المحاسبي"}</button> : <p className="text-sm text-slate-500">تعديل إعداد الشركة يحتاج صلاحية إدارة الإعدادات.</p>}</form>{modal}
  </section>;
}
