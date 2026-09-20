import Image from "next/image";
import {cookies} from "next/headers";
import {notFound,redirect} from "next/navigation";
import NetajPrintHeader from "@/app/components/NetajPrintHeader";
import PrintButton from "@/app/notes/[id]/print/PrintButton";
import {SESSION_COOKIE,requireAuthorization} from "@/lib/auth";
import {runWithDataScope} from "@/lib/data-scope";
import {qrDataUrl} from "@/lib/machine-codes";
import {prisma} from "@/lib/prisma";

const titles:Record<string,[string,string]>={QUOTATION:["عرض سعر","QUOTATION"],PROFORMA_INVOICE:["فاتورة مبدئية","PROFORMA INVOICE"],SALES_ORDER:["أمر بيع","SALES ORDER"],PURCHASE_REQUEST:["طلب شراء","PURCHASE REQUEST"],PURCHASE_ORDER:["أمر شراء","PURCHASE ORDER"]};
const money=(value:unknown)=>Number(value??0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});

export default async function WorkflowPrintPage({params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);if(!Number.isInteger(id))notFound();
  const token=(await cookies()).get(SESSION_COOKIE)?.value??null;let auth;
  try{auth=await prisma.$transaction(tx=>requireAuthorization(tx,token,{moduleKey:"CORE",action:"READ"}))}catch{redirect("/login")}
  const[document,company]=await runWithDataScope({tenantId:auth.tenantId,companyId:auth.companyId},()=>Promise.all([
    prisma.businessDocument.findFirst({where:{id,tenantId:auth.tenantId,companyId:auth.companyId},include:{party:{include:{address:true}},lines:{include:{item:{include:{unit:true}}},orderBy:{sequence:"asc"}}}}),
    prisma.company.findUnique({where:{id:auth.companyId},include:{branches:{where:{isMain:true},take:1}}}),
  ]));if(!document||!company)notFound();const title=titles[document.documentType]??[document.documentType,document.documentType],qr=await qrDataUrl(JSON.stringify({type:document.documentType,number:document.documentNumber,date:document.documentDate.toISOString(),total:Number(document.totalAmount),company:company.code}));
  return <main dir="rtl" className="netaj-invoice-print mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[8mm] text-slate-950">
    <div className="mb-4 flex justify-between print:hidden"><a href={document.direction==="SALES"?"/sales":"/purchases"} className="text-amber-800">العودة</a><div className="flex gap-2"><a href={`/api/workflows/${document.id}/export?format=pdf`} className="rounded-lg border px-4 py-2">PDF</a><a href={`/api/workflows/${document.id}/export?format=xlsx`} className="rounded-lg border px-4 py-2">Excel</a><PrintButton/></div></div>
    <NetajPrintHeader company={company} titleAr={title[0]} titleEn={title[1]}/>
    <table className="netaj-reference-table netaj-invoice-party"><tbody><tr><th>Document No<small>رقم المستند</small></th><td>{document.documentNumber}</td><th>Date<small>التاريخ</small></th><td>{document.documentDate.toLocaleDateString("en-US")}</td><th>Status<small>الحالة</small></th><td>{document.status}</td></tr><tr><th>{document.direction==="SALES"?"Customer":"Supplier"}<small>{document.direction==="SALES"?"العميل":"المورد"}</small></th><td colSpan={3}>{document.party.nameAr}</td><th>VAT Number<small>الرقم الضريبي</small></th><td>{document.party.vatNumber??"—"}</td></tr><tr><th>Validity / Needed<small>الصلاحية / الاحتياج</small></th><td>{(document.expiryDate??document.neededDate)?.toLocaleDateString("en-US")??"—"}</td><th>Representative<small>المسؤول</small></th><td>{document.salesperson??document.requester??"—"}</td><th>Reference<small>المرجع</small></th><td>{document.referenceNumber??"—"}</td></tr></tbody></table>
    <table className="netaj-reference-table netaj-invoice-lines"><thead><tr>{[["No","م"],["Code","الكود"],["Description","الوصف"],["Grade / Specification","الدرجة / المواصفة"],["Unit","الوحدة"],["Quantity","الكمية"],["Unit Price","سعر الوحدة"],["Discount","الخصم"],["VAT","الضريبة"],["Total","الإجمالي"]].map(([en,ar])=><th key={en}>{en}<small>{ar}</small></th>)}</tr></thead><tbody>{document.lines.map((line,index)=><tr key={line.id}><td>{index+1}</td><td>{line.item?.code??"—"}</td><td>{line.description??line.item?.nameAr??"—"}</td><td>{line.materialGrade??line.specifications??"—"}</td><td>{line.item?.unit.nameAr??"—"}</td><td>{money(line.quantity)}</td><td>{money(line.unitPrice)}</td><td>{money(line.discount)}</td><td>{money(line.vatAmount)}</td><td>{money(line.totalAmount)}</td></tr>)}</tbody></table>
    <section className="netaj-invoice-totals"><p><b>Subtotal / الإجمالي قبل الضريبة</b><span>{money(document.subtotal)} {document.currency}</span></p><p><b>Discount / الخصم</b><span>{money(document.discount)} {document.currency}</span></p><p><b>VAT Total / إجمالي الضريبة</b><span>{money(document.vatAmount)} {document.currency}</span></p><p><b>Grand Total / الإجمالي النهائي</b><span>{money(document.totalAmount)} {document.currency}</span></p></section>
    <section className="workflow-print-terms"><p><b>Payment Terms / شروط الدفع:</b> {document.paymentTerms??"—"}</p><p><b>Delivery Terms / شروط التسليم:</b> {[document.deliveryTime,document.deliveryPlace,document.deliveryTerms].filter(Boolean).join(" · ")||"—"}</p><p><b>Bank / IBAN:</b> {document.bankDetails??"—"}</p><p><b>Notes / ملاحظات:</b> {document.notes??"—"}</p></section>
    <footer className="netaj-invoice-footer"><div>Customer / Supplier Approval<br/>اعتماد العميل / المورد</div><div>{company.legalNameAr}<br/>المفوض بالتوقيع والختم</div><Image src={qr} width={125} height={125} unoptimized alt="QR المستند"/></footer>
  </main>
}
