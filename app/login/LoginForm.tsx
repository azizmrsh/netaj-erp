"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function LoginForm() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [branding, setBranding] = useState({ name: "NETAj Global ERP", logoUrl: "", primaryColor: "#b78a3d", title: "مرحبًا بعودتك", subtitle: "منصة الأعمال المتكاملة" });
  useEffect(() => { const controller = new AbortController(); fetch("/api/design/branding", { signal: controller.signal }).then((response) => response.json()).then((payload) => setBranding((current) => ({ ...current, ...payload }))).catch(() => undefined); return () => controller.abort(); }, []);

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
    <form onSubmit={submit} className="w-full max-w-md space-y-5 rounded-[28px] border border-[#e6dcc9] bg-white/95 p-8 text-[#172235] shadow-[0_30px_80px_rgba(59,45,24,.16)] backdrop-blur md:p-10">
      <div>{<Image src={branding.logoUrl || "/media/netaj-company-logo.png"} width={160} height={70} unoptimized alt={branding.name} className="mb-4 object-contain" />}<p className="text-sm font-bold" style={{ color: branding.primaryColor }}>{branding.subtitle}</p><h1 className="mt-2 text-3xl font-black">{branding.title}</h1><p className="mt-2 text-sm text-[#7c756a]">{branding.name}</p></div>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <label className="block space-y-2"><span className="text-sm text-[#625d54]">البريد الإلكتروني</span><input name="email" type="email" required autoComplete="username" className="w-full rounded-xl border border-[#ddd3c2] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#b78a3d] focus:ring-4 focus:ring-[#d6ab56]/15" /></label>
      <label className="block space-y-2"><span className="text-sm text-[#625d54]">كلمة المرور</span><input name="password" type="password" required autoComplete="current-password" className="w-full rounded-xl border border-[#ddd3c2] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#b78a3d] focus:ring-4 focus:ring-[#d6ab56]/15" /></label>
      <label className="block space-y-2"><span className="text-sm text-[#625d54]">رمز MFA أو رمز الاسترداد (إن كان مفعّلًا)</span><input name="mfaCode" inputMode="numeric" autoComplete="one-time-code" className="w-full rounded-xl border border-[#ddd3c2] bg-[#fffdf8] px-4 py-3 outline-none focus:border-[#b78a3d] focus:ring-4 focus:ring-[#d6ab56]/15" /></label>
      <button disabled={busy} style={{ background:`linear-gradient(135deg,${branding.primaryColor},#d6ab56)` }} className="w-full rounded-xl px-4 py-3 font-black text-white shadow-lg shadow-amber-900/10 disabled:opacity-50">{busy ? "جاري التحقق…" : "دخول آمن"}</button>
      <Link href="/setup" className="block text-center text-sm text-[#7c756a] hover:text-[#b78a3d]">الإعداد الأولي للنظام</Link>
    </form>
  );
}
