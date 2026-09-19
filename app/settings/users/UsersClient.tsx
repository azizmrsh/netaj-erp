"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Company = { id: number; code: string; legalNameAr: string };
type Permission = { key: string; moduleKey: string; action: string };
type UserRow = {
  id: number;
  user: { id: number; email: string; name: string; status: string };
  companies: Array<{ company: Company }>;
  roles: Array<{ role: { name: string; permissions: Array<{ permissionKey: string }> } }>;
};

export default function UsersClient({ initialUsers, companies, permissions }: { initialUsers: UserRow[]; companies: Company[]; permissions: Permission[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function reload() {
    const response = await fetch("/api/platform/users", { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "تعذر تحميل المستخدمين");
    setUsers(payload);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      name: form.get("name"), email: form.get("email"), password: form.get("password"),
      companyId: Number(form.get("companyId")), permissionKeys: form.getAll("permissionKeys"),
    };
    try {
      const response = await fetch("/api/platform/users", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر إنشاء المستخدم");
      event.currentTarget.reset(); await reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "تعذر إنشاء المستخدم"); }
    finally { setBusy(false); }
  }

  const modules = [...new Set(permissions.map((permission) => permission.moduleKey))];
  return <main dir="rtl" className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10"><div className="mx-auto max-w-7xl space-y-8">
    <header className="flex items-center justify-between"><div><p className="text-sm text-cyan-300">RBAC</p><h1 className="text-3xl font-bold">المستخدمون والصلاحيات</h1></div><Link href="/" className="rounded-xl border border-slate-700 px-4 py-2">الرئيسية</Link></header>
    {error && <p role="alert" className="rounded-xl bg-red-950/50 p-4 text-red-200">{error}</p>}
    <section className="grid gap-4 md:grid-cols-2">{users.map((row) => <article key={row.id} className="rounded-2xl border border-slate-800 bg-slate-900 p-5"><h2 className="font-semibold">{row.user.name}</h2><p className="text-sm text-slate-400">{row.user.email}</p><p className="mt-3 text-sm">{row.companies.map((access) => access.company.legalNameAr).join("، ")}</p><p className="mt-2 text-xs text-cyan-300">{row.roles.flatMap((role) => role.role.permissions).length} صلاحية</p></article>)}</section>
    <form onSubmit={submit} className="space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">مستخدم جديد</h2>
      <div className="grid gap-4 md:grid-cols-4"><input name="name" required placeholder="الاسم" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"/><input name="email" type="email" required placeholder="البريد" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"/><input name="password" type="password" minLength={12} required placeholder="كلمة مرور قوية" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3"/><select name="companyId" className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3">{companies.map((company) => <option key={company.id} value={company.id}>{company.legalNameAr}</option>)}</select></div>
      <div className="grid gap-4 md:grid-cols-3">{modules.map((moduleKey) => <fieldset key={moduleKey} className="rounded-xl border border-slate-800 p-4"><legend className="px-2 font-semibold text-cyan-300">{moduleKey}</legend><div className="grid grid-cols-2 gap-2">{permissions.filter((permission) => permission.moduleKey === moduleKey).map((permission) => <label key={permission.key} className="flex items-center gap-2 text-sm"><input type="checkbox" name="permissionKeys" value={permission.key}/>{permission.action}</label>)}</div></fieldset>)}</div>
      <button disabled={busy} className="rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? "جاري الحفظ…" : "إنشاء المستخدم"}</button>
    </form>
  </div></main>;
}
