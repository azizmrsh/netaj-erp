import Image from "next/image";

type CompanyHeader = { legalNameAr:string; legalNameEn:string|null; vatNumber:string|null; branches:{city:string|null}[] };

export default function NetajPrintHeader({company,titleAr,titleEn}:{company:CompanyHeader;titleAr:string;titleEn:string}){
  const vat=company.vatNumber??"31254452900003";
  return <>
    <header className="netaj-form-header">
      <section dir="ltr" className="netaj-form-company netaj-form-company-en">
        <h2>Netaj Almotatwrah Commercial Company</h2>
        <p>Building No. - Street: 3030 - Qaiser Al Kateb Street</p><p>District - City: 6208 Madain Al Fahd - Jeddah</p>
        <p>State - Country: Makkah - Kingdom of Saudi Arabia</p><p>Postal code: 22347</p>
        <p>E-mail: info@advanced-netaj.com</p><p>Commercial Registration Number: 4030579090</p><p>VAT Number: {vat}</p>
      </section>
      <section className="netaj-form-brand">
        <Image src="/media/netaj-company-logo.png" width={150} height={150} unoptimized alt="شعار شركة نتاج المتطورة التجارية"/>
        <strong>{titleAr}</strong><span>{titleEn}</span>
      </section>
      <section dir="rtl" className="netaj-form-company netaj-form-company-ar">
        <h1>شركة نتاج المتطورة التجارية</h1>
        <p>رقم المبنى - الشارع: 3030 - شارع قيصر الكاتب</p><p>الحي - المدينة: 6208 مدائن الفهد - جدة</p>
        <p>الولاية - البلد: مكة المكرمة - المملكة العربية السعودية</p><p>الرمز البريدي: 22347</p>
        <p>البريد الإلكتروني: info@advanced-netaj.com</p><p>رقم السجل التجاري: 4030579090</p><p>رقم ضريبة القيمة المضافة: {vat}</p>
      </section>
    </header>
    <div className="netaj-form-gold-rule"/>
  </>;
}
