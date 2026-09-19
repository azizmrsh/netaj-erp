"use client";

import { useState } from "react";
import Link from "next/link";

const menu = [
  { label: "لوحة الإدارة", moduleKey: "CORE" },
  { label: "العملاء", href: "/parties", moduleKey: "CORE" },
  { label: "الموردون", href: "/parties", moduleKey: "CORE" },
  { label: "المواد والأصناف", href: "/items", moduleKey: "CORE" },
  { label: "المبيعات", href: "/sales", moduleKey: "SALES" },
  { label: "المشتريات", href: "/purchases", moduleKey: "PURCHASES" },
  { label: "المخزون", href: "/inventory", moduleKey: "INVENTORY" },
  { label: "المصنع", href: "/factory", moduleKey: "FACTORY" },
  { label: "السندات", href: "/notes", moduleKey: "NOTES" },
  { label: "النقليات", href: "/transport", moduleKey: "TRANSPORT" },
  { label: "المحاسبة والمالية", href: "/accounting", moduleKey: "ACCOUNTING" },
  { label: "الموارد البشرية", href: "/hr", moduleKey: "HR" },
  { label: "المبيعات الخارجية", href: "/external", moduleKey: "EXTERNAL" },
  { label: "المصاريف الخارجية", href: "/external", moduleKey: "EXTERNAL" },
  { label: "التقارير والمقارنات", moduleKey: "ACCOUNTING" },
  { label: "المساعد الذكي", moduleKey: "CORE" },
  { label: "المستخدمون والصلاحيات", href: "/settings/users", moduleKey: "CORE" },
  { label: "إعدادات المؤسسة", href: "/settings/organization", moduleKey: "CORE" },
];

export default function DashboardClient({ enabledModules, companyName, userName }: { enabledModules: string[]; companyName: string; userName: string }) {
  const [active, setActive] = useState("لوحة الإدارة");
  const visibleMenu = menu.filter((item) => enabledModules.includes(item.moduleKey));

  return (
    <main
      dir="rtl"
      className="min-h-screen bg-slate-50 text-slate-900"
    >
      <div className="flex min-h-screen">

        {/* القائمة الجانبية */}
        <aside className="w-72 bg-slate-950 text-white p-5">
          <div className="mb-8">
            <div className="text-3xl font-bold tracking-wide">
              NETAJ
            </div>

            <div className="mt-1 text-sm text-slate-400">
              نظام إدارة الأعمال
            </div>
          </div>

          <nav className="space-y-1">
            {visibleMenu.map((item) =>
              item.href ? (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block w-full rounded-xl px-4 py-3 text-right text-slate-300 transition hover:bg-slate-800"
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.label}
                  onClick={() => setActive(item.label)}
                  className={`w-full rounded-xl px-4 py-3 text-right transition ${
                  active === item.label
                    ? "bg-blue-600 text-white"
                    : "text-slate-300 hover:bg-slate-800"
                }`}
                >
                  {item.label}
                </button>
              )
            )}
          </nav>
        </aside>

        {/* محتوى البرنامج */}
        <section className="flex-1">

          {/* الشريط العلوي */}
          <header className="flex items-center justify-between border-b bg-white px-8 py-5">
            <div>
              <h1 className="text-2xl font-bold">{active}</h1>

              <p className="mt-1 text-sm text-slate-500">
                {companyName}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button className="rounded-xl border px-4 py-2">
                العربية
              </button>

              <button className="rounded-xl bg-slate-900 px-4 py-2 text-white">
                {userName}
              </button>
            </div>
          </header>

          <div className="p-8">

            {active === "لوحة الإدارة" ? (
              <>
                {/* بطاقات الربحية الرئيسية */}
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">

                  <DashboardCard
                    title="ربحية المادة 1"
                    value="NETAPAVE MB-001"
                    subtitle="اختر الفترة لعرض الربحية"
                  />

                  <DashboardCard
                    title="ربحية المادة 2"
                    value="LCO-001"
                    subtitle="اختر الفترة لعرض الربحية"
                  />

                  <DashboardCard
                    title="ربحية المصنع"
                    value="0.00 ر.س"
                    subtitle="إيرادات المصنع - تكاليف المصنع"
                  />

                  <DashboardCard
                    title="ربحية النقليات"
                    value="0.00 ر.س"
                    subtitle="إيرادات النقل - تكاليف النقل"
                  />
                </div>

                {/* مؤشرات الشركة */}
                <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">

                  <SmallCard
                    title="إجمالي المبيعات"
                    value="0.00 ر.س"
                  />

                  <SmallCard
                    title="إجمالي المشتريات"
                    value="0.00 ر.س"
                  />

                  <SmallCard
                    title="السيولة"
                    value="0.00 ر.س"
                  />

                  <SmallCard
                    title="ذمم العملاء"
                    value="0.00 ر.س"
                  />

                  <SmallCard
                    title="ذمم الموردين"
                    value="0.00 ر.س"
                  />

                  <SmallCard
                    title="قيمة المخزون"
                    value="0.00 ر.س"
                  />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-2">

                  {/* أداء الشركة */}
                  <div className="rounded-2xl border bg-white p-6 shadow-sm">
                    <div className="mb-5 flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-bold">
                          أداء الشركة الشهري
                        </h2>

                        <p className="text-sm text-slate-500">
                          مقارنة المبيعات والمصاريف والأرباح
                        </p>
                      </div>

                      <select className="rounded-lg border px-3 py-2">
                        <option>2026</option>
                        <option>2025</option>
                      </select>
                    </div>

                    <div className="flex h-64 items-end gap-3">
                      {[35, 52, 44, 67, 58, 76, 65, 82, 72, 88, 78, 94].map(
                        (height, index) => (
                          <div
                            key={index}
                            className="flex flex-1 flex-col items-center justify-end"
                          >
                            <div
                              className="w-full rounded-t-lg bg-blue-600"
                              style={{ height: `${height}%` }}
                            />

                            <span className="mt-2 text-xs text-slate-400">
                              {index + 1}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </div>

                  {/* تنبيهات الإدارة */}
                  <div className="rounded-2xl border bg-white p-6 shadow-sm">
                    <h2 className="mb-5 text-lg font-bold">
                      يحتاج انتباهك
                    </h2>

                    <Alert
                      title="أرصدة مخزون عملاء سالبة"
                      text="ستظهر هنا الحسابات التي تجاوزت رصيدها."
                    />

                    <Alert
                      title="عملاء غير نشطين"
                      text="تنبيه للعملاء الذين لم توجد لهم حركة منذ 60 يومًا."
                    />

                    <Alert
                      title="فواتير متأخرة"
                      text="متابعة الذمم والفواتير التي تجاوزت تاريخ الاستحقاق."
                    />

                    <Alert
                      title="وثائق شاحنات وسائقين"
                      text="تنبيهات الوثائق القريبة من الانتهاء."
                    />

                    <Alert
                      title="رحلات نقل مفتوحة"
                      text="الرحلات التي لم يتم إغلاقها بعد."
                    />
                  </div>
                </div>

                {/* الجداول الأربعة */}
                <div className="mt-6">
                  <h2 className="mb-4 text-xl font-bold">
                    تقارير المالك
                  </h2>

                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">

                    <ProfitTable
                      title="ربحية NETAPAVE MB-001"
                    />

                    <ProfitTable
                      title="ربحية LCO-001"
                    />

                    <ProfitTable
                      title="ربحية المصنع"
                    />

                    <ProfitTable
                      title="ربحية النقليات"
                    />

                  </div>
                </div>
              </>
            ) : (
              <ModulePlaceholder title={active} />
            )}

          </div>
        </section>
      </div>
    </main>
  );
}

function DashboardCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: string;
  subtitle: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-6 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>

      <div className="mt-3 text-2xl font-bold">
        {value}
      </div>

      <div className="mt-3 text-xs text-slate-400">
        {subtitle}
      </div>

      <button className="mt-5 text-sm font-medium text-blue-600">
        عرض التفاصيل ←
      </button>
    </div>
  );
}

