import Link from "next/link";
import ImportsClient from "./ImportsClient";

export const dynamic = "force-dynamic";

export default function ImportsPage() {
  return <main dir="rtl" className="min-h-screen bg-slate-100 text-slate-900">
    <header className="border-b bg-slate-950 px-6 py-5 text-white"><div className="mx-auto flex max-w-7xl items-center justify-between gap-4"><div><h1 className="text-2xl font-bold">مركز استيراد وترحيل البيانات</h1><p className="mt-1 text-sm text-slate-300">تحليل وربط وتحقق وتنفيذ قابل للتتبع من Excel وCSV</p></div><Link href="/" className="rounded-lg border border-slate-600 px-4 py-2">لوحة الإدارة</Link></div></header>
    <ImportsClient />
  </main>;
}

