"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type ModuleRow = { moduleKey: string; enabled: boolean; module: { nameAr: string; isCore: boolean } };
type Company = {
  id: number;
  code: string;
  legalNameAr: string;
  legalNameEn?: string | null;
  country: { nameAr: string };
  baseCurrency: { code: string; nameAr: string };
  timeZone: { label: string };
  branches: Array<{ id: number; nameAr: string }>;
  warehouses: Array<{ id: number; nameAr: string }>;
  modules: ModuleRow[];
};
type Workspace = {
  tenant: { name: string; companies: Company[] };
  countries: Array<{ code: string; nameAr: string }>;
  currencies: Array<{ code: string; nameAr: string }>;
  languages: Array<{ code: string; nativeName: string }>;
  timeZones: Array<{ name: string; label: string }>;
};

export default function OrganizationClient({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/platform", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل إعدادات المؤسسة");
    setWorkspace(payload);
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/platform", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر إنشاء الشركة");
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إنشاء الشركة");
    } finally {
      setBusy(false);
    }
  }

  async function toggleModule(companyId: number, row: ModuleRow) {
    setError("");
    const response = await fetch(`/api/platform/companies/${companyId}/modules`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ moduleKey: row.moduleKey, enabled: !row.enabled }),
    });
    const payload = await response.json();
    if (!response.ok) {
      setError(payload.error || "تعذر تحديث الوحدة");
      return;
    }
    await load();
  }

  return (
    <main dir="rtl" className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-cyan-300">Global SaaS Core</p>
            <h1 className="text-3xl font-bold">المؤسسة والشركات</h1>
            <p className="mt-2 text-slate-400">{workspace.tenant.name} · {workspace.tenant.companies.length} شركة</p>
          </div>
          <Link href="/" className="rounded-xl border border-slate-700 px-4 py-2 hover:bg-slate-800">العودة للرئيسية</Link>
        </header>

        {error && <div role="alert" className="rounded-xl border border-red-500/50 bg-red-950/40 p-4 text-red-200">{error}</div>}

        <section className="grid gap-5 lg:grid-cols-2">
          {workspace.tenant.companies.map((company) => (
            <article key={company.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">{company.legalNameAr}</h2>
                  <p className="text-sm text-slate-400">{company.code} · {company.legalNameEn || "بدون اسم إنجليزي"}</p>
                </div>
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-xs text-emerald-300">نشطة</span>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-3 text-sm">
                <div><dt className="text-slate-500">الدولة</dt><dd>{company.country.nameAr}</dd></div>
                <div><dt className="text-slate-500">العملة</dt><dd>{company.baseCurrency.code} — {company.baseCurrency.nameAr}</dd></div>
                <div><dt className="text-slate-500">الفروع</dt><dd>{company.branches.length}</dd></div>
                <div><dt className="text-slate-500">المستودعات</dt><dd>{company.warehouses.length}</dd></div>
              </dl>
              <div className="mt-5 border-t border-slate-800 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-slate-300">الوحدات المفعلة</h3>
                <div className="flex flex-wrap gap-2">
                  {company.modules.map((row) => (
                    <button
                      key={row.moduleKey}
                      type="button"
                      onClick={() => toggleModule(company.id, row)}
                      title={row.module.isCore ? "الوحدة الأساسية لا يمكن تعطيلها" : "تفعيل أو تعطيل الوحدة"}
                      className={`rounded-full border px-3 py-1 text-xs ${row.enabled ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-200" : "border-slate-700 text-slate-500"}`}
                    >
                      {row.module.nameAr}{row.module.isCore ? " · أساسية" : ""}
                    </button>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
          <h2 className="text-xl font-semibold">إضافة شركة داخل المستأجر الحالي</h2>
          <p className="mt-1 text-sm text-slate-400">تُنشأ معها تلقائيًا شعبة ومستودع رئيسيان، دون نسخ أي بيانات تشغيلية.</p>
          <form onSubmit={create} className="mt-5 grid gap-4 md:grid-cols-3">
            <input name="code" required placeholder="رمز الشركة" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            <input name="legalNameAr" required placeholder="الاسم القانوني بالعربية" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            <input name="legalNameEn" placeholder="الاسم القانوني بالإنجليزية" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            <select name="countryCode" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">{workspace.countries.map((row) => <option key={row.code} value={row.code}>{row.nameAr}</option>)}</select>
            <select name="baseCurrencyCode" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">{workspace.currencies.map((row) => <option key={row.code} value={row.code}>{row.code} — {row.nameAr}</option>)}</select>
            <select name="defaultLanguageCode" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">{workspace.languages.map((row) => <option key={row.code} value={row.code}>{row.nativeName}</option>)}</select>
            <select name="timeZoneName" defaultValue="Asia/Riyadh" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">{workspace.timeZones.map((row) => <option key={row.name} value={row.name}>{row.label}</option>)}</select>
            <input name="vatNumber" placeholder="الرقم الضريبي (اختياري)" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
            <button disabled={busy} className="rounded-xl bg-cyan-500 px-4 py-3 font-semibold text-slate-950 disabled:opacity-50">{busy ? "جاري الحفظ…" : "إنشاء الشركة"}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
