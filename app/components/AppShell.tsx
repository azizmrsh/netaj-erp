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
type NavItem = { label:string; href:string; module:string; icon:typeof LayoutDashboard; children?:NavItem[] };
type NavGroup = { label:string; items:NavItem[] };

const groups:NavGroup[] = [
  {label:"مساحة العمل",items:[
    {label:"الرئيسية",href:"/",module:"CORE",icon:LayoutDashboard},
    {label:"المحاسبة والمالية",href:"/accounting",module:"ACCOUNTING",icon:Landmark},
    {label:"شجرة الحسابات",href:"/accounting?tab=chart",module:"ACCOUNTING",icon:Landmark},
    {label:"الحسابات",href:"/accounting?tab=accounts",module:"ACCOUNTING",icon:Files},
    {label:"القيود اليومية",href:"/accounting?tab=journals",module:"ACCOUNTING",icon:Files},
    {label:"القيود الدورية",href:"/accounting?tab=recurring",module:"ACCOUNTING",icon:Files},
    {label:"سندات الصرف",href:"/accounting?tab=payment",module:"ACCOUNTING",icon:UploadCloud},
    {label:"كل السندات",href:"/accounting?tab=allVouchers",module:"ACCOUNTING",icon:Files},
    {label:"سندات القبض",href:"/accounting?tab=receipt",module:"ACCOUNTING",icon:UploadCloud},
    {label:"سندات التحويل",href:"/accounting?tab=transfer",module:"ACCOUNTING",icon:Landmark},
    {label:"أرصدة الأصناف",href:"/inventory",module:"ACCOUNTING",icon:Boxes},
    {label:"ميزان المراجعة",href:"/accounting?tab=reports&report=trial-balance",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"قائمة الدخل",href:"/accounting?tab=reports&report=profit-and-loss",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"المركز المالي",href:"/accounting?tab=reports&report=balance-sheet",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"الميزانيات",href:"/accounting?tab=budgets",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"قائمة التدفقات النقدية",href:"/accounting?tab=reports&report=cash-flow",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"توزيع الأرباح والخسائر",href:"/accounting?tab=reports&report=changes-in-equity",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"إهلاكات الأصول",href:"/assets",module:"ACCOUNTING",icon:Wrench},
    {label:"مراكز التكلفة",href:"/accounting?tab=costCenters",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"مركز التكلفة التفصيلي",href:"/accounting?tab=costCenterDetail",module:"ACCOUNTING",icon:ChartNoAxesCombined},
    {label:"جاري الشركاء",href:"/accounting?tab=partners",module:"ACCOUNTING",icon:Users},
    {label:"إدارة دفاتر الشيكات",href:"/accounting?tab=chequebooks",module:"ACCOUNTING",icon:Files},
    {label:"الشيكات المدفوعة",href:"/accounting?tab=paidCheques",module:"ACCOUNTING",icon:Files},
    {label:"الشيكات المستلمة",href:"/accounting?tab=receivedCheques",module:"ACCOUNTING",icon:Files},
    {label:"طرق الدفع",href:"/accounting?tab=paymentMethods",module:"ACCOUNTING",icon:Landmark},
    {label:"العملات",href:"/accounting?tab=currencies",module:"ACCOUNTING",icon:Landmark},
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

const detailedGroups:NavGroup[] = [
  {label:"الرئيسية",items:[{label:"لوحة التحكم",href:"/",module:"CORE",icon:LayoutDashboard},{label:"ملخص الأعمال والمؤشرات",href:"/dashboards",module:"CORE",icon:ChartNoAxesCombined},{label:"التنبيهات والمهام والموافقات",href:"/approvals",module:"APPROVALS",icon:BadgeCheck}]},
  {label:"المحاسبة",items:[{label:"شجرة الحسابات والحسابات",href:"/accounting?tab=chart",module:"ACCOUNTING",icon:Landmark},{label:"القيود اليومية والدورية",href:"/accounting?tab=journals",module:"ACCOUNTING",icon:Files},{label:"سندات القبض والصرف والتحويل",href:"/accounting?tab=vouchers",module:"ACCOUNTING",icon:UploadCloud},{label:"كل السندات",href:"/accounting?tab=allVouchers",module:"ACCOUNTING",icon:Files},{label:"الأرصدة وميزان المراجعة",href:"/accounting?tab=reports&report=trial-balance",module:"ACCOUNTING",icon:ChartNoAxesCombined},{label:"قائمة الدخل والمركز المالي والتدفقات",href:"/accounting?tab=reports&report=profit-and-loss",module:"ACCOUNTING",icon:ChartNoAxesCombined},{label:"الميزانيات وتوزيع الأرباح والخسائر",href:"/accounting?tab=budgets",module:"ACCOUNTING",icon:ChartNoAxesCombined},{label:"الأصول والإهلاكات ومراكز التكلفة",href:"/assets",module:"ASSETS",icon:Wrench},{label:"جاري الشركاء والشيكات وطرق الدفع والعملات",href:"/accounting?tab=paymentMethods",module:"ACCOUNTING",icon:Landmark}]},
  {label:"المبيعات والمشتريات",items:[{label:"المبيعات: عروض وأوامر وفواتير ومرتجعات",href:"/sales",module:"SALES",icon:ShoppingCart},{label:"العملاء ومندوبي المبيعات وتقارير المبيعات",href:"/parties",module:"CORE",icon:Users},{label:"المشتريات: طلبات وأوامر وفواتير ومرتجعات",href:"/purchases",module:"PURCHASES",icon:ShoppingBag},{label:"الموردون وتقارير المشتريات",href:"/parties",module:"CORE",icon:Users}]},
  {label:"المخزون والمصنع والنقل",items:[{label:"الأصناف والمستودعات والأرصدة والحركات",href:"/inventory",module:"INVENTORY",icon:Boxes},{label:"الاستلام والتسليم والتحويل والجرد",href:"/notes",module:"NOTES",icon:ClipboardCheck},{label:"التصنيع والمواد الخام وتكلفة الإنتاج",href:"/factory",module:"FACTORY",icon:Factory},{label:"النقل والشاحنات والسائقون والرحلات",href:"/transport",module:"TRANSPORT",icon:Truck}]},
  {label:"الموارد والمشاريع والأصول",items:[{label:"الموظفون والرواتب والحضور والإجازات",href:"/hr",module:"HR",icon:Users},{label:"المشاريع والعقود والتكاليف والمستخلصات",href:"/projects",module:"PROJECTS",icon:HardHat},{label:"الأصول الثابتة والصيانة والإهلاك",href:"/assets",module:"ASSETS",icon:Wrench}]},
  {label:"البنوك والعملاء والموردون والمصروفات",items:[{label:"الحسابات البنكية والتحويلات والتسويات",href:"/accounting?tab=banks",module:"ACCOUNTING",icon:Landmark},{label:"العملاء والموردون والأرصدة وأعمار الديون",href:"/parties",module:"CORE",icon:Users},{label:"المصروفات والأعمال الخارجية المعزولة",href:"/external",module:"EXTERNAL",icon:Globe2}]},
  {label:"التقارير والاستيراد وNETAJ ONE",items:[{label:"التقارير المالية وتقارير الأقسام",href:"/reports",module:"CORE",icon:ChartNoAxesCombined},{label:"التقارير المخصصة ولوحة المؤشرات",href:"/reports/builder",module:"CORE",icon:Files},{label:"استيراد وترحيل ومطابقة البيانات",href:"/imports",module:"IMPORT",icon:UploadCloud},{label:"المساعد الذكي والتحليل والتنبيهات",href:"/assistant",module:"CORE",icon:Sparkles}]},
  {label:"المستخدمون والشركات والإعدادات",items:[{label:"المستخدمون والأدوار والصلاحيات والتدقيق",href:"/settings/users",module:"CORE",icon:ShieldCheck},{label:"الشركات والفروع والسنوات والفترات",href:"/settings/organization",module:"CORE",icon:Building2},{label:"إعدادات النظام والضرائب والترقيم والقوالب",href:"/settings/configuration",module:"CONFIG",icon:Settings},{label:"اللغة والمظهر والتكاملات",href:"/settings/design",module:"DESIGN",icon:Settings}]},
];
const menuChildren=(base:string,module:string,labels:string[]):NavItem[]=>labels.map((label,index)=>({label,href:`${base}${base.includes("?")?"&":"?"}tab=sub-${index}`,module,icon:Files}));
const accountingChildren:NavItem[]=[
  ["شجرة الحسابات","chart"],["الحسابات","accounts"],["القيود اليومية","journals"],["القيود الدورية","journals"],
  ["سندات الصرف","payment"],["كل السندات","allVouchers"],["سندات القبض","receipt"],["سندات التحويل","transfer"],
  ["أرصدة الأصناف","overview"],["ميزان المراجعة","reports"],["قائمة الدخل","reports"],["المركز المالي","reports"],
  ["الميزانيات","budgets"],["قائمة التدفقات النقدية","reports"],["توزيع الأرباح والخسائر","reports"],["إهلاكات الأصول","assets"],
  ["مراكز التكلفة","reports"],["مركز التكلفة التفصيلي","reports"],["جاري الشركاء","receivables"],["إدارة دفاتر الشيكات","vouchers"],
  ["الشيكات المدفوعة","vouchers"],["الشيكات المستلمة","vouchers"],["طرق الدفع","paymentMethods"],["العملات","currencies"]
].map(([label,tab])=>({label,href:`/accounting?tab=${tab}`,module:"ACCOUNTING",icon:Files}));
const homeChildren:NavItem[]=[
  {label:"ملخص الأعمال",href:"/dashboards",module:"CORE",icon:Files},
  {label:"التنبيهات",href:"/notifications",module:"CORE",icon:Bell},
  {label:"المهام والموافقات",href:"/approvals",module:"APPROVALS",icon:BadgeCheck},
  {label:"المؤشرات الرئيسية",href:"/dashboards?view=indicators",module:"CORE",icon:ChartNoAxesCombined},
];
const settingsChildren:NavItem[]=[
  {label:"تخصيص لوحة التحكم",href:"/settings/configuration",module:"CONFIG",icon:LayoutDashboard},
  {label:"إعدادات النظام",href:"/settings/configuration?section=system",module:"CONFIG",icon:Settings},
  {label:"إعدادات المحاسبة والمبيعات والمشتريات والمخزون",href:"/settings/configuration?section=modules",module:"CONFIG",icon:Files},
  {label:"إعدادات الضرائب",href:"/settings/configuration?section=tax",module:"CONFIG",icon:BadgeCheck},
  {label:"الترقيم والتسلسل",href:"/settings/configuration?section=numbering",module:"CONFIG",icon:Files},
  {label:"القوالب والطباعة",href:"/settings/design",module:"DESIGN",icon:Files},
  {label:"الإشعارات",href:"/settings/configuration?section=notifications",module:"CONFIG",icon:Bell},
  {label:"اللغة والمظهر والتكاملات",href:"/settings/design",module:"DESIGN",icon:Settings},
];
const referenceGroups:NavGroup[] = [{label:"مساحة العمل",items:[
  {label:"الرئيسية",href:"/",module:"CORE",icon:LayoutDashboard,children:homeChildren},
  {label:"المحاسبة",href:"/accounting",module:"ACCOUNTING",icon:Landmark,children:accountingChildren},
  {label:"المبيعات",href:"/sales",module:"SALES",icon:ShoppingCart,children:menuChildren("/sales","SALES",["عروض الأسعار","أوامر البيع","فواتير المبيعات","إشعارات دائن ومدين","مرتجعات المبيعات","العملاء","قوائم الأسعار","مندوبي المبيعات","تقارير المبيعات"])},
  {label:"المشتريات",href:"/purchases",module:"PURCHASES",icon:ShoppingBag,children:menuChildren("/purchases","PURCHASES",["طلبات الشراء","أوامر الشراء","فواتير المشتريات","مرتجعات المشتريات","الموردون","عروض الموردين","مقارنة الأسعار","تقارير المشتريات"])},
  {label:"المخزون",href:"/inventory",module:"INVENTORY",icon:Boxes,children:menuChildren("/inventory","INVENTORY",["الأصناف","المستودعات","أرصدة المخزون","حركات المخزون","أذن الاستلام والتسليم","التحويل المخزني","تسوية المخزون","الجرد","مخزون الشركة ومخزون العملاء","تقارير المخزون"])},
  {label:"المصنع والتصنيع",href:"/factory",module:"FACTORY",icon:Factory,children:menuChildren("/factory","FACTORY",["أوامر التصنيع","خطط الإنتاج","المواد الخام","المنتجات","وصفات التصنيع","استهلاك المواد","الإنتاج الفعلي","تكلفة الإنتاج","ربحية المصنع","تقارير المصنع"])},
  {label:"النقل واللوجستيات",href:"/transport",module:"TRANSPORT",icon:Truck,children:menuChildren("/transport","TRANSPORT",["أوامر النقل","سندات النقل","الشاحنات","الصهاريج","السائقين","الرحلات","التحميل والتسليم","مصروفات الرحلات","متابعة النقل","تقارير النقل"])},
  {label:"الموارد البشرية والرواتب",href:"/hr",module:"HR",icon:Users,children:menuChildren("/hr","HR",["الموظفون","العقود","الحضور والانصراف","الإجازات","الرواتب","البدلات","الخصومات","السلف","المستحقات","نهاية الخدمة","مسيرات الرواتب","تقارير الموارد البشرية"])},
  {label:"المشاريع والمقاولات",href:"/projects",module:"PROJECTS",icon:HardHat,children:menuChildren("/projects","PROJECTS",["المشاريع","العقود","بنود المشروع","التكاليف","المصروفات","الإيرادات","المستخلصات","الموردون والمقاولون","تقدم المشروع","ربحية المشروع","تقارير المشاريع"])},
  {label:"الأصول الثابتة",href:"/assets",module:"ASSETS",icon:Wrench,children:menuChildren("/assets","ASSETS",["سجل الأصول","فئات الأصول","إضافة أصل","نقل الأصول","إهلاك الأصول","بيع أو استبعاد أصل","صيانة الأصول","تقارير الأصول"])},
  {label:"البنوك والصناديق",href:"/treasury",module:"ACCOUNTING",icon:Landmark,children:menuChildren("/treasury","ACCOUNTING",["الحسابات البنكية","الصناديق","الحركات البنكية","التحويلات","التسويات البنكية","الشيكات","كشف الحساب والتقارير"])},
  {label:"العملاء",href:"/parties",module:"CORE",icon:Users,children:menuChildren("/parties","CORE",["قائمة العملاء","إضافة عميل","أرصدة العملاء","كشف حساب عميل","أعمار الديون","حدود الائتمان ومعاملات العميل"])},
  {label:"الموردون",href:"/parties",module:"CORE",icon:Users,children:menuChildren("/parties","CORE",["قائمة الموردين","إضافة مورد","أرصدة الموردين","كشف حساب مورد","أعمار الديون","معاملات المورد"])},
  {label:"المصروفات",href:"/accounting?tab=expenses",module:"ACCOUNTING",icon:Files,children:menuChildren("/accounting?tab=expenses","ACCOUNTING",["المصروفات","تصنيفات المصروفات","المصروفات المتكررة","المصروفات المستحقة","تقارير المصروفات"])},
  {label:"المبيعات والمصروفات الخارجية",href:"/external",module:"EXTERNAL",icon:Globe2,children:menuChildren("/external","EXTERNAL",["المبيعات الخارجية","المصروفات الخارجية","العملاء الخارجيون","التحصيلات","المدفوعات","الربحية الخارجية","التقارير الخارجية"])},
  {label:"التقارير",href:"/reports",module:"CORE",icon:ChartNoAxesCombined,children:menuChildren("/reports","CORE",["التقارير المالية","تقارير الأقسام","التقارير المخصصة","لوحة المؤشرات"])},
  {label:"مركز الترحيل واستيراد البيانات",href:"/imports",module:"IMPORT",icon:UploadCloud,children:menuChildren("/imports","IMPORT",["استيراد البيانات","ترحيل البيانات","مطابقة البيانات","الأخطاء والاستثناءات","سجل عمليات الترحيل","قوالب الاستيراد"])},
  {label:"NETAJ ONE",href:"/assistant",module:"CORE",icon:Sparkles,children:menuChildren("/assistant","CORE",["المساعد الذكي","اسأل عن أعمالك","التحليل المالي","التحليلات والتنبيهات الذكية والتوقعات"])},
  {label:"الموافقات والمهام",href:"/approvals",module:"APPROVALS",icon:BadgeCheck,children:menuChildren("/approvals","APPROVALS",["صندوق الموافقات","طلباتي","المهام","سجل الموافقات","مسارات الاعتماد"])},
  {label:"المستخدمون والصلاحيات",href:"/settings/users",module:"CORE",icon:ShieldCheck,children:menuChildren("/settings/users","CORE",["المستخدمون","الأدوار","الصلاحيات","صلاحيات الفروع والشركات","سجل النشاط","سجل التدقيق"])},
  {label:"الفروع والشركات",href:"/settings/organization",module:"CORE",icon:Building2,children:menuChildren("/settings/organization","CORE",["الشركات","الفروع","السنوات المالية","الفترات المحاسبية","بيانات المنشأة"])},
  {label:"الإعدادات",href:"/settings/configuration",module:"CONFIG",icon:Settings,children:settingsChildren}
]}];
const publicRoutes=["/login","/setup","/portal"];
const publicPage=(path:string)=>publicRoutes.some(route=>path===route||path.startsWith(`${route}/`))||/^\/(?:notes|sales|workflows)\/\d+\/print$/.test(path)||/^\/transport\/(?:trips|receipts)\/\d+\/print$/.test(path)||/^\/accounting\/vouchers\/\d+\/print$/.test(path);
const english:Record<string,string>={
"مساحة العمل":"Workspace","الأعمال":"Business","الإدارة":"Administration","الرئيسية":"Home","المحاسبة والمالية":"Finance & Accounting","المبيعات":"Sales","المشتريات":"Purchases","المخزون":"Inventory","المصنع":"Factory","سندات الاستلام والتسليم":"Receipt & Delivery Vouchers","النقل والأسطول":"Transport & Fleet","الموارد البشرية":"Human Resources","المقاولات والمشاريع":"Projects & Contracting","الأعمال الخارجية":"External Business","إدارة العملاء CRM":"Customer CRM","الأصول والصيانة":"Assets & Maintenance","التقارير والتحليلات":"Reports & Analytics","التسوية البنكية":"Bank Reconciliation","التقارير المالية":"Financial Reports","تقارير الذكاء الاصطناعي":"AI Reports","التقارير الذكية":"Smart Reports","التقارير الإحصائية":"Statistical Reports","ربط منصة زد":"Zid Integration","مندوبي المبيعات":"Sales Representatives","مركز الاستيراد":"Migration Center","الموافقات":"Approvals","المرفقات والمستندات":"Documents","التنبيهات الرقابية":"Control Alerts","التوأم التشغيلي":"Operations Twin","مركز الإشعارات":"Notifications","إعدادات المؤسسة":"Organization","التخصيص بدون كود":"No-code Configuration","التصميم والهوية":"Design & Identity","المستخدمون والصلاحيات":"Users & Permissions","المهام الخلفية":"Background Jobs","الإعدادات والأمان":"Settings & Security","المساعدة والدعم":"Help & Support"
};
Object.assign(english,{"العملاء والموردين":"Customers & Suppliers","الحسابات العامة":"General Ledger","المصروفات":"Expenses","الأصول الثابتة":"Fixed Assets","الرواتب والموارد البشرية":"Payroll & HR","المشاريع":"Projects","الزكاة والضريبة":"Zakat & VAT","الفوترة الإلكترونية":"E-Invoicing","الإعدادات":"Settings"});

export default function AppShell({children}:{children:React.ReactNode}){
  const pathname=usePathname(),router=useRouter(),[session,setSession]=useState<Session|null>(null),[theme,setTheme]=useState<Theme|null>(null),[collapsed,setCollapsed]=useState(()=>typeof window!=="undefined"&&window.localStorage.getItem("netaj-sidebar-collapsed")==="1"),[mobileOpen,setMobileOpen]=useState(false),[accountOpen,setAccountOpen]=useState(false),[query,setQuery]=useState(""),[direction,setDirection]=useState<"rtl"|"ltr">(()=>typeof window!=="undefined"&&window.localStorage.getItem("netaj-language")==="en"?"ltr":"rtl"),searchRef=useRef<HTMLInputElement>(null);
  const [openNav,setOpenNav]=useState<string|null>("الرئيسية");
  const isPublic=publicPage(pathname);
  useEffect(()=>{if(isPublic)return;const controller=new AbortController();Promise.all([fetch("/api/auth/session",{cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null),fetch("/api/design/runtime",{cache:"no-store",signal:controller.signal}).then(r=>r.ok?r.json():null)]).then(([auth,runtime])=>{if(auth)setSession(auth);if(runtime?.theme)setTheme(runtime.theme)}).catch(()=>undefined);return()=>controller.abort()},[isPublic]);
  useEffect(()=>{if(isPublic)return;const handle=(event:KeyboardEvent)=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==="k"){event.preventDefault();searchRef.current?.focus()}};window.addEventListener("keydown",handle);return()=>window.removeEventListener("keydown",handle)},[isPublic]);
  useEffect(()=>{if(isPublic)return;document.documentElement.dir=direction;document.documentElement.lang=direction==="rtl"?"ar":"en"},[direction,isPublic]);
  const visibleGroups=useMemo(()=>{const enabled=new Set(session?.modules??[]),order=new Map((theme?.menuOrder??[]).map((href,index)=>[href,index]));const filter=(items:NavItem[]):NavItem[]=>items.map(item=>({...item,children:item.children?filter(item.children):undefined})).filter(item=>enabled.has(item.module)||Boolean(item.children?.length)).sort((a,b)=>(order.get(a.href)??999)-(order.get(b.href)??999));return referenceGroups.map(group=>({...group,items:filter(group.items)})).filter(group=>group.items.length)},[session,theme]);
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
      <nav aria-label={direction==="rtl"?"القائمة الرئيسية":"Main navigation"} className="erp-nav">{visibleGroups.map(group=><div key={group.label} className="erp-nav-group">{!collapsed&&<p>{translated(group.label)}</p>}{group.items.map(item=>{const Icon=item.icon,active=item.href==="/"?pathname==="/":pathname.startsWith(item.href),hasChildren=Boolean(item.children?.length),isOpen=openNav===item.label;return <div key={item.label} className="erp-nav-node"><div className="erp-nav-parent"><Link onClick={()=>setMobileOpen(false)} title={collapsed?translated(item.label):undefined} aria-current={active?"page":undefined} href={item.href} className={`erp-nav-item ${active?"is-active":""}`}><span className="erp-nav-icon"><Icon size={18}/></span>{!collapsed&&<span>{translated(item.label)}</span>}</Link>{hasChildren&&!collapsed&&<button type="button" className="erp-nav-toggle" aria-label={`${isOpen?"إغلاق":"فتح"} ${translated(item.label)}`} aria-expanded={isOpen} onClick={()=>setOpenNav(value=>value===item.label?null:item.label)}><ChevronDown size={16}/></button>}</div>{hasChildren&&isOpen&&!collapsed&&<div className="erp-nav-children">{item.children?.map(child=>{const ChildIcon=child.icon,childActive=pathname.startsWith(child.href);return <Link onClick={()=>setMobileOpen(false)} key={child.href} href={child.href} className={`erp-nav-item erp-nav-child ${childActive?"is-active":""}`}><span className="erp-nav-icon"><ChildIcon size={14}/></span><span>{translated(child.label)}</span></Link>})}</div>}</div>})}</div>)}</nav>
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
