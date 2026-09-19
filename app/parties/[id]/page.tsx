import PartyTabs from "./components/PartyTabs";
import { prisma } from "@/lib/prisma";

export default async function PartyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const partyId = Number(id);

  const party = await prisma.party.findUnique({
    where: { id: partyId },
    include: {
      address: true,
    },
  });

  if (!party) {
    return (
      <main dir="rtl" style={{ padding: "32px" }}>
        <h1>العميل / المورد غير موجود</h1>
        
    </main>
    );
  }

  const type =
    party.isCustomer && party.isSupplier
      ? "عميل ومورد"
      : party.isCustomer
      ? "عميل"
      : party.isSupplier
      ? "مورد"
      : "-";

  return (
    <main dir="rtl" style={{ padding: "32px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ marginBottom: "8px" }}>{party.nameAr}</h1>

      <p style={{ color: "#64748b", marginBottom: "28px" }}>
        ملف العميل / المورد
      </p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
          marginBottom: "28px",
        }}
      >
        <Info label="النوع" value={type} />
        <Info label="الرقم الموحد" value={party.unifiedNumber} />
        <Info label="الرقم الضريبي" value={party.vatNumber} />
        <Info label="رقم الهاتف" value={party.telephone} />
        <Info label="البريد الإلكتروني" value={party.email} />
        <Info label="البنك" value={party.bankName} />
        <Info label="IBAN" value={party.iban} />
        <Info label="الحالة" value={party.isActive ? "نشط" : "غير نشط"} />
      </div>

      <h2 style={{ marginBottom: "16px" }}>العنوان الوطني</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "16px",
        }}
      >
        <Info label="رقم المبنى" value={party.address?.buildingNumber} />
        <Info label="الشارع" value={party.address?.street} />
        <Info label="الرقم الفرعي" value={party.address?.secondaryNumber} />
        <Info label="الحي" value={party.address?.district} />
        <Info label="المدينة" value={party.address?.city} />
        <Info label="الرمز البريدي" value={party.address?.postalCode} />
        <Info label="المنطقة" value={party.address?.region} />
        <Info label="العنوان المختصر" value={party.address?.shortAddress} />
      </div>
          <PartyTabs partyId={party.id} />
</main>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value?: string | null;
}) {
  return (
    <div
      style={{
        border: "1px solid #e2e8f0",
        borderRadius: "12px",
        padding: "16px",
        background: "white",
      }}
    >
      <div style={{ color: "#64748b", fontSize: "13px", marginBottom: "6px" }}>
        {label}
      </div>

      <div style={{ fontWeight: 600 }}>{value || "-"}</div>
    </div>
  );
}
