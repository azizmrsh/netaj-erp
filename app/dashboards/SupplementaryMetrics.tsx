"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CircleDollarSign, Clock3, Gauge, WalletCards } from "lucide-react";

type Row = Record<string, unknown>;
const money = (value: unknown) => `${Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 })} ر.س`;

export default function SupplementaryMetrics() {
  const today = useMemo(() => new Date(), []), from = `${today.getFullYear()}-01-01`, to = today.toISOString().slice(0, 10);
  const [data, setData] = useState<Row | null>(null);
  useEffect(() => { const controller = new AbortController(); fetch(`/api/analytics?from=${from}&to=${to}&inactiveDays=60`, { signal: controller.signal }).then(response => response.json()).then(setData).catch(() => undefined); return () => controller.abort(); }, [from, to]);
  const kpis = (data?.kpis ?? {}) as Row, sales = Number(kpis.sales ?? 0), netProfit = Number(kpis.netProfit ?? 0), liquidity = Number(kpis.liquidity ?? 0), ar = Number(kpis.ar ?? 0), ap = Number(kpis.ap ?? 0), inventory = Number(kpis.inventory ?? 0), cashFlow = Number(kpis.cashFlow ?? 0), margin = sales ? netProfit / sales * 100 : 0, workingCapital = liquidity + ar - ap, turnover = inventory ? sales / inventory : 0;
  const cards = [{ label: "هامش الربح", value: `${margin.toFixed(1)}%`, icon: <CircleDollarSign />, tone: "gold" }, { label: "صافي التدفق النقدي", value: money(cashFlow), icon: <WalletCards />, tone: "blue" }, { label: "المتأخرات", value: `${Number((data?.alerts as Row | null)?.overdueReceivables ?? 0)} فاتورة`, icon: <Clock3 />, tone: "rose" }, { label: "رأس المال العامل", value: money(workingCapital), icon: <Gauge />, tone: "green" }, { label: "دوران المخزون", value: `${turnover.toFixed(2)} مرة`, icon: <BarChart3 />, tone: "purple" }];
  return <section className="reference-kpi-grid supplementary-kpi-grid">{cards.map(card => <article key={card.label} className="reference-kpi"><span className={`metric-icon ${card.tone}`}>{card.icon}</span><div><p>{card.label}</p><strong>{card.value}</strong><small>{card.value.includes("%") || card.value.includes("فاتورة") || card.value.includes("مرة") ? "" : "SAR"}</small></div></article>)}</section>;
}
