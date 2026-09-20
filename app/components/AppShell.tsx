"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Landmark, LayoutDashboard, ShoppingCart, ShoppingBag, Boxes, Factory, ClipboardCheck,
  Truck, Users, HardHat, Globe2, Handshake, Wrench, ChartNoAxesCombined, UploadCloud,
  BadgeCheck, Files, Bell, Settings, LifeBuoy, Search, Menu, PanelRightClose,
  PanelRightOpen, Moon, Sun, Languages, ChevronDown, LogOut, Building2, Sparkles,
  ShieldCheck, SlidersHorizontal, DatabaseZap, X,
} from "lucide-react";
import NetajOne from "./NetajOne";

type Session = { userName:string; companyCode:string; companyId:number; modules:string[]; availableCompanies:{id:number;code:string;legalNameAr:string}[] };
type Theme = { logoUrl?:string|null; menuOrder?:string[]; primaryColor?:string; secondaryColor?:string; accentColor?:string };
type NavItem = { label:string; href:string; module:string; icon:typeof LayoutDashboard };
type NavGroup = { label:string; items:NavItem[] };

const groups:NavGroup[] = [
  {label:"مساحة العمل",items:[
    {label:"الرئيسية",href:"/",module:"CORE",icon:LayoutDashboard},
    {label:"المحاسبة والمالية",href:"/accounting",module:"ACCOUNTING",icon:Landmark},
    {label:"المبيعات",href:"/sales",module:"SALES",icon:ShoppingCart},
    {label:"المشتريات",href:"/purchases",module:"PURCHASES",icon:ShoppingBag},
    {label:"المخزون",href:"/inventory",module:"INVENTORY",icon:Boxes},
    {label:"المصنع",href:"/factory",module:"FACTORY",icon:Factory},
    {label:"سندات الاستلام والتسليم",href:"/notes",module:"NOTES",icon:ClipboardCheck},
    {label:"النقل والأسطول",href:"/transport",module:"TRANSPORT",icon:Truck},
  ]},
  {label:"الأعمال",items:[
    {label:"الموارد البشرية",href:"/hr",module:"HR",icon:Users},
    {label:"المقاولات والمشاريع",href:"/projects",module:"PROJECTS",icon:HardHat},
    {label:"الأعمال الخارجية",href:"/external",module:"EXTERNAL",icon:Globe2},
    {label:"إدارة العملاء CRM",href:"/crm",module:"CRM",icon:Handshake},
    {label:"الأصول والصيانة",href:"/assets",module:"ASSETS",icon:Wrench},
    {label:"التقارير والتحليلات",href:"/reports",module:"CORE",icon:ChartNoAxesCombined},
    {label:"التسوية البنكية",href:"/treasury",module:"ACCOUNTING",icon:Landmark},
    {label:"التقارير المالية",href:"/accounting?tab=reports",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"تقارير الذكاء الاصطناعي",href:"/assistant",module:"CORE",icon:Sparkles},
    {label:"التقارير الذكية",href:"/reports/builder",module:"CORE",icon:Files},
    {label:"التقارير الإحصائية",href:"/dashboards",module:"CORE",icon:ChartNoAxesCombined},
    {label:"ربط منصة زد",href:"/integrations",module:"INTEGRATIONS",icon:Globe2},
    {label:"مندوبي المبيعات",href:"/crm",module:"CRM",icon:Users},
    {label:"مركز الاستيراد",href:"/imports",module:"IMPORT",icon:UploadCloud},
    {label:"الموافقات",href:"/approvals",module:"APPROVALS",icon:BadgeCheck},
    {label:"المرفقات والمستندات",href:"/documents",module:"DMS",icon:Files},
    {label:"التنبيهات الرقابية",href:"/controls",module:"CORE",icon:Bell},
    {label:"التوأم التشغيلي",href:"/operations",module:"CORE",icon:ChartNoAxesCombined},
    {label:"مركز الإشعارات",href:"/notifications",module:"CORE",icon:Bell},
  ]},
  {label:"الإدارة",items:[
    {label:"إعدادات المؤسسة",href:"/settings/organization",module:"CORE",icon:Building2},
    {label:"التخصيص بدون كود",href:"/settings/configuration",module:"CONFIG",icon:SlidersHorizontal},
    {label:"التصميم والهوية",href:"/settings/design",module:"DESIGN",icon:Sparkles},
    {label:"المستخدمون والصلاحيات",href:"/settings/users",module:"CORE",icon:ShieldCheck},
    {label:"المهام الخلفية",href:"/settings/jobs",module:"CORE",icon:DatabaseZap},
    {label:"الإعدادات والأمان",href:"/settings/security",module:"CORE",icon:Settings},
    {label:"المساعدة والدعم",href:"/assistant",module:"CORE",icon:LifeBuoy},
  ]},
];

