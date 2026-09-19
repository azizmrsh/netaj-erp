"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";

export default function SetupForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const body = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/auth/setup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "تعذر إكمال الإعداد");
      setMessage("اكتمل إعداد المدير. يمكنك تسجيل الدخول الآن.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر إكمال الإعداد");
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} className="w-full max-w-lg space-y-5 rounded-3xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
      <div><p className="text-sm text-amber-300">يُستخدم مرة واحدة فقط</p><h1 className="mt-1 text-3xl font-bold">إعداد مدير النظام</h1><p className="mt-2 text-sm text-slate-400">في الإنتاج يجب أن يطابق رمز الإعداد المتغير AUTH_BOOTSTRAP_TOKEN.</p></div>
      {error && <p role="alert" className="rounded-xl bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
      {message && <p className="rounded-xl bg-emerald-950/50 p-3 text-sm text-emerald-200">{message}</p>}
      <input name="email" type="email" required placeholder="البريد الإلكتروني للمدير" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
      <input name="password" type="password" minLength={12} required placeholder="كلمة مرور قوية — 12 حرفًا على الأقل" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
      <input name="setupToken" type="password" placeholder="رمز الإعداد الأولي (إلزامي في الإنتاج)" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3" />
      <button disabled={busy || Boolean(message)} className="w-full rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 disabled:opacity-50">{busy ? "جاري الإعداد…" : "إنشاء بيانات الدخول"}</button>
      <Link href="/login" className="block text-center text-sm text-slate-400 hover:text-cyan-300">العودة لتسجيل الدخول</Link>
    </form>
  );
}
