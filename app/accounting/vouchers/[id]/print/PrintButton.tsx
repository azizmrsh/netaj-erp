"use client";

export default function PrintButton() {
  return <button onClick={() => window.print()} className="rounded-lg bg-slate-950 px-5 py-2 font-bold text-white print:hidden">طباعة السند</button>;
}