const publicRoutes=["/login","/setup","/portal"];
const publicPage=(path:string)=>publicRoutes.some(route=>path===route||path.startsWith(`${route}/`))||/^\/(?:notes|sales|workflows)\/\d+\/print$/.test(path)||/^\/transport\/(?:trips|receipts)\/\d+\/print$/.test(path)||/^\/accounting\/vouchers\/\d+\/print$/.test(path);
const english:Record<string,string>={
"مساحة العمل":"Workspace","الأعمال":"Business","الإدارة":"Administration","الرئيسية":"Home","المحاسبة والمالية":"Finance & Accounting","المبيعات":"Sales","المشتريات":"Purchases","المخزون":"Inventory","المصنع":"Factory","سندات الاستلام والتسليم":"Receipt & Delivery Vouchers","النقل والأسطول":"Transport & Fleet","الموارد البشرية":"Human Resources","المقاولات والمشاريع":"Projects & Contracting","الأعمال الخارجية":"External Business","إدارة العملاء CRM":"Customer CRM","الأصول والصيانة":"Assets & Maintenance","التقارير والتحليلات":"Reports & Analytics","التسوية البنكية":"Bank Reconciliation","التقارير المالية":"Financial Reports","تقارير الذكاء الاصطناعي":"AI Reports","التقارير الذكية":"Smart Reports","التقارير الإحصائية":"Statistical Reports","ربط منصة زد":"Zid Integration","مندوبي المبيعات":"Sales Representatives","مركز الاستيراد":"Migration Center","الموافقات":"Approvals","المرفقات والمستندات":"Documents","التنبيهات الرقابية":"Control Alerts","التوأم التشغيلي":"Operations Twin","مركز الإشعارات":"Notifications","إعدادات المؤسسة":"Organization","التخصيص بدون كود":"No-code Configuration","التصميم والهوية":"Design & Identity","المستخدمون والصلاحيات":"Users & Permissions","المهام الخلفية":"Background Jobs","الإعدادات والأمان":"Settings & Security","المساعدة والدعم":"Help & Support"
};

