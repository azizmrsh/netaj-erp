"use client";

import { useEffect, useState } from "react";

type Item = {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  specification?: string | null;
  manufacturer?: string | null;
  countryOfOrigin?: string | null;
  batchNumber?: string | null;
  costPrice: string | number;
  salePrice: string | number;
  vatRate: string | number;
  minimumStock: string | number;
  isActive: boolean;
  unit?: {
    id: number;
    code: string;
    nameAr: string;
    nameEn: string;
  } | null;
  category?: {
    id: number;
    nameAr: string;
    nameEn?: string | null;
  } | null;
};

export default function ItemsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/items")
      .then((res) => res.json())
      .then((data) => {
        setItems(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <main dir="rtl" style={{ padding: 32, fontFamily: "Arial, sans-serif" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>المواد والأصناف</h1>
          <p style={{ color: "#64748b" }}>
            إدارة المواد والمنتجات والأسعار والوحدات والمخزون
          </p>
        </div>

        <button
          style={{
            border: 0,
            borderRadius: 10,
            padding: "12px 18px",
            background: "#2563eb",
            color: "white",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          + إضافة مادة
        </button>
      </div>

      <div
        style={{
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          overflow: "auto",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            minWidth: 1000,
          }}
        >
          <thead style={{ background: "#f8fafc" }}>
            <tr>
              <th style={th}>الكود</th>
              <th style={th}>اسم المادة</th>
              <th style={th}>التصنيف</th>
              <th style={th}>الوحدة</th>
              <th style={th}>المواصفة</th>
              <th style={th}>سعر التكلفة</th>
              <th style={th}>سعر البيع</th>
              <th style={th}>الضريبة</th>
              <th style={th}>الحالة</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={9} style={empty}>
                  جاري تحميل المواد...
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={9} style={empty}>
                  لا توجد مواد مسجلة حتى الآن
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td style={td}>{item.code}</td>
                  <td style={td}>
                    <strong>{item.nameAr}</strong>
                    {item.nameEn && (
                      <div style={{ color: "#64748b", marginTop: 4 }}>
                        {item.nameEn}
                      </div>
                    )}
                  </td>
                  <td style={td}>{item.category?.nameAr || "-"}</td>
                  <td style={td}>{item.unit?.nameAr || "-"}</td>
                  <td style={td}>{item.specification || "-"}</td>
                  <td style={td}>{String(item.costPrice)}</td>
                  <td style={td}>{String(item.salePrice)}</td>
                  <td style={td}>{String(item.vatRate)}%</td>
                  <td style={td}>
                    {item.isActive ? "نشط" : "غير نشط"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}

const th = {
  padding: "14px",
  textAlign: "right" as const,
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: "14px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap" as const,
};

const empty = {
  padding: "50px",
  textAlign: "center" as const,
  color: "#64748b",
};
