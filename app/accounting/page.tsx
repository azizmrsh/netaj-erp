import Link from "next/link";
import AccountingClient from "./AccountingClient";

export default async function AccountingPage({ searchParams }: { searchParams: Promise<{ tab?: string; voucherType?: string; report?: string; accountId?: string }> }) {
  const query = await searchParams;
  return <main className="finance-shell min-h-screen text-slate-900">
    <header className="finance-hero px-6 py-6 text-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4">
      <div><span className="finance-eyebrow">NETAJ FINANCE</span><h1 className="mt-2 text-3xl font-black">المحاسبة والمالية</h1><p className="mt-1 text-sm text-amber-100/80">الذمم والتحصيل والبنوك والضريبة والتقارير من دفتر واحد موحّد</p></div>
      <Link href="/" className="finance-home-link">لوحة الإدارة</Link>
    </div></header>
    <AccountingClient key={JSON.stringify(query)} initialTab={query.tab} initialReport={query.report} initialVoucherType={query.tab === "payment" || query.voucherType === "SUPPLIER_PAYMENT" ? "SUPPLIER_PAYMENT" : "CUSTOMER_RECEIPT"} />
  </main>;
}