function SmallCard({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-5 shadow-sm">
      <div className="text-sm text-slate-500">
        {title}
      </div>

      <div className="mt-2 text-xl font-bold">
        {value}
      </div>
    </div>
  );
}

function Alert({
  title,
  text,
}: {
  title: string;
  text: string;
}) {
  return (
    <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="font-semibold text-amber-900">
        {title}
      </div>

      <div className="mt-1 text-sm text-amber-700">
        {text}
      </div>
    </div>
  );
}

function ProfitTable({
  title,
}: {
  title: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border bg-white shadow-sm">

      <div className="flex items-center justify-between border-b p-5">
        <h3 className="font-bold">{title}</h3>

        <button className="text-sm text-blue-600">
          التفاصيل
        </button>
      </div>

      <table className="w-full text-sm">
        <tbody>

          <TableRow
            label="الكمية"
            value="0.000 طن"
          />

          <TableRow
            label="الإيرادات"
            value="0.00 ر.س"
          />

          <TableRow
            label="التكلفة"
            value="0.00 ر.س"
          />

          <TableRow
            label="صافي الربح"
            value="0.00 ر.س"
            strong
          />

          <TableRow
            label="هامش الربح"
            value="0.00%"
          />

        </tbody>
      </table>
    </div>
  );
}

function TableRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <tr className="border-b last:border-0">

      <td className="px-5 py-3 text-slate-500">
        {label}
      </td>

      <td
        className={`px-5 py-3 text-left ${
          strong ? "font-bold text-emerald-600" : "font-medium"
        }`}
      >
        {value}
      </td>

    </tr>
  );
}

function ModulePlaceholder({
  title,
}: {
  title: string;
}) {
  return (
    <div className="rounded-2xl border bg-white p-10 shadow-sm">

      <h2 className="text-2xl font-bold">
        {title}
      </h2>

      <p className="mt-3 text-slate-500">
        سيتم ربط هذا القسم بقاعدة بيانات NETAJ ERP.
      </p>

      <button className="mt-6 rounded-xl bg-blue-600 px-5 py-3 text-white">
        إضافة جديد
      </button>

    </div>
  );
}
