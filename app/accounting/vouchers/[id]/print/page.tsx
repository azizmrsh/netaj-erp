import Image from "next/image";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { SESSION_COOKIE, requireAuthorization } from "@/lib/auth";
import { runWithDataScope } from "@/lib/data-scope";
import { qrDataUrl } from "@/lib/machine-codes";
import { prisma } from "@/lib/prisma";
import PrintButton from "./PrintButton";
import NetajPrintHeader from "@/app/components/NetajPrintHeader";

const number = (value: unknown) => Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default async function VoucherPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const token = (await cookies()).get(SESSION_COOKIE)?.value ?? null;
  let auth;
  try { auth = await prisma.$transaction((tx) => requireAuthorization(tx, token, { moduleKey: "ACCOUNTING", action: "READ" })); }
  catch { redirect("/login"); }
  const [voucher, company] = await runWithDataScope({ tenantId: auth.tenantId, companyId: auth.companyId }, () => Promise.all([
    prisma.financialVoucher.findUnique({ where: { id }, include: { party: { include: { address: true } }, bankAccount: true, allocations: { include: { sale: true, purchase: true } } } }),
    prisma.company.findUnique({ where: { id: auth.companyId }, include: { branches: { where: { isMain: true }, take: 1 } } }),
  ]));
  if (!voucher || !company) notFound();
  const receipt = voucher.voucherType === "CUSTOMER_RECEIPT";
  const address = voucher.party?.address;
  const qr = await qrDataUrl(JSON.stringify({ type: voucher.voucherType, number: voucher.voucherNumber, date: voucher.voucherDate.toISOString(), amount: Number(voucher.amount), currency: voucher.currency, company: company.code }));
  return <main dir="rtl" className="voucher-print mx-auto min-h-[297mm] max-w-[210mm] bg-white p-[12mm] text-slate-950">
    <div className="mb-4 flex items-center justify-between print:hidden"><a href="/accounting" className="text-sm text-amber-800">العودة للمحاسبة</a><PrintButton/></div>
    <NetajPrintHeader company={company} titleAr={receipt?"سند قبض":"سند صرف"} titleEn={receipt?"Receipt Voucher":"Payment Voucher"}/>
    <section className="voucher-reference-row">
      <div className="voucher-amount-box"><strong>{number(voucher.amount)}</strong><span>{voucher.currency}</span></div>
      <small>{voucher.voucherNumber}</small>
      <div className="voucher-date-box">{voucher.voucherDate.toLocaleDateString("en-US")}</div>
    </section>
    <section className="voucher-lines">
      <p><b dir="ltr">{receipt ? "We Received From :" : "Paid To :"}</b><span>{voucher.party?.nameAr ?? "—"}</span><b>{receipt ? "استلمنا من :" : "يصرف لـ :"}</b></p>
      <p><b dir="ltr">Amount :</b><span>{number(voucher.amount)} {voucher.currency}</span><b>مبلغ وقدره :</b></p>
      <p><b dir="ltr">Payment Method:</b><span>{voucher.paymentMethod} · {voucher.bankAccount.name}</span><b>طريقة الدفع:</b></p>
      <p><b dir="ltr">For:</b><span>{voucher.description ?? voucher.notes ?? voucher.referenceNumber ?? "—"}</span><b>وذلك مقابل:</b></p>
    </section>
    {!!voucher.allocations.length && <section className="voucher-allocations"><h3>تخصيصات الاستحقاق / Allocations</h3><table><thead><tr><th>المستند</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>{voucher.allocations.map(row=><tr key={row.id}><td>{row.sale?.invoiceNumber ?? row.purchase?.purchaseNumber ?? "—"}</td><td>{row.saleId ? "فاتورة مبيعات" : "فاتورة مشتريات"}</td><td>{number(row.amount)} {voucher.currency}</td></tr>)}</tbody></table></section>}
    {address && <p className="mt-5 text-xs text-slate-500">العنوان الوطني للطرف: {[address.buildingNumber,address.street,address.district,address.city,address.postalCode].filter(Boolean).join("، ")}</p>}
    <footer className="voucher-signatures"><div><b dir="ltr">Recipient</b><span>المستلم</span></div><div><b dir="ltr">Accountant</b><span>المحاسب</span></div><Image src={qr} width={76} height={76} unoptimized alt="رمز تحقق السند"/></footer>
  </main>;
}
