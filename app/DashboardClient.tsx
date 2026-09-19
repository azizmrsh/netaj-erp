"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpLeft, BadgeDollarSign, Boxes, Building2, CalendarDays,
  ChartNoAxesCombined, ChevronLeft, CircleDollarSign, ClipboardPlus, Factory,
  FileChartColumn, Landmark, ReceiptText, ShoppingBag, ShoppingCart, Sparkles,
  RotateCw, TrendingDown, TrendingUp, TriangleAlert, Truck, Users, WalletCards,
} from "lucide-react";
import { PremiumEmptyState as EmptyState, PremiumSectionTitle as SectionTitle, PremiumWidgetBoundary as WidgetBoundary } from "./components/PremiumUI";

type Row = Record<string, unknown>;
type DashboardData = { range:{from:string;to:string}; kpis:Row; executiveFinancial:Row|null; factory:Row|null; transport:Row|null; monthly:Row[]; materials:Row[]; customerActivity:Row[]; latestTransactions:Row[]; alerts:Row };
const money = (value:unknown) => `${Number(value ?? 0).toLocaleString("ar-SA", { minimumFractionDigits:2, maximumFractionDigits:2 })} ر.س`;
const compactMoney = (value:unknown) => new Intl.NumberFormat("ar-SA", { notation:"compact", maximumFractionDigits:1 }).format(Number(value ?? 0));
const number = (value:unknown) => Number(value ?? 0).toLocaleString("ar-SA", { maximumFractionDigits:2 });
const monthEnd = (month:unknown) => { const value=String(month),[year,index]=value.split("-").map(Number); return `${value}-${String(new Date(Date.UTC(year,index,0)).getUTCDate()).padStart(2,"0")}`; };
const today = new Date(), initialFrom = `${today.getFullYear()}-01-01`, initialTo = today.toISOString().slice(0,10);

