"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, unknown>;
const money = (value: unknown) => `${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;
const compact = (value: number) => Math.abs(value) >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : Math.abs(value) >= 1_000 ? `${(value / 1_000).toFixed(0)}K` : String(Math.round(value));

export default function MonthlySalesReport() {
  const today = useMemo(() => new Date(), []), minDate = `${today.getFullYear() - 5}-01-01`;
  const [from, setFrom] = useState(`${today.getFullYear()}-01-01`), [to, setTo] = useState(today.toISOString().slice(0, 10)), [rows, setRows] = useState<Row[]>([]);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/analytics?from=${from}&to=${to}&inactiveDays=60`, { signal: controller.signal }).then(response => response.json()).then(payload => setRows(Array.isArray(payload.monthly) ? payload.monthly : [])).catch(() => undefined); return () => controller.abort(); }, [from, to]);
  const values = rows.map(row => Number(row.sales ?? 0)), max = Math.max(1, ...values);
  return <section className="monthly-sales-report"><header><div><p className="text-xs font-black tracking-[.2em] text-amber-700">MONTHLY SALES REPORT</p><h2>كشف المبيعات الشهرية</h2></div><div className="flex gap-2"><label>من <input type="date" min={minDate} value={from} onChange={event => setFrom(event.target.value)} /></label><label>إلى <input type="date" min={minDate} value={to} onChange={event => setTo(event.target.value)} /></label></div></header><div className="monthly-sales-chart"><div className="monthly-sales-gridlines"><i /><i /><i /><i /></div><div className="monthly-sales-bars">{rows.map((row, index) => { const value = values[index], height = Math.max(18, Math.round(value / max * 250)); return <div className="monthly-sales-bar" key={`${String(row.month)}-${index}`} title={`${String(row.month)}: ${money(value)}`}><b>{compact(value)}</b><span style={{ height }} /><small>{String(row.month ?? "").slice(-2)}</small></div>; })}</div><div className="monthly-sales-axis"><span>0</span><span>{compact(max / 2)}</span><span>{compact(max)}</span><strong>المحور Y — قيمة المبيعات</strong><strong>المحور X — الأشهر</strong></div></div></section>;
}
