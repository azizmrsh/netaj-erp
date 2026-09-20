import Image from "next/image";
import {cookies} from "next/headers";
import {notFound,redirect} from "next/navigation";
import NetajPrintHeader from "@/app/components/NetajPrintHeader";
import PrintButton from "@/app/notes/[id]/print/PrintButton";
import {SESSION_COOKIE,requireAuthorization} from "@/lib/auth";
import {runWithDataScope} from "@/lib/data-scope";
import {qrDataUrl} from "@/lib/machine-codes";
import {prisma} from "@/lib/prisma";

const money=(value:unknown)=>Number(value??0).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
export default async function SalesInvoicePrint({params}:{params:Promise<{id:string}>}){
  const id=Number((await params).id);if(!Number.isInteger(id))notFound();
  const token=(await cookies()).get(SESSION_COOKIE)?.value??null;let auth;
  try{auth=await prisma.$transaction(tx=>requireAuthorization(tx,token,{moduleKey:"SALES",action:"READ"}))}catch{redirect("/login")}
  const[invoice,company]=await runWithDataScope({tenantId:auth.tenantId,companyId:auth.companyId},()=>Promise.all([
    prisma.sale.findUnique({where:{id},include:{party:{include:{address:true}},items:{include:{item:{include:{unit:true}}}},deliveryNote:true}}),
    prisma.company.findUnique({where:{id:auth.companyId},include:{branches:{where:{isMain:true},take:1}}}),
  ]));if(!invoice||!company)notFound();
  const qr=await qrDataUrl(JSON.stringify({seller:company.vatNumber,invoice:invoice.invoiceNumber,date:invoice.invoiceDate.toISOString(),total:Number(invoice.totalAmount),vat:Number(invoice.vatAmount)})),address=invoice.party.address;
  return <main dir="rtl" className="netaj-invoice-print mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[8mm] text-slate-950">
    <div className="mb-4 flex justify-between print:hidden"><a href="/sales" className="text-amber-800">العودة للمبيعات</a><PrintButton/></div>
    <NetajPrintHeader company={company} titleAr="فاتورة ضريبية" titleEn="TAX INVOICE"/>
    <table className="netaj-reference-table netaj-invoice-party"><tbody>
      <tr><th>Customer Code<small>رمز العميل</small></th><td>{invoice.party.id}</td><th>Buyer Name<small>اسم المشتري</small></th><td colSpan={3}>{invoice.party.nameAr}</td><th>Commercial Registration number<small>رقم السجل التجاري</small></th><td>{invoice.party.unifiedNumber??"—"}</td><th>VAT Number<small>رقم ضريبة القيمة المضافة</small></th><td>{invoice.party.vatNumber??"—"}</td></tr>
      <tr><th>Building No<small>رقم المبنى</small></th><td>{address?.buildingNumber??"—"}</td><th>Street<small>الشارع</small></th><td>{address?.street??"—"}</td><th>Secondary No<small>الرقم الفرعي</small></th><td>{address?.secondaryNumber??"—"}</td><th>District<small>الحي</small></th><td>{address?.district??"—"}</td><th>City<small>المدينة</small></th><td>{address?.city??"—"}</td></tr>
      <tr><th>Country<small>الدولة</small></th><td colSpan={3}>المملكة العربية السعودية</td><th>Postal Code<small>الرمز البريدي</small></th><td>{address?.postalCode??"—"}</td><th>Region<small>المنطقة</small></th><td colSpan={3}>{address?.region??"مكة المكرمة"}</td></tr>
    </tbody></table>
    <table className="netaj-reference-table netaj-invoice-meta"><tbody><tr><th>Date and Time<small>التاريخ والوقت</small></th><td>{invoice.invoiceDate.toLocaleString("en-US")}</td><th>Invoice No<small>رقم الفاتورة</small></th><td>{invoice.invoiceNumber}</td><th>Buyer&apos;s Order No.<small>رقم أمر الشراء</small></th><td>{invoice.purchaseOrderNumber??"—"}</td><th>Delivery No.<small>رقم التسليم</small></th><td>{invoice.deliveryNote?.noteNumber??"—"}</td><th>Delivery Date<small>تاريخ التسليم</small></th><td>{invoice.deliveryNote?.noteDate.toLocaleDateString("en-US")??"—"}</td><th>Place of Supply<small>مكان التوريد</small></th><td>{address?.city??"جدة"}</td><th>Mode/Terms of Payment<small>طريقة / شروط السداد</small></th><td>{invoice.paymentMethod??"—"}</td></tr></tbody></table>
    <table className="netaj-reference-table netaj-invoice-lines"><thead><tr>{[["Serial No","الرقم التسلسلي"],["Description of Goods","وصف البضائع"],["Quantity","الكمية"],["Unit price","سعر الوحدة"],["Subtotal Exclusive of VAT","الإجمالي قبل الضريبة"],["VAT Rate %","نسبة الضريبة"],["VAT Amount","مبلغ الضريبة"],["Total Inclusive of VAT","الإجمالي شامل الضريبة"]].map(([en,ar])=><th key={en}>{en}<small>{ar}</small></th>)}</tr></thead><tbody>{invoice.items.map((row,index)=>{const before=Number(row.quantity)*Number(row.unitPrice)-Number(row.discount);return <tr key={row.id}><td>{index+1}</td><td>{row.item.nameAr}{row.description?` — ${row.description}`:""}</td><td>{money(row.quantity)} {row.item.unit.nameAr}</td><td>{money(row.unitPrice)}</td><td>{money(before)}</td><td>{money(row.vatRate)}%</td><td>{money(row.vatAmount)}</td><td>{money(row.totalAmount)}</td></tr>})}{Array.from({length:Math.max(0,5-invoice.items.length)},(_,index)=><tr key={`blank-${index}`}><td/><td/><td/><td/><td/><td/><td/><td/></tr>)}</tbody></table>
    <section className="netaj-invoice-totals"><p><b>Total Exclusive VAT / إجمالي المبلغ غير شامل الضريبة</b><span>{money(Number(invoice.subtotal)-Number(invoice.discount))} {invoice.currency}</span></p><p><b>VAT Total / إجمالي ضريبة القيمة المضافة</b><span>{money(invoice.vatAmount)} {invoice.currency}</span></p><p><b>Invoice Gross / إجمالي المبلغ شامل الضريبة</b><span>{money(invoice.totalAmount)} {invoice.currency}</span></p></section>
    <footer className="netaj-invoice-footer"><div>Customer Seal and Signature<br/>ختم وتوقيع العميل</div><div>{company.legalNameAr}<br/>المفوض بالتوقيع</div><div><Image src={qr} width={125} height={125} unoptimized alt="QR الفاتورة الضريبية"/></div></footer>
  </main>
}
