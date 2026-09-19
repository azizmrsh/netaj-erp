import Link from "next/link";
import SourceSystemsClient from "./SourceSystemsClient";

export const dynamic = "force-dynamic";

export default function SourceSystemsPage() {
  return <main dir="rtl" className="min-h-screen bg-slate-100 text-slate-900"><header className="border-b bg-slate-950 px-6 py-5 text-white"><div className="mx-auto flex max-w-6xl items-center justify-between"><div><h1 className="text-2xl font-bold">مركز الترحيل ← أنظمة المصدر</h1><p className="mt-1 text-sm text-slate-300">ملفات تعريف مستقلة عن Core ERP وقابلة لإعادة الاستخدام</p></div><Link href="/imports" className="rounded-lg border border-slate-600 px-4 py-2">العودة للاستيراد</Link></div></header><SourceSystemsClient/></main>;
}
