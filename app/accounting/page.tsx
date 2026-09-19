import Link from "next/link";
import AccountingClient from "./AccountingClient";

export default function AccountingPage() {
  return <main dir="rtl" className="min-h-screen bg-slate-50 text-slate-900">
    <header className="border-b bg-slate-950 px-6 py-5 text-white"><div className="mx-auto flex max-w-7xl items-center justify-between">
      <div><h1 className="text-2xl font-bold">المحاسبة والمالية</h1><p className="mt-1 text-sm text-slate-300">التحصيل والدفع والبنوك والقيود والتقارير المالية</p></div>
      <Link href="/" className="rounded-lg border border-slate-600 px-4 py-2">لوحة الإدارة</Link>
    </div></header>
    <AccountingClient />
  </main>;
}