export default function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname(),router=useRouter(),[session,setSession]=useState<Session|null>(null),[theme,setTheme]=useState<Theme|null>(null),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&window.localStorage.getItem("netaj-sidebar-collapsed")==="1"),[mobileOpen,setMobileOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[query,setQuery]=useState(""),[direction,setDirection]=useState<"rtl"|"ltr">(()=>typeof window!=="undefined"&&window.localStorage.getItem("netaj-language")==="en"?"ltr":"rtl"),searchRef=useRef<HTMLInputElement>(null);
  const isPublic=publicPage(pathname);
  useEffect(()=>{if(isPublic)return;const controller=new AbortController();Promise.all([fetch("/api/auth/session",{cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null),fetch("/api/design/runtime",{cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null)]).then(([auth,runtime])=>{if(auth)setSession(auth);if(runtime?.theme)setTheme(runtime.theme)}).catch(()=>undefined);return()=>controller.abort()},[isPublic]);
  useEffect(()=>{if(isPublic)return;const handle=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();searchRef.current?.focus()}};window.addEventListener("keydown",handle);return()=>window.removeEventListener("keydown",handle)},[isPublic]);
  useEffect(()=>{if(isPublic)return;document.documentElement.dir=direction;document.documentElement.lang=direction==="rtl"?"ar":"en"},[direction,isPublic]);
  const visibleGroups=useMemo(()=>{const enabled=new Set(session?.modules??[]),order=new Map((theme?.menuOrder??[]).map((href,index)=>[href,index]));return groups.map(group=>({...group,items:group.items.filter(item=>enabled.has(item.module)).sort((a,b)=>(order.get(a.href)??999)-(order.get(b.href)??999))})).filter(group=>group.items.length)},[session,theme]);
  if(isPublic)return children;
  function toggleSidebar(){setCollapsed(value=>{window.localStorage.setItem("netaj-sidebar-collapsed",value?"0":"1");return!value})}
  function search(event:FormEvent){event.preventDefault();if(query.trim().length>1)router.push(`/search?q=${encodeURIComponent(query.trim())}`)}
  function toggleTheme(){const root=document.documentElement,next=root.dataset.theme==="dark"?"light":"dark";root.dataset.theme=next;window.localStorage.setItem("netaj-color-mode",next)}
  function toggleDirection(){const next=direction==="rtl"?"ltr":"rtl";window.localStorage.setItem("netaj-language",next==="ltr"?"en":"ar");window.localStorage.setItem("netaj-direction",next);setDirection(next);window.location.reload()}
  const translated=(value:string)=>direction==="ltr"?(english[value]??value):value;
  async function switchCompany(companyId:number){if(companyId===session?.companyId)return;const response=await fetch("/api/auth/switch-company",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({companyId})});if(response.ok){router.push("/");router.refresh()}}
  async function logout(){await fetch("/api/auth/logout",{method:"POST"});router.push("/login");router.refresh()}
  return <div className="erp-shell" dir={direction}>
    {mobileOpen&&<button aria-label="إغلاق القائمة" className="erp-sidebar-backdrop" onClick={()=>setMobileOpen(false)}/>} 
    <aside className={`erp-sidebar ${collapsed?"is-collapsed":""} ${mobileOpen?"is-mobile-open":""}`}>
      <div className="erp-brand">
        <Link href="/" aria-label="الرئيسية" className="erp-brand-mark">{theme?.logoUrl?<Image src={theme.logoUrl} width={150} height={52} unoptimized alt={session?.companyCode??"NETAj"}/>:<><span className="erp-brand-gem">N</span>{!collapsed&&<span><b>NETAJ</b><small>GLOBAL ERP</small></span>}</>}</Link>
        <button aria-label={collapsed?"توسيع القائمة":"طي القائمة"} className="erp-collapse-button" onClick={toggleSidebar}>{collapsed?<PanelRightOpen size={18}/>:<PanelRightClose size={18}/>}</button>
      </div>
      <nav aria-label={direction==="rtl"?"القائمة الرئيسية":"Main navigation"} className="erp-nav">{visibleGroups.map(group=><div key={group.label} className="erp-nav-group">{!collapsed&&<p>{translated(group.label)}</p>}{group.items.map(item=>{const Icon=item.icon,active=item.href==="/"?pathname==="/":pathname.startsWith(item.href);return <Link onClick={()=>setMobileOpen(false)} title={collapsed?translated(item.label):undefined} aria-current={active?"page":undefined} key={item.href} href={item.href} className={`erp-nav-item ${active?"is-active":""}`}><span className="erp-nav-icon"><Icon size={18}/></span>{!collapsed&&<span>{translated(item.label)}</span>}</Link>})}</div>)}</nav>
      <div className="erp-sidebar-footer"><div className="erp-trust"><ShieldCheck size={17}/>{!collapsed&&<span>{direction==="rtl"?"بيئة مؤسسية آمنة":"Secure enterprise environment"}</span>}</div></div>
    </aside>
    <div className="erp-stage">
      <header className="erp-topbar">
        <button aria-label="فتح القائمة" className="erp-mobile-menu" onClick={()=>setMobileOpen(true)}><Menu/></button>
        <form onSubmit={search} className="erp-global-search"><Search size={18}/><input ref={searchRef} aria-label={direction==="rtl"?"البحث الشامل":"Global search"} value={query} onChange={event=>setQuery(event.target.value)} placeholder={direction==="rtl"?"ابحث عن عميل، فاتورة، مادة أو مشروع…":"Search customers, invoices, items or projects…"}/><kbd>⌘ K</kbd></form>
        <div className="erp-top-actions">
          <button aria-label={direction==="rtl"?"Switch to English":"التبديل إلى العربية"} aria-pressed={direction==="ltr"} className="erp-icon-button" onClick={toggleDirection}><Languages size={19}/><span className="hidden xl:inline">{direction==="rtl"?"EN":"AR"}</span></button>
          <button aria-label="تبديل الوضع" className="erp-icon-button" onClick={toggleTheme}><Sun className="theme-light-icon" size={19}/><Moon className="theme-dark-icon" size={19}/></button>
          <Link aria-label="التنبيهات" href="/notifications" className="erp-icon-button"><Bell size={19}/><i/></Link>
          <div className="relative"><button aria-expanded={accountOpen} onClick={()=>setAccountOpen(!accountOpen)} className="erp-account-button"><span>{session?.userName?.slice(0,1)??"N"}</span><div><b>{session?.userName??"NETAj"}</b><small>{session?.companyCode??"ERP"}</small></div><ChevronDown size={16}/></button>{accountOpen&&<div className="erp-account-menu"><label>الشركة<select value={session?.companyId??""} onChange={event=>void switchCompany(Number(event.target.value))}>{session?.availableCompanies?.map(company=><option key={company.id} value={company.id}>{company.legalNameAr||company.code}</option>)}</select></label><Link href="/settings/security"><ShieldCheck size={16}/>أمان الحساب</Link><button onClick={()=>void logout()}><LogOut size={16}/>تسجيل الخروج</button></div>}</div>
        </div>
      </header>
      <div className="erp-workspace">{children}</div>
    </div>
    <button aria-label="إغلاق القائمة" className={`erp-mobile-close ${mobileOpen?"is-visible":""}`} onClick={()=>setMobileOpen(false)}><X/></button>
    <NetajOne/>
  </div>
}
