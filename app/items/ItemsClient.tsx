"use client";

import { useEffect, useMemo, useState } from "react";

type Unit = {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string;
};

type Category = {
  id: number;
  nameAr: string;
  nameEn?: string | null;
};

type Item = {
  id: number;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  categoryId?: number | null;
  unitId: number;
  specification?: string | null;
  manufacturer?: string | null;
  countryOfOrigin?: string | null;
  batchNumber?: string | null;
  costPrice: string | number;
  salePrice: string | number;
  vatRate: string | number;
  minimumStock: string | number;
  isActive: boolean;
  unit?: Unit | null;
  category?: Category | null;
};

type FormState = {
  code: string;
  nameAr: string;
  nameEn: string;
  categoryId: string;
  unitId: string;
  specification: string;
  manufacturer: string;
  countryOfOrigin: string;
  batchNumber: string;
  costPrice: string;
  salePrice: string;
  vatRate: string;
  minimumStock: string;
};

const emptyForm: FormState = {
  code: "",
  nameAr: "",
  nameEn: "",
  categoryId: "",
  unitId: "",
  specification: "",
  manufacturer: "",
  countryOfOrigin: "",
  batchNumber: "",
  costPrice: "0",
  salePrice: "0",
  vatRate: "15",
  minimumStock: "0",
};

