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
  isCustomer: boolean;
  isSupplier: boolean;
  isActive: boolean;
};

export default function PartiesClient() {
  const [parties, setParties] = useState<Party[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/parties")
      .then((res) => res.json())
      .then((data) => {
        setParties(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main dir="rtl" style={{ padding: "32px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "28px",
        }}
      >
        <div>
          <h1 style={{ fontSize: "30px", margin: 0 }}>
            العملاء والموردون
          </h1>

          <p style={{ color: "#64748b", marginTop: "8px" }}>
            إدارة بيانات العملاء والموردين والحسابات المرتبطة بهم
          </p>
        </div>

        <button
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
              padding: "60px",
              textAlign: "center",
              color: "#64748b",
            }}
          >
            لا يوجد عملاء أو موردون حتى الآن
          </div>
        ) : (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
            }}
          >
            <thead>
              <tr style={{ background: "#f8fafc" }}>
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
                    <strong>{party.nameAr}</strong>

                    {party.nameEn && (
                      <div
                        style={{
                          color: "#64748b",
                          fontSize: "13px",
                          marginTop: "4px",
                        }}
                      >
                        {party.nameEn}
                      </div>
                    )}
                  </td>

                  <td style={td}>
                    {party.unifiedNumber || "—"}
                  </td>

                  <td style={td}>
                    {party.vatNumber || "—"}
                  </td>

                  <td style={td}>
                    {party.telephone || "—"}
                  </td>

                  <td style={td}>
                    {party.isCustomer && party.isSupplier
                      ? "عميل ومورد"
                      : party.isCustomer
                      ? "عميل"
                      : party.isSupplier
                      ? "مورد"
                      : "—"}
                  </td>

                  <td style={td}>
                    {party.isActive ? "نشط" : "غير نشط"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

const th = {
  padding: "16px",
  textAlign: "right" as const,
  fontSize: "14px",
  borderBottom: "1px solid #e2e8f0",
};

const td = {
  padding: "16px",
  borderBottom: "1px solid #e2e8f0",
  fontSize: "14px",
};
