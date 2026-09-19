"use client";

import { useEffect, useState } from "react";

type Party = {
  id: number;
  nameAr: string;
  nameEn?: string | null;
  unifiedNumber?: string | null;
  vatNumber?: string | null;
  telephone?: string | null;
  email?: string | null;
  bankName?: string | null;
  iban?: string | null;
  isCustomer: boolean;
  isSupplier: boolean;
  isActive: boolean;
};
type CustomField = { id: number; fieldKey: string; labelAr: string; fieldType: string; required: boolean; options?: string[]; defaultValue?: string | null };

const emptyForm = {
  nameAr: "",
  nameEn: "",
  unifiedNumber: "",
  vatNumber: "",
  telephone: "",
  email: "",
  bankName: "",
  iban: "",
  isCustomer: true,
  isSupplier: false,
  notes: "",
  address: {
    buildingNumber: "",
    street: "",
    secondaryNumber: "",
    district: "",
    city: "",
    postalCode: "",
    region: "",
    shortAddress: "",
    mapLink: "",
  },
  customFields: {} as Record<string, unknown>,
};

export default function PartiesClient() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState(emptyForm);
  const [customFieldDefinitions, setCustomFieldDefinitions] = useState<CustomField[]>([]);

  async function loadParties() {
    try {
      const res = await fetch("/api/parties");
      const data = await res.json();
      setParties(Array.isArray(data) ? data : []);
    } catch {
      setParties([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetch("/api/parties"), fetch("/api/custom-fields?entityType=PARTY")])
      .then(async ([partyResponse, fieldResponse]) => [await partyResponse.json(), await fieldResponse.json()])
      .then(([result, fieldResult]) => {
        if (!cancelled) { setParties(Array.isArray(result) ? result : []); setCustomFieldDefinitions(Array.isArray(fieldResult) ? fieldResult : []); }
      })
      .catch(() => {
        if (!cancelled) setParties([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(name: string, value: string | boolean) {
    setForm((old) => ({
      ...old,
      [name]: value,
    }));
  }

  function updateAddress(name: string, value: string) {
    setForm((old) => ({
      ...old,
      address: {
        ...old.address,
        [name]: value,
      },
    }));
  }
  function updateCustomField(name: string, value: unknown) { setForm((old) => ({ ...old, customFields: { ...old.customFields, [name]: value } })); }

  async function saveParty(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    if (!form.nameAr.trim()) {
      setMessage("اسم المنشأة بالعربية مطلوب");
      return;
    }

    if (!form.isCustomer && !form.isSupplier) {
      setMessage("يجب اختيار عميل أو مورد أو كليهما");
      return;
    }

    setSaving(true);

    try {
      const res = await fetch("/api/parties", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "تعذر حفظ العميل أو المورد");
        return;
      }

      setForm(emptyForm);
      setShowForm(false);
      setMessage("تم الحفظ بنجاح");
      await loadParties();
    } catch {
      setMessage("حدث خطأ أثناء الحفظ");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main dir="rtl" style={{ padding: "32px", fontFamily: "Arial, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          marginBottom: "28px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "30px", margin: 0 }}>العملاء والموردون</h1>

          <p style={{ color: "#64748b", marginTop: "8px" }}>
            إدارة بيانات العملاء والموردين والحسابات المرتبطة بهم
          </p>
        </div>

        <button
          onClick={() => {
            setMessage("");
            setShowForm(true);
          }}
          style={{
            background: "#2563eb",
            color: "white",
            border: 0,
            borderRadius: "10px",
            padding: "12px 20px",
            fontSize: "15px",
            cursor: "pointer",
          }}
        >
          + إضافة عميل / مورد
        </button>
      </div>

      {message && (
        <div
          style={{
            marginBottom: "20px",
            padding: "12px 16px",
            borderRadius: "10px",
            background: "#f8fafc",
            border: "1px solid #cbd5e1",
          }}
        >
          {message}
        </div>
      )}

      {showForm && (
        <form
          onSubmit={saveParty}
          style={{
            background: "white",
            border: "1px solid #e2e8f0",
            borderRadius: "16px",
            padding: "24px",
            marginBottom: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "24px",
            }}
          >
            <h2 style={{ margin: 0 }}>إضافة عميل / مورد جديد</h2>

            <button
              type="button"
              onClick={() => setShowForm(false)}
              style={{
                border: "1px solid #cbd5e1",
                background: "white",
                borderRadius: "8px",
                padding: "8px 14px",
                cursor: "pointer",
              }}
            >
              إغلاق
            </button>
          </div>

          <h3>البيانات الأساسية</h3>

          <div style={grid}>
            <Field
              label="اسم المنشأة بالعربية *"
              value={form.nameAr}
              onChange={(v) => updateField("nameAr", v)}
            />

            <Field
              label="اسم المنشأة بالإنجليزية"
              value={form.nameEn}
              onChange={(v) => updateField("nameEn", v)}
            />

            <Field
              label="الرقم الموحد"
              value={form.unifiedNumber}
              onChange={(v) => updateField("unifiedNumber", v)}
            />

            <Field
              label="الرقم الضريبي"
              value={form.vatNumber}
              onChange={(v) => updateField("vatNumber", v)}
            />

            <Field
              label="رقم الهاتف"
              value={form.telephone}
              onChange={(v) => updateField("telephone", v)}
            />

            <Field
              label="البريد الإلكتروني"
              value={form.email}
              onChange={(v) => updateField("email", v)}
            />
            <Field label="اسم البنك" value={form.bankName} onChange={(v) => updateField("bankName", v)} />
            <Field label="IBAN المورد" value={form.iban} onChange={(v) => updateField("iban", v)} />
          </div>

          <div style={{ display: "flex", gap: "24px", margin: "24px 0" }}>
            <label>
              <input
                type="checkbox"
                checked={form.isCustomer}
                onChange={(e) => updateField("isCustomer", e.target.checked)}
              />{" "}
              عميل
            </label>

            <label>
              <input
                type="checkbox"
                checked={form.isSupplier}
                onChange={(e) => updateField("isSupplier", e.target.checked)}
              />{" "}
              مورد
            </label>
          </div>

          {customFieldDefinitions.length > 0 && <><h3>حقول الشركة المخصصة</h3><div style={grid}>{customFieldDefinitions.map((field) => field.fieldType === "BOOLEAN" ? <label key={field.id}><input type="checkbox" checked={Boolean(form.customFields[field.fieldKey])} onChange={(e) => updateCustomField(field.fieldKey, e.target.checked)}/> {field.labelAr}{field.required ? " *" : ""}</label> : field.fieldType === "SELECT" ? <label key={field.id}>{field.labelAr}{field.required ? " *" : ""}<select value={String(form.customFields[field.fieldKey] ?? field.defaultValue ?? "")} onChange={(e) => updateCustomField(field.fieldKey, e.target.value)} style={{display:"block",width:"100%",padding:"10px",border:"1px solid #cbd5e1",borderRadius:"8px",marginTop:"6px"}}><option value="">اختر</option>{(field.options??[]).map(option=><option key={option}>{option}</option>)}</select></label> : <Field key={field.id} label={`${field.labelAr}${field.required ? " *" : ""}`} value={String(form.customFields[field.fieldKey] ?? field.defaultValue ?? "")} onChange={(value) => updateCustomField(field.fieldKey, field.fieldType === "NUMBER" ? Number(value) : value)}/>)}</div></>}

          <h3>العنوان الوطني</h3>

          <div style={grid}>
            <Field
              label="رقم المبنى"
              value={form.address.buildingNumber}
              onChange={(v) => updateAddress("buildingNumber", v)}
            />

            <Field
              label="الشارع"
              value={form.address.street}
              onChange={(v) => updateAddress("street", v)}
            />

            <Field
              label="الرقم الفرعي"
              value={form.address.secondaryNumber}
              onChange={(v) => updateAddress("secondaryNumber", v)}
            />

            <Field
              label="الحي"
              value={form.address.district}
              onChange={(v) => updateAddress("district", v)}
            />

            <Field
              label="المدينة"
              value={form.address.city}
              onChange={(v) => updateAddress("city", v)}
            />

            <Field
              label="الرمز البريدي"
              value={form.address.postalCode}
              onChange={(v) => updateAddress("postalCode", v)}
            />

            <Field
              label="المنطقة"
              value={form.address.region}
              onChange={(v) => updateAddress("region", v)}
            />

            <Field
              label="العنوان المختصر"
              value={form.address.shortAddress}
              onChange={(v) => updateAddress("shortAddress", v)}
            />

            <Field
              label="رابط الموقع"
              value={form.address.mapLink}
              onChange={(v) => updateAddress("mapLink", v)}
            />
          </div>

          <div style={{ marginTop: "20px" }}>
            <label style={{ display: "block", marginBottom: "8px" }}>
              ملاحظات
            </label>

            <textarea
              value={form.notes}
              onChange={(e) => updateField("notes", e.target.value)}
              rows={4}
              style={{
                width: "100%",
                padding: "12px",
                border: "1px solid #cbd5e1",
                borderRadius: "8px",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ marginTop: "24px" }}>
            <button
              type="submit"
              disabled={saving}
              style={{
                background: "#2563eb",
                color: "white",
                border: 0,
                borderRadius: "10px",
                padding: "12px 24px",
                fontSize: "15px",
                cursor: saving ? "not-allowed" : "pointer",
                opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? "جاري الحفظ..." : "حفظ"}
            </button>
          </div>
        </form>
      )}

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: "14px",
          overflow: "hidden",
        }}
      >
        {loading ? (
          <div style={{ padding: "30px" }}>جاري تحميل البيانات...</div>
        ) : parties.length === 0 ? (
          <div
            style={{
              padding: "60px 30px",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            لا يوجد عملاء أو موردون حتى الآن
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
              }}
            >
              <thead>
                <tr>
                  <th style={th}>الاسم</th>
                  <th style={th}>الرقم الموحد</th>
                  <th style={th}>الرقم الضريبي</th>
                  <th style={th}>الهاتف</th>
                  <th style={th}>النوع</th>
                  <th style={th}>الحالة</th>
                </tr>
              </thead>

              <tbody>
                {parties.map((party) => (
                  <tr key={party.id}>
                    <td style={td}>
  <a
    href={`/parties/${party.id}`}
    style={{
      color: "#2563eb",
      fontWeight: 600,
      textDecoration: "none",
      cursor: "pointer",
    }}
  >
    {party.nameAr}
  </a>
</td>
                    <td style={td}>{party.unifiedNumber || "-"}</td>
                    <td style={td}>{party.vatNumber || "-"}</td>
                    <td style={td}>{party.telephone || "-"}</td>
                    <td style={td}>
                      {party.isCustomer && party.isSupplier
                        ? "عميل ومورد"
                        : party.isCustomer
                          ? "عميل"
                          : party.isSupplier
                            ? "مورد"
                            : "-"}
                    </td>
                    <td style={td}>{party.isActive ? "نشط" : "غير نشط"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span style={{ display: "block", marginBottom: "8px" }}>{label}</span>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: "100%",
          padding: "11px 12px",
          border: "1px solid #cbd5e1",
          borderRadius: "8px",
          boxSizing: "border-box",
        }}
      />
    </label>
  );
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "18px",
};

const th = {
  padding: "16px",
  textAlign: "right" as const,
  fontSize: "14px",
  borderBottom: "1px solid #e2e8f0",
  background: "#f8fafc",
};

const td = {
  padding: "16px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "14px",
};
