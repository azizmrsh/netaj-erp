"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
const money = (value: unknown) => `${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
const compact = (value: number) => Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : Math.abs(value) >= 1_000 ? `${(value / 1_000).toFixed(0)}K` : String(Math.round(value));
const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (value: unknown) => { const raw = String(value ?? ""); const match = raw.match(/(?:-|\/)(0?[1-9]|1[0-2])(?:-|\/|$)/); const month = match ? Number(match[1]) : Number(raw); return month >= 1 && month <= 12 ? monthNames[month - 1] : raw; };

export default function MonthlySalesReport({ metric = "sales" }: { metric?: "sales" | "purchases" | "expenses" }) {
  const today = useMemo(() => new Date(), []), minDate = `${today.getFullYear() - 5}-01-01`;
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`), [to, setTo] = useState(today.toISOString().slice(0, 10)), [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/analytics?from=${from}&to=${to}&inactiveDays=60`, { signal: controller.signal }).then(response => response.json()).then(payload => setRows(Array.isArray(payload.monthly) ? payload.monthly : [])).catch(() => undefined); return () => controller.abort(); }, [from, to]);
  const isPurchases = metric === "purchases", isExpenses = metric === "expenses", values = rows.map(row => Number(row[metric] ?? 0)), max = Math.max(1, ...values), title = isPurchases ? "كشف المشتريات الشهرية" : isExpenses ? "كشف المصاريف الشهرية" : "كشف المبيعات الشهرية", reportLabel = isPurchases ? "MONTHLY PURCHASES REPORT" : isExpenses ? "MONTHLY EXPENSES REPORT" : "MONTHLY SALES REPORT";
  return <section className={`monthly-sales-report ${isPurchases ? "monthly-purchases-report" : isExpenses ? "monthly-expenses-report" : "monthly-sales-only"}`}><header><div><p className="text-xs font-black tracking-[.2em] text-amber-700">{reportLabel}</p><h2>{title}</h2></div><div className="flex gap-2"><label>من <input type="date" min={minDate} value={from} onChange={event => setFrom(event.target.value)} /></label><label>إلى <input type="date" min={minDate} value={to} onChange={event => setTo(event.target.value)} /></label></div></header><div className="monthly-sales-chart"><div className="monthly-sales-gridlines"><i /><i /><i /><i /></div><div className="monthly-sales-bars">{rows.map((row, index) => { const value = values[index], cumulative = values.slice(0, index + 1).reduce((sum, item) => sum + item, 0), height = Math.max(18, Math.round(value / max * 270)); return <div className="monthly-sales-bar" key={`${String(row.month)}-${index}`} title={`${monthLabel(row.month)}: ${money(value)}`}><b>{compact(value)}</b><span style={{ height }} /><small>{monthLabel(row.month)}</small><div className="monthly-sales-cumulative">{compact(cumulative)}</div></div>; })}</div></div></section>;
}