export default function DashboardClient({ enabledModules, companyName }:{enabledModules:string[];companyName:string}) {
  const [filters,setFilters] = useState({from:initialFrom,to:initialTo,inactiveDays:"60"});
  const [data,setData] = useState<DashboardData|null>(null), [message,setMessage] = useState(""), [loading,setLoading] = useState(true), [reload,setReload] = useState(0);
  const [selectedMaterials,setSelectedMaterials] = useState<[string,string]>(["",""]);
  useEffect(() => { let disposed=false;const controller=new AbortController(),params=new URLSearchParams(filters),timer=window.setTimeout(()=>controller.abort(),15000);fetch(`/api/analytics?${params}`,{cache:"no-store",signal:controller.signal}).then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.error||"تعذر تحميل التحليلات");if(!disposed)setData(body)}).catch(error=>{if(!disposed)setMessage(error.name==="AbortError"?"انتهت مهلة تحميل التحليلات. تحقق من الاتصال ثم أعد المحاولة.":error.message)}).finally(()=>{window.clearTimeout(timer);if(!disposed)setLoading(false)});return()=>{disposed=true;window.clearTimeout(timer);controller.abort()}; },[filters,reload]);
  const updateFilter=(key:keyof typeof filters,value:string)=>{setLoading(true);setMessage("");setFilters(current=>({...current,[key]:value}))};
  const retry=()=>{setLoading(true);setMessage("");setReload(value=>value+1)};
  const enabled=new Set(enabledModules), effectiveMaterials:[string,string]=selectedMaterials[0]?selectedMaterials:[String(data?.materials[0]?.itemId??""),String(data?.materials[1]?.itemId??data?.materials[0]?.itemId??"")];
  const materialCards=effectiveMaterials.map(id=>data?.materials.find(row=>String(row.itemId)===id)).filter(Boolean) as Row[];
  const maxMonthly=useMemo(()=>Math.max(1,...(data?.monthly??[]).flatMap(row=>[Math.abs(Number(row.sales??0)),Math.abs(Number(row.purchases??0)),Math.abs(Number(row.netProfit??0))])),[data]);
  const hasMonthlyData=(data?.monthly??[]).some(row=>[row.sales,row.purchases,row.netProfit].some(value=>Number(value)!==0));
  const currentMonth=data?.monthly.at(-1), previousMonth=data?.monthly.at(-2);
  const trend=(key:string)=>{const current=Number(currentMonth?.[key]??0),previous=Number(previousMonth?.[key]??0);return previous?((current-previous)/Math.abs(previous))*100:null};
  const quickActions=[
    ["إضافة عميل","/parties?new=1","CORE",Users],["عرض سعر","/sales?type=QUOTATION&new=1","SALES",ClipboardPlus],["فاتورة مبيعات","/sales?type=SALES_INVOICE&new=1","SALES",BadgeDollarSign],["طلب شراء","/purchases?type=PURCHASE_REQUISITION&new=1","PURCHASES",ShoppingBag],["سند قبض","/accounting?tab=vouchers&type=RECEIPT","ACCOUNTING",WalletCards],["سند صرف","/accounting?tab=vouchers&type=PAYMENT","ACCOUNTING",CircleDollarSign],["رحلة نقل","/transport?new=1","TRANSPORT",Truck],["تقرير مالي","/accounting?tab=reports","ACCOUNTING",FileChartColumn],
  ] as const;

  return <main className="premium-dashboard mx-auto max-w-[1680px] space-y-4 p-3 md:p-5 lg:p-6">
    <section className="premium-hero premium-executive-hero relative isolate overflow-hidden rounded-[22px] border">
      <Image src="/media/netaj-industrial-hero.png" alt="منشأة نتاج الصناعية واللوجستية" fill priority sizes="(max-width: 1024px) 100vw, 80vw" className="object-cover"/>
      <div className="absolute inset-0 bg-gradient-to-l from-[#111c2e]/95 via-[#172235]/80 to-[#172235]/35"/>
      <div className="relative z-10 grid h-full gap-4 p-5 text-white lg:grid-cols-[1fr_auto] lg:items-center lg:p-6">
        <div className="min-w-0"><div className="flex items-center gap-2 text-[10px] font-black tracking-[.16em] text-amber-200"><Sparkles size={14}/> EXECUTIVE COMMAND CENTER</div><h1 className="mt-2 text-2xl font-black leading-tight md:text-[2rem]">صورة أعمال واحدة. قرار أوضح.</h1><p className="mt-1.5 max-w-2xl truncate text-xs text-slate-200 md:text-sm">{companyName} — المالية والتشغيل والمصنع والنقل والمشاريع من مصدر موحّد.</p></div>
        <div className="flex flex-wrap items-end gap-2 lg:justify-end"><CompactField label="من" type="date" value={filters.from} onChange={from=>updateFilter("from",from)}/><CompactField label="إلى" type="date" value={filters.to} onChange={to=>updateFilter("to",to)}/><Link href={`/reports?from=${filters.from}&to=${filters.to}`} className="premium-hero-button"><ChartNoAxesCombined size={16}/> مركز التقارير</Link></div>
      </div>
    </section>

    {message&&data&&<div role="alert" className="premium-inline-error"><span><TriangleAlert size={17}/>{message}</span><button onClick={retry}><RotateCw size={15}/>إعادة المحاولة</button></div>}
    {!data?(loading?<DashboardSkeleton/>:<DashboardLoadError message={message} retry={retry}/>):<>
      <section aria-label="المؤشرات التنفيذية" className="premium-kpi-grid grid grid-cols-2 gap-2.5 md:grid-cols-4 2xl:grid-cols-8">
        <Kpi label="صافي الربح" value={data.kpis.netProfit} href="/accounting?tab=reports" icon={CircleDollarSign} trend={Number(currentMonth?.momPercent??0)}/>
        <Kpi label="المبيعات" value={data.kpis.sales} href="/sales" icon={ShoppingCart} trend={trend("sales")}/>
        <Kpi label="المشتريات" value={data.kpis.purchases} href="/purchases" icon={ShoppingBag} trend={trend("purchases")} inverse/>
        <Kpi label="قيمة المخزون" value={data.kpis.inventory} href="/inventory" icon={Boxes}/>
        <Kpi label="السيولة" value={data.kpis.liquidity} href="/accounting?tab=banks" icon={Landmark}/>
        <Kpi label="ذمم العملاء" value={data.kpis.ar} href="/accounting?tab=reports&report=ar-aging" icon={WalletCards}/>
        <Kpi label="ذمم الموردين" value={data.kpis.ap} href="/accounting?tab=reports&report=ap-aging" icon={ReceiptText}/>
        <Kpi label="موقف الضريبة" value={data.kpis.vat} href="/accounting?tab=vat" icon={BadgeDollarSign}/>
      </section>

      <section className="premium-command-grid grid gap-4 xl:grid-cols-[1.55fr_.72fr]">
        <WidgetBoundary label="الأداء المالي الشهري">
        <article className="premium-panel rounded-2xl border p-4"><SectionTitle eyebrow="PERFORMANCE" title="الأداء المالي الشهري" description="المبيعات والمشتريات وصافي الربح مع انتقال إلى المصدر." action="/reports?report=monthly-comparison"/>{hasMonthlyData?<div className="premium-dual-chart" aria-label="رسم الأداء المالي الشهري"><div className="premium-chart-legend"><span className="is-sales">المبيعات</span><span className="is-purchases">المشتريات</span><span className="is-profit">صافي الربح</span></div><div className="premium-dual-bars">{data.monthly.map(row=><Link href={`/reports?report=monthly-comparison&from=${row.month}-01&to=${monthEnd(row.month)}`} key={String(row.month)} className="premium-dual-column" title={`${row.month} — مبيعات ${money(row.sales)}، مشتريات ${money(row.purchases)}، ربح ${money(row.netProfit)}`}><div><i className="is-sales" style={{height:`${Math.max(4,Math.abs(Number(row.sales))/maxMonthly*100)}%`}}/><i className="is-purchases" style={{height:`${Math.max(4,Math.abs(Number(row.purchases))/maxMonthly*100)}%`}}/><i className={Number(row.netProfit)<0?"is-profit is-negative":"is-profit"} style={{height:`${Math.max(4,Math.abs(Number(row.netProfit))/maxMonthly*100)}%`}}/></div><b>{String(row.month).slice(5)}</b></Link>)}</div></div>:<EmptyState text="لا توجد حركات مالية خلال الفترة المحددة."/>}
        </article>
        </WidgetBoundary>
        <WidgetBoundary label="التنبيهات التنفيذية">
        <article className="premium-panel rounded-2xl border p-4"><SectionTitle eyebrow="ATTENTION" title="ما الذي يحتاج انتباهي اليوم؟" description="استثناءات فعلية تستحق قرارًا."/><div className="premium-attention-list">{[["فواتير متأخرة",data.alerts.overdueReceivables,"/accounting?tab=reports&report=ar-aging"],["أرصدة عملاء سالبة",data.alerts.negativeCustomerStocks,"/inventory"],["موافقات معلقة",data.alerts.pendingApprovals,"/approvals"],["تنبيهات رقابية",data.alerts.openControlAlerts,"/controls"],["مهام خلفية فاشلة",data.alerts.failedJobs,"/settings/jobs"],["تحذيرات ترحيل",data.alerts.migrationWarnings,"/imports"]].map(([label,value,href],index)=><Link key={String(label)} href={String(href)} className={`premium-alert-row ${Number(value)>0&&index<3?"is-urgent":""}`}><span>{String(label)}</span><b>{number(value)}</b><ChevronLeft size={15}/></Link>)}</div></article>
        </WidgetBoundary>
      </section>

      {data.executiveFinancial&&<section className="premium-panel rounded-2xl border p-4"><SectionTitle eyebrow="ONE COMPANY · FOUR CENTERS" title="الربح الرسمي والإداري" description="الربح الرسمي من الأستاذ، والتوزيع الإداري يعيد تصنيف النقل المضمن دون مضاعفة ربح الشركة."/><div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6"><Metric label="الربح الرسمي" value={money(data.executiveFinancial.officialNetProfit)}/><Metric label="الربح الإداري" value={money(data.executiveFinancial.managerialNetProfit)}/>{(data.executiveFinancial.divisions as Row[]).map(row=><Metric key={String(row.code)} label={row.code==="TRADE"?"التجارة":row.code==="FACTORY"?"المصنع":row.code==="TRANSPORT"?"النقليات":"الإدارة العامة"} value={money(row.netProfit)}/>)}</div><div className="mt-4 grid gap-3 sm:grid-cols-3"><Metric label="الضريبة المستحقة حتى اليوم" value={money((data.executiveFinancial.tax as Row).dueToDate)}/><Metric label="تقدير نهاية الشهر" value={money((data.executiveFinancial.tax as Row).estimatedMonthEnd)}/><Metric label="ضريبة المخرجات / المدخلات" value={`${money((data.executiveFinancial.tax as Row).outputVat)} / ${money((data.executiveFinancial.tax as Row).inputVat)}`}/></div></section>}

      <section aria-label="الإجراءات السريعة" className="premium-panel rounded-2xl border p-3"><div className="premium-quick-strip"><div className="premium-quick-heading"><span className="premium-eyebrow">ENTER ONCE</span><b>إجراءات سريعة</b></div>{quickActions.filter(([, ,module])=>enabled.has(module)).map(([label,href,,Icon])=><Link key={label} href={href} className="premium-quick-action"><span><Icon size={17}/></span><b>{label}</b></Link>)}</div></section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
        <article className="premium-panel rounded-2xl border p-4"><SectionTitle eyebrow="LIVE ACTIVITY" title="آخر العمليات" description="المستند، الطرف، القيمة والحالة من المصدر." action="/search"/>{data.latestTransactions.length?<div className="premium-activity-list">{data.latestTransactions.slice(0,6).map(row=><Link href={String(row.href)} key={String(row.key)} className="premium-activity-row"><span className="premium-activity-icon"><ReceiptText size={17}/></span><div><b>{String(row.type)} · {String(row.document)}</b><small>{String(row.party)} · {new Date(String(row.date)).toLocaleDateString("ar-SA")} · {String(row.status)}</small></div><strong>{row.unit?`${number(row.amount)} ${String(row.unit)}`:money(row.amount)}</strong><ArrowUpLeft size={14}/></Link>)}</div>:<EmptyState text="لا توجد عمليات خلال الفترة المحددة."/>}</article>
        <article className="premium-panel rounded-2xl border p-4"><SectionTitle eyebrow="OPERATIONS" title="نبض التشغيل" description="النتيجة المتصلة بدفاتر النظام."/><div className="grid grid-cols-2 gap-3"><OperationalCard label="ربحية المصنع" value={data.factory?.netProfit} href="/reports?report=daily-production" icon={Factory}/><OperationalCard label="ربحية النقل" value={data.transport?.netProfit} href="/reports?report=customer-vehicle" icon={Truck}/><OperationalCard label="ربحية المشاريع" value={data.kpis.projectProfit} href="/projects" icon={Building2}/><OperationalCard label="التدفق النقدي" value={data.kpis.cashFlow} href="/accounting?tab=reports&report=cash-flow" icon={ChartNoAxesCombined}/><OperationalCard label="العملاء النشطون" value={data.kpis.activeCustomers} href="/reports?report=customer-activity" icon={Users} numeric/></div></article>
      </section>

      <section className="premium-panel rounded-2xl border p-4"><div className="mb-4 flex flex-wrap items-end justify-between gap-3"><SectionTitle eyebrow="MATERIAL INTELLIGENCE" title="ربحية المواد" description="الإيراد والتكلفة وصافي الربح من المستندات والحركات."/><div className="flex flex-wrap gap-2">{[0,1].map(index=><select aria-label={`المادة ${index+1}`} key={index} value={effectiveMaterials[index]} onChange={event=>setSelectedMaterials(index===0?[event.target.value,effectiveMaterials[1]]:[effectiveMaterials[0],event.target.value])} className="rounded-xl border px-3 py-2 text-sm"><option value="">اختر مادة</option>{data.materials.map(row=><option key={String(row.itemId)} value={String(row.itemId)}>{String(row.itemName)}</option>)}</select>)}</div></div>{materialCards.length?<div className="grid gap-3 lg:grid-cols-2">{materialCards.map(row=><Link key={String(row.itemId)} href={`/reports?report=material-profitability&itemIds=${row.itemId}&from=${filters.from}&to=${filters.to}`} className="premium-material-card"><div className="flex justify-between gap-3"><b>{String(row.itemName)}</b><strong className={Number(row.netProfit)<0?"text-red-700":"text-emerald-700"}>{money(row.netProfit)}</strong></div><div className="mt-4 grid grid-cols-3 gap-2"><Metric label="الإيراد" value={money(row.revenueExVat)}/><Metric label="التكلفة" value={money(row.cogs)}/><Metric label="ربح/طن" value={money(row.profitPerTon)}/></div></Link>)}</div>:<EmptyState text="لا توجد بيانات ربحية مواد للفترة المختارة."/>}</section>

      <section className="premium-panel rounded-2xl border p-4"><div className="flex flex-wrap items-end justify-between gap-3"><SectionTitle eyebrow="CUSTOMER PULSE" title="نشاط العملاء" description="السحب والقيمة وآخر حركة والتغير عن الفترة السابقة."/><label className="text-xs text-slate-500">اعتبار الخمول بعد <input aria-label="أيام خمول العميل" type="number" min="1" value={filters.inactiveDays} onChange={event=>updateFilter("inactiveDays",event.target.value)} className="mx-1 w-20 rounded-lg border px-2 py-1.5"/> يومًا</label></div><div className="mt-4 overflow-x-auto"><table className="premium-data-table w-full min-w-[760px] text-sm"><thead><tr>{["العميل","السحب","القيمة","آخر نشاط","التغير","التصنيف"].map(head=><th key={head}>{head}</th>)}</tr></thead><tbody>{data.customerActivity.slice(0,12).map(row=><tr key={String(row.partyId)}><td><Link className="font-bold text-[var(--brand-primary)]" href={String(row.href)}>{String(row.partyName)}</Link></td><td>{number(row.withdrawals)}</td><td>{money(row.value)}</td><td>{row.lastActivity?new Date(String(row.lastActivity)).toLocaleDateString("ar-SA"):"لا توجد حركة"}</td><td className={Number(row.changePercent)<0?"text-red-700":"text-emerald-700"}>{Number(row.changePercent).toFixed(1)}%</td><td><Status row={row}/></td></tr>)}</tbody></table></div></section>
    </>}
  </main>;
}