export default function ItemsClient() {
  const [items, setItems] = useState<Item[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  async function loadData() {
    try {
      const [itemsRes, unitsRes, categoriesRes] = await Promise.all([
        fetch("/api/items", { cache: "no-store" }),
        fetch("/api/units", { cache: "no-store" }),
        fetch("/api/item-categories", { cache: "no-store" }),
      ]);

      const [itemsData, unitsData, categoriesData] = await Promise.all([
        itemsRes.json(),
        unitsRes.json(),
        categoriesRes.json(),
      ]);

      setItems(Array.isArray(itemsData) ? itemsData : []);
      setUnits(Array.isArray(unitsData) ? unitsData : []);
      setCategories(Array.isArray(categoriesData) ? categoriesData : []);
    } catch {
      setMessage("تعذر تحميل بيانات المواد");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch("/api/items", { cache: "no-store" }),
      fetch("/api/units", { cache: "no-store" }),
      fetch("/api/item-categories", { cache: "no-store" }),
    ])
      .then(async ([itemsRes, unitsRes, categoriesRes]) => {
        const [itemsData, unitsData, categoriesData] = await Promise.all([
          itemsRes.json(),
          unitsRes.json(),
          categoriesRes.json(),
        ]);
        if (!cancelled) {
          setItems(Array.isArray(itemsData) ? itemsData : []);
          setUnits(Array.isArray(unitsData) ? unitsData : []);
          setCategories(Array.isArray(categoriesData) ? categoriesData : []);
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("تعذر تحميل بيانات المواد");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();

    if (!q) return items;

    return items.filter((item) =>
      [
        item.code,
        item.nameAr,
        item.nameEn || "",
        item.category?.nameAr || "",
        item.unit?.nameAr || "",
        item.specification || "",
        item.manufacturer || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [items, search]);

  function openNew() {
    setEditingId(null);
    setForm({
      ...emptyForm,
      unitId: units.length ? String(units[0].id) : "",
    });
    setMessage("");
    setFormOpen(true);
  }

  function openEdit(item: Item) {
    setEditingId(item.id);

    setForm({
      code: item.code || "",
      nameAr: item.nameAr || "",
      nameEn: item.nameEn || "",
      categoryId: item.categoryId ? String(item.categoryId) : "",
      unitId: String(item.unitId),
      specification: item.specification || "",
      manufacturer: item.manufacturer || "",
      countryOfOrigin: item.countryOfOrigin || "",
      batchNumber: item.batchNumber || "",
      costPrice: String(item.costPrice ?? 0),
      salePrice: String(item.salePrice ?? 0),
      vatRate: String(item.vatRate ?? 15),
      minimumStock: String(item.minimumStock ?? 0),
    });

    setMessage("");
    setFormOpen(true);
  }

  function setField(name: keyof FormState, value: string) {
    setForm((old) => ({
      ...old,
      [name]: value,
    }));
  }

  async function saveItem() {
    if (!form.code.trim()) {
      setMessage("أدخل كود المادة");
      return;
    }

    if (!form.nameAr.trim()) {
      setMessage("أدخل اسم المادة");
      return;
    }

    if (!form.unitId) {
      setMessage("اختر الوحدة");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const payload = {
        code: form.code,
        nameAr: form.nameAr,
        nameEn: form.nameEn,
        categoryId: form.categoryId || null,
        unitId: Number(form.unitId),
        specification: form.specification,
        manufacturer: form.manufacturer,
        countryOfOrigin: form.countryOfOrigin,
        batchNumber: form.batchNumber,
        costPrice: Number(form.costPrice || 0),
        salePrice: Number(form.salePrice || 0),
        vatRate: Number(form.vatRate || 0),
        minimumStock: Number(form.minimumStock || 0),
      };

      const url = editingId
        ? `/api/items/${editingId}`
        : "/api/items";

      const response = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        setMessage(data.error || "تعذر حفظ المادة");
        return;
      }

      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);

      await loadData();

      setMessage(
        editingId
          ? "تم تعديل المادة بنجاح"
          : "تمت إضافة المادة بنجاح"
      );
    } catch {
      setMessage("حدث خطأ أثناء حفظ المادة");
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(item: Item) {
    const response = await fetch(`/api/items/${item.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        isActive: !item.isActive,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "تعذر تغيير حالة المادة");
      return;
    }

    setItems((old) =>
      old.map((row) =>
        row.id === item.id ? data : row
      )
    );

    setMessage(
      data.isActive
        ? "تم تفعيل المادة"
        : "تم تعطيل المادة"
    );
  }

  async function addCategory() {
    const nameAr = window.prompt("اكتب اسم التصنيف الجديد:");

    if (!nameAr?.trim()) return;

    const response = await fetch("/api/item-categories", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        nameAr: nameAr.trim(),
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      setMessage(data.error || "تعذر إضافة التصنيف");
      return;
    }

    setCategories((old) =>
      [...old, data].sort((a, b) =>
        a.nameAr.localeCompare(b.nameAr, "ar")
      )
    );

    setField("categoryId", String(data.id));
    setMessage("تمت إضافة التصنيف");
  }

  return (
    <main
      dir="rtl"
      style={{
        padding: 32,
        fontFamily: "Arial, sans-serif",
        background: "#f8fafc",
        minHeight: "100vh",
      }}
    >
      <div style={headerRow}>
        <div>
          <h1 style={{ margin: 0 }}>المواد والأصناف</h1>

          <p style={{ color: "#64748b", marginBottom: 0 }}>
            إدارة المواد والمنتجات والأسعار والوحدات والمخزون
          </p>
        </div>

        <button style={primaryButton} onClick={openNew}>
          + إضافة مادة
        </button>
      </div>

      {message && (
        <div style={messageBox}>
          {message}
        </div>
      )}

      <div style={toolbar}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالكود أو الاسم أو التصنيف أو المواصفة..."
          style={searchInput}
        />

        <div style={{ color: "#475569" }}>
          عدد المواد: <strong>{filteredItems.length}</strong>
        </div>
      </div>

      <div style={tableBox}>
        <table style={tableStyle}>
          <thead style={{ background: "#f1f5f9" }}>
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
              <th style={th}>الإجراءات</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={10} style={empty}>
                  جاري تحميل المواد...
                </td>
              </tr>
            ) : filteredItems.length === 0 ? (
              <tr>
                <td colSpan={10} style={empty}>
                  لا توجد مواد مطابقة
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => (
                <tr key={item.id}>
                  <td style={td}>
                    <strong>{item.code}</strong>
                  </td>

                  <td style={td}>
                    <strong>{item.nameAr}</strong>

                    {item.nameEn && (
                      <div style={subText}>
                        {item.nameEn}
                      </div>
                    )}
                  </td>

                  <td style={td}>
                    {item.category?.nameAr || "-"}
                  </td>

                  <td style={td}>
                    {item.unit?.nameAr || "-"}
                  </td>

                  <td style={td}>
                    {item.specification || "-"}
                  </td>

                  <td style={td}>
                    {Number(item.costPrice).toLocaleString()}
                  </td>

                  <td style={td}>
                    {Number(item.salePrice).toLocaleString()}
                  </td>

                  <td style={td}>
                    {String(item.vatRate)}%
                  </td>

                  <td style={td}>
                    <span
                      style={{
                        ...statusBadge,
                        background: item.isActive
                          ? "#dcfce7"
                          : "#fee2e2",
                        color: item.isActive
                          ? "#166534"
                          : "#991b1b",
                      }}
                    >
                      {item.isActive ? "نشط" : "غير نشط"}
                    </span>
                  </td>

                  <td style={td}>
                    <div style={actions}>
                      <button
                        style={editButton}
                        onClick={() => openEdit(item)}
                      >
                        تعديل
                      </button>

                      <button
                        style={
                          item.isActive
                            ? disableButton
                            : enableButton
                        }
                        onClick={() => toggleItem(item)}
                      >
                        {item.isActive
                          ? "تعطيل"
                          : "تفعيل"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {formOpen && (
        <div style={overlay}>
          <div style={modal}>
            <div style={modalHeader}>
              <h2 style={{ margin: 0 }}>
                {editingId
                  ? "تعديل المادة"
                  : "إضافة مادة جديدة"}
              </h2>

              <button
                style={closeButton}
                onClick={() => setFormOpen(false)}
              >
                ×
              </button>
            </div>

            <div style={formGrid}>
              <Field
                label="كود المادة *"
                value={form.code}
                onChange={(v) => setField("code", v)}
              />

              <Field
                label="اسم المادة بالعربي *"
                value={form.nameAr}
                onChange={(v) => setField("nameAr", v)}
              />

              <Field
                label="اسم المادة بالإنجليزي"
                value={form.nameEn}
                onChange={(v) => setField("nameEn", v)}
              />

              <label style={labelStyle}>
                الوحدة *
                <select
                  value={form.unitId}
                  onChange={(e) =>
                    setField("unitId", e.target.value)
                  }
                  style={inputStyle}
                >
                  <option value="">
                    اختر الوحدة
                  </option>

                  {units.map((unit) => (
                    <option
                      key={unit.id}
                      value={unit.id}
                    >
                      {unit.nameAr} - {unit.code}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                التصنيف

                <div style={{ display: "flex", gap: 8 }}>
                  <select
                    value={form.categoryId}
                    onChange={(e) =>
                      setField(
                        "categoryId",
                        e.target.value
                      )
                    }
                    style={{
                      ...inputStyle,
                      flex: 1,
                    }}
                  >
                    <option value="">
                      بدون تصنيف
                    </option>

                    {categories.map((category) => (
                      <option
                        key={category.id}
                        value={category.id}
                      >
                        {category.nameAr}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    style={smallButton}
                    onClick={addCategory}
                  >
                    +
                  </button>
                </div>
              </label>

              <Field
                label="المواصفة"
                value={form.specification}
                onChange={(v) =>
                  setField("specification", v)
                }
              />

              <Field
                label="المصنع / الشركة المصنعة"
                value={form.manufacturer}
                onChange={(v) =>
                  setField("manufacturer", v)
                }
              />

              <Field
                label="بلد المنشأ"
                value={form.countryOfOrigin}
                onChange={(v) =>
                  setField("countryOfOrigin", v)
                }
              />

              <Field
                label="رقم التشغيلة / Batch"
                value={form.batchNumber}
                onChange={(v) =>
                  setField("batchNumber", v)
                }
              />

              <Field
                label="سعر التكلفة"
                type="number"
                value={form.costPrice}
                onChange={(v) =>
                  setField("costPrice", v)
                }
              />

              <Field
                label="سعر البيع"
                type="number"
                value={form.salePrice}
                onChange={(v) =>
                  setField("salePrice", v)
                }
              />

              <Field
                label="نسبة الضريبة %"
                type="number"
                value={form.vatRate}
                onChange={(v) =>
                  setField("vatRate", v)
                }
              />

              <Field
                label="الحد الأدنى للمخزون"
                type="number"
                value={form.minimumStock}
                onChange={(v) =>
                  setField("minimumStock", v)
                }
              />
            </div>

            <div style={modalFooter}>
              <button
                style={secondaryButton}
                onClick={() => setFormOpen(false)}
              >
                إلغاء
              </button>

              <button
                style={primaryButton}
                disabled={saving}
                onClick={saveItem}
              >
                {saving
                  ? "جاري الحفظ..."
                  : editingId
                    ? "حفظ التعديلات"
                    : "إضافة المادة"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}

      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={inputStyle}
      />
    </label>
  );
}

const headerRow = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 20,
  marginBottom: 22,
};

const toolbar = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 15,
  marginBottom: 16,
};

const searchInput = {
  width: "100%",
  maxWidth: 520,
  padding: "12px 14px",
  border: "1px solid #cbd5e1",
  borderRadius: 10,
  fontSize: 15,
};

const tableBox = {
  background: "white",
  border: "1px solid #e2e8f0",
  borderRadius: 14,
  overflow: "auto",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse" as const,
  minWidth: 1200,
};

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

const subText = {
  color: "#64748b",
  fontSize: 12,
  marginTop: 4,
};

const statusBadge = {
  display: "inline-block",
  padding: "5px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
};

const actions = {
  display: "flex",
  gap: 7,
};

const primaryButton = {
  border: 0,
  borderRadius: 10,
  padding: "12px 18px",
  background: "#2563eb",
  color: "white",
  fontWeight: 700,
  cursor: "pointer",
};

const editButton = {
  border: "1px solid #cbd5e1",
  background: "white",
  borderRadius: 8,
  padding: "7px 11px",
  cursor: "pointer",
};

const disableButton = {
  border: 0,
  background: "#fee2e2",
  color: "#991b1b",
  borderRadius: 8,
  padding: "7px 11px",
  cursor: "pointer",
};

const enableButton = {
  border: 0,
  background: "#dcfce7",
  color: "#166534",
  borderRadius: 8,
  padding: "7px 11px",
  cursor: "pointer",
};

const messageBox = {
  padding: 12,
  marginBottom: 16,
  borderRadius: 10,
  background: "#eff6ff",
  color: "#1e40af",
};

const overlay = {
  position: "fixed" as const,
  inset: 0,
  background: "rgba(15,23,42,0.55)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 9999,
  padding: 20,
};

const modal = {
  width: "min(950px, 100%)",
  maxHeight: "92vh",
  overflowY: "auto" as const,
  background: "white",
  borderRadius: 16,
  padding: 24,
};

const modalHeader = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 22,
};

const closeButton = {
  border: 0,
  background: "#f1f5f9",
  borderRadius: 8,
  width: 36,
  height: 36,
  fontSize: 24,
  cursor: "pointer",
};

const formGrid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
  gap: 16,
};

const labelStyle = {
  display: "flex",
  flexDirection: "column" as const,
  gap: 7,
  fontWeight: 700,
  fontSize: 14,
};

const inputStyle = {
  padding: "11px 12px",
  border: "1px solid #cbd5e1",
  borderRadius: 8,
  fontSize: 14,
  background: "white",
};

const smallButton = {
  width: 42,
  border: 0,
  borderRadius: 8,
  background: "#e2e8f0",
  cursor: "pointer",
  fontSize: 22,
};

const modalFooter = {
  marginTop: 24,
  display: "flex",
  justifyContent: "flex-end",
  gap: 10,
};

const secondaryButton = {
  border: "1px solid #cbd5e1",
  background: "white",
  borderRadius: 10,
  padding: "12px 18px",
  cursor: "pointer",
};
