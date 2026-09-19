"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر تسجيل الدخول");
      const next = new URLSearchParams(window.location.search).get("next");
      window.location.assign(next?.startsWith("/") && !next.startsWith("//") ? next : "/");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل الدخول");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
      <div><p className="text-sm text-cyan-300">NETAj Global ERP</p><h1 className="mt-1 text-3xl font-bold">تسجيل الدخول</h1></div>
      {error && <p role="alert" className="rounded-xl bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
      <label className="block space-y-2"><span className="text-sm text-slate-300">البريد الإلكتروني</span><input name="email" type="email" required autoComplete="username" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /></label>
      <label className="block space-y-2"><span className="text-sm text-slate-300">كلمة المرور</span><input name="password" type="password" required autoComplete="current-password" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" /></label>
      <button disabled={busy} className="w-full rounded-xl bg-cyan-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? "جاري التحقق…" : "دخول"}</button>
      <Link href="/setup" className="block text-center text-sm text-slate-400 hover:text-cyan-300">الإعداد الأولي للنظام</Link>
    </form>
  );
}