function CompactField({label,type,value,onChange}:{label:string;type:string;value:string;onChange:(value:string)=>void}) { return <label className="premium-compact-field"><span>{label}</span><CalendarDays size={13}/><input type={type} value={value} onChange={event=>onChange(event.target.value)}/></label>; }
function DashboardSkeleton(){return <div className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="جارٍ تحميل المؤشرات">{Array.from({length:8},(_,index)=><div key={index} className="premium-kpi h-24 animate-pulse"/>)}</div>}
function DashboardLoadError({message,retry}:{message:string;retry:()=>void}){return <section className="premium-load-error" role="alert"><span><TriangleAlert size={24}/></span><div><h2>تعذر إكمال لوحة التحليلات</h2><p>{message||"حدث خطأ غير متوقع أثناء تحميل البيانات."}</p></div><button onClick={retry}><RotateCw size={16}/>إعادة المحاولة</button></section>}
function Kpi({label,value,href,icon:Icon,trend,inverse=false}:{label:string;value:unknown;href:string;icon:typeof Boxes;trend?:number|null;inverse?:boolean}){const negative=Number(value)<0,good=trend!=null&&(inverse?trend<=0:trend>=0);return <Link href={href} className="premium-kpi group"><span className="premium-kpi-icon"><Icon size={19}/></span><div className="min-w-0 flex-1"><p>{label}</p><strong className={negative?"text-red-700":""} title={money(value)}>{compactMoney(value)}</strong><small className={trend==null?"is-neutral":good?"is-up":"is-down"}>{trend==null?<>رصيد حالي <ArrowUpLeft size={12}/></>:<>{good?<TrendingUp size={12}/>:<TrendingDown size={12}/>} {Math.abs(trend).toFixed(1)}% عن الشهر السابق</>}</small></div></Link>}
function OperationalCard({label,value,href,icon:Icon,numeric=false}:{label:string;value:unknown;href:string;icon:typeof Factory;numeric?:boolean}){return <Link href={href} className="premium-operation-card"><span><Icon size={18}/></span><small>{label}</small><b>{numeric?number(value):money(value)}</b></Link>}
function Metric({label,value}:{label:string;value:string}){return <div><p className="text-xs text-slate-500">{label}</p><b className="mt-1 block text-sm">{value}</b></div>}
function Status({row}:{row:Row}){const value=row.isNew?"جديد":row.stopped?"متوقف":row.declining?"متراجع":row.inactive?"غير نشط":"نشط";return <span className={`premium-status ${value==="نشط"||value==="جديد"?"is-good":value==="متوقف"?"is-danger":"is-warning"}`}>{value}</span>}
