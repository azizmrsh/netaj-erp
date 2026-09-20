"use client";

import { useEffect } from "react";

const dictionary:Record<string,string>={
  "الرئيسية":"Home","حفظ":"Save","إلغاء":"Cancel","حذف":"Delete","تعديل":"Edit","إضافة":"Add","بحث":"Search","عرض":"View","طباعة":"Print","تصدير":"Export","تحميل":"Upload","اعتماد":"Approve","ترحيل":"Post","إغلاق":"Close","فتح":"Open","إرسال":"Submit","التالي":"Next","السابق":"Previous","الكل":"All","نعم":"Yes","لا":"No","الحالة":"Status","التاريخ":"Date","الرقم":"Number","النوع":"Type","المبلغ":"Amount","الإجمالي":"Total","الرصيد":"Balance","العملة":"Currency","البيان":"Description","المرجع":"Reference","العميل":"Customer","المورد":"Supplier","المادة":"Item","الكمية":"Quantity","القيمة":"Value","الحساب":"Account","الشركة":"Company","المستخدم":"User","الاسم":"Name","الهاتف":"Phone","العنوان":"Address","المدينة":"City","ملاحظات":"Notes","التفاصيل":"Details","من":"From","إلى":"To","نشط":"Active","غير نشط":"Inactive","مسودة":"Draft","مكتمل":"Completed","معلق":"Pending","معتمد":"Approved","مرحّل":"Posted","فشل":"Failed","جديد":"New","متوقف":"Stopped","متراجع":"Declining",
  "المحاسبة والمالية":"Finance & Accounting","المبيعات":"Sales","المشتريات":"Purchases","المخزون":"Inventory","المصنع":"Factory","النقل والأسطول":"Transport & Fleet","الموارد البشرية":"Human Resources","المقاولات والمشاريع":"Projects & Contracting","التقارير والتحليلات":"Reports & Analytics","مركز الاستيراد":"Migration Center","الموافقات":"Approvals","مركز الإشعارات":"Notifications","إعدادات المؤسسة":"Organization Settings","المستخدمون والصلاحيات":"Users & Permissions","الإعدادات والأمان":"Settings & Security","المساعدة والدعم":"Help & Support","العملاء والموردون":"Customers & Suppliers","الأصول والصيانة":"Assets & Maintenance","الأعمال الخارجية":"External Business","التصميم والهوية":"Design & Identity","المهام الخلفية":"Background Jobs","التوأم التشغيلي":"Operations Twin","التنبيهات الرقابية":"Control Alerts","المرفقات والمستندات":"Documents & Attachments",
  "إضافة عميل":"Add customer","إضافة مورد":"Add supplier","فاتورة مبيعات":"Sales invoice","فاتورة مشتريات":"Purchase invoice","طلب شراء":"Purchase order","سند قبض":"Receipt voucher","سند صرف":"Payment voucher","قيد يومية":"Journal entry","مركز التقارير":"Report center","إعادة المحاولة":"Retry","لا توجد بيانات":"No data available","جارٍ التحميل…":"Loading…","جارٍ الحفظ…":"Saving…","تسجيل الخروج":"Sign out","أمان الحساب":"Account security","بيئة مؤسسية آمنة":"Secure enterprise environment","فتح المصدر":"Open source","عرض الكل":"View all","الفترة من":"Period from","صافي الربح":"Net profit","إجمالي المبيعات":"Total sales","إجمالي المشتريات":"Total purchases","قيمة المخزون":"Inventory value","العملاء النشطون":"Active customers","ذمم العملاء":"Accounts receivable","ذمم الموردين":"Accounts payable","التدفق النقدي":"Cash flow","الضريبة المستحقة":"VAT payable","لا توجد حركة":"No activity"
};
const arabicDigits="٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
function digits(value:string){return value.replace(/[٠-٩۰-۹]/g,char=>String(arabicDigits.indexOf(char)%10));}
function translate(value:string,english:boolean){const normalized=digits(value);if(!english)return normalized;const trimmed=normalized.trim(),exact=dictionary[trimmed];if(exact)return normalized.replace(trimmed,exact);return normalized;}

export default function LanguageRuntime(){
  useEffect(()=>{
    const english=window.localStorage.getItem("netaj-language")==="en",root=document.documentElement;
    root.lang=english?"en":"ar";root.dir=english?"ltr":"rtl";
    const visit=(node:Node)=>{
      if(node.nodeType===Node.TEXT_NODE&&node.textContent){node.textContent=translate(node.textContent,english);return;}
      if(!(node instanceof HTMLElement)||node.closest("script,style,[data-no-translate]"))return;
      for(const name of ["placeholder","title","aria-label"]){const value=node.getAttribute(name);if(value)node.setAttribute(name,translate(value,english));}
      node.childNodes.forEach(visit);
    };
    visit(document.body);
    const observer=new MutationObserver(records=>records.forEach(record=>record.addedNodes.forEach(visit)));
    observer.observe(document.body,{childList:true,subtree:true});
    return()=>observer.disconnect();
  },[]);
  return null;
}
