"use client";

export default function MonthlyUnavailableReport({ title }: { title: string }) {
  return <section className="monthly-sales-report monthly-unavailable-report"><header><div><p className="text-xs font-black tracking-[.2em] text-amber-700">MONTHLY REPORT</p><h2>{title}</h2></div></header><div className="monthly-sales-chart"><div className="monthly-unavailable-message">لا يتوفر سجل شهري لهذا المؤشر حاليًا</div></div></section>;
}
