"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

type Unit = { id: number; nameAr: string };
type Category = { id: number; nameAr: string } | null;
type Item = {
  id: number;
  code: string;
  nameAr: string;
  unit?: Unit;
  category?: Category;
};
type Party = {
  id: number;
  nameAr: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
};
type CompanyStockRow = {
  id: number;
  quantity: number;
  averageCost: number;
  stockValue: number;
  item: Item;
};
type PartyStockRow = {
  id: number;
  quantity: number;
  averageValue: number;
  stockValue: number;
  isNegative: boolean;
  item: Item;
  party: Party;
};
type Movement = {
  id: number;
  movementNumber: string;
  movementDate: string;
  ownershipType: string;
  movementType: string;
  quantityIn: number;
  quantityOut: number;
  unitCost: number;
  totalValue: number;
  balanceAfter: number | null;
  referenceType?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  item: Item;
  party?: Party | null;
};
type StatementRow = {
  key: string;
  ownershipType: string;
  partyName: string;
  itemCode: string;
  itemName: string;
  unitName: string;
  openingQuantity: number;
  quantityIn: number;
  quantityOut: number;
  closingQuantity: number;
  movementInValue: number;
  movementOutValue: number;
};
type InventoryData = {
  companyStock: CompanyStockRow[];
  partyStock: PartyStockRow[];
  movements: Movement[];
  statement: StatementRow[];
  summary: {
    companyItems: number;
    companyQuantity: number;
    companyValue: number;
    partyStockAccounts: number;
    partyQuantity: number;
    partyValue: number;
    negativePartyBalances: number;
    movementCount: number;
  };
  filterOptions: { items: Item[]; parties: Party[] };
};
type Filters = {
  from: string;
  to: string;
  itemIds: string[];
  partyIds: string[];
};
type Operation =
  | "COMPANY_IN"
  | "COMPANY_OUT"
  | "PARTY_IN"
  | "PARTY_OUT"
  | "COMPANY_TO_PARTY"
  | "PARTY_TO_COMPANY";

const emptyFilters: Filters = { from: "", to: "", itemIds: [], partyIds: [] };
const emptyMovement = {
  operation: "COMPANY_IN" as Operation,
  itemId: "",
  partyId: "",
  quantity: "",
  unitCost: "0",
  movementDate: new Date().toISOString().slice(0, 10),
  movementType: "RECEIPT",
  referenceType: "",
  referenceNumber: "",
  notes: "",
};

export default function InventoryClient() {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<
    "company" | "customers" | "statement" | "movements"
  >("company");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [showMovement, setShowMovement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movement, setMovement] = useState(emptyMovement);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/inventory", { cache: "no-store" })
      .then(async (response) => {
        const result = (await response.json()) as InventoryData & { error?: string };
        if (!response.ok) throw new Error(result.error || "تعذر تحميل المخزون");
        if (!cancelled) setData(result);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : "تعذر تحميل المخزون");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadInventory(nextFilters: Filters = filters) {
    setLoading(true);
    setMessage("");
    const params = new URLSearchParams();
    if (nextFilters.from) params.set("from", nextFilters.from);
    if (nextFilters.to) params.set("to", nextFilters.to);
    if (nextFilters.itemIds.length)
      params.set("itemIds", nextFilters.itemIds.join(","));
    if (nextFilters.partyIds.length)
      params.set("partyIds", nextFilters.partyIds.join(","));

    try {
      const response = await fetch(`/api/inventory?${params}`, {
        cache: "no-store",
      });
      const result = (await response.json()) as InventoryData & { error?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تحميل المخزون");
      setData(result);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تحميل المخزون");
    } finally {
      setLoading(false);
    }
  }

  function updateMultiSelect(
    key: "itemIds" | "partyIds",
    options: HTMLOptionsCollection
  ) {
    const values = Array.from(options)
      .filter((option) => option.selected)
      .map((option) => option.value);
    setFilters((current) => ({ ...current, [key]: values }));
  }

  async function saveMovement(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    const isTransfer = movement.operation.includes("_TO_");
    const isParty = movement.operation.startsWith("PARTY_");
    const isIn = movement.operation.endsWith("_IN");
    const payload = isTransfer
      ? {
          transferDirection: movement.operation,
          itemId: Number(movement.itemId),
          partyId: Number(movement.partyId),
          quantity: Number(movement.quantity),
          unitCost: Number(movement.unitCost),
          movementDate: movement.movementDate,
          referenceNumber: movement.referenceNumber,
          notes: movement.notes,
        }
      : {
          ownershipType: isParty ? "PARTY" : "COMPANY",
          itemId: Number(movement.itemId),
          partyId: isParty ? Number(movement.partyId) : null,
          quantityIn: isIn ? Number(movement.quantity) : 0,
          quantityOut: isIn ? 0 : Number(movement.quantity),
          unitCost: Number(movement.unitCost),
          movementDate: movement.movementDate,
          movementType: movement.movementType,
          referenceType: movement.referenceType,
          referenceNumber: movement.referenceNumber,
          notes: movement.notes,
        };

    try {
      const response = await fetch("/api/inventory/movements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as { error?: string; warning?: string };
      if (!response.ok) throw new Error(result.error || "تعذر تسجيل الحركة");
      setMovement(emptyMovement);
      setShowMovement(false);
      setMessage(result.warning || "تم تسجيل حركة المخزون بنجاح");
      await loadInventory();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "تعذر تسجيل الحركة");
    } finally {
      setSaving(false);
    }
  }

  const query = search.trim().toLocaleLowerCase("ar");
  const companyRows = useMemo(
    () =>
      (data?.companyStock ?? []).filter((row) =>
        `${row.item.code} ${row.item.nameAr} ${row.item.category?.nameAr ?? ""}`
          .toLocaleLowerCase("ar")
          .includes(query)
      ),
    [data, query]
  );
  const partyRows = useMemo(
    () =>
      (data?.partyStock ?? []).filter((row) =>
        `${row.party.nameAr} ${row.item.code} ${row.item.nameAr}`
          .toLocaleLowerCase("ar")
          .includes(query)
      ),
    [data, query]
  );
  const movementRows = useMemo(
    () =>
      (data?.movements ?? []).filter((row) =>
        `${row.movementNumber} ${row.party?.nameAr ?? ""} ${row.item.code} ${
          row.item.nameAr
        } ${row.referenceNumber ?? ""}`
          .toLocaleLowerCase("ar")
          .includes(query)
      ),
    [data, query]
  );

  const summary = data?.summary;
  const needsParty =
    movement.operation.startsWith("PARTY_") || movement.operation.includes("_TO_");

  return (
    <main dir="rtl" className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">المخزون</h1>
          <p className="mt-2 text-slate-500">
            مخزون الشركة وملكيات العملاء منفصلة محاسبيًا داخل موقع التشغيل نفسه
          </p>
        </div>
        <div className="flex gap-2">
          <button className={secondaryButton} onClick={() => loadInventory()}>
            تحديث
          </button>
          <button className={primaryButton} onClick={() => setShowMovement(true)}>
            + حركة مخزون
          </button>
        </div>
      </div>

      {message && <div className="mt-5 rounded-xl border bg-white p-4">{message}</div>}

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard title="أصناف الشركة" value={summary?.companyItems ?? 0} />
        <SummaryCard title="كمية الشركة" value={number(summary?.companyQuantity)} />
        <SummaryCard title="قيمة الشركة" value={`${money(summary?.companyValue)} ر.س`} />
        <SummaryCard title="حسابات العملاء" value={summary?.partyStockAccounts ?? 0} />
        <SummaryCard title="قيمة مخزون العملاء" value={`${money(summary?.partyValue)} ر.س`} />
        <SummaryCard
          title="أرصدة سالبة"
          value={summary?.negativePartyBalances ?? 0}
          danger={(summary?.negativePartyBalances ?? 0) > 0}
        />
      </section>

      {(summary?.negativePartyBalances ?? 0) > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 font-bold text-red-700">
          يوجد مخزون عملاء برصيد سالب. السحب مسموح وفق سياسة النظام ويحتاج متابعة.
        </div>
      )}

      <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="font-bold">البحث والفترة والفلاتر</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="بحث">
            <input
              className={inputClass}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="مادة، عميل، حركة أو مرجع"
            />
          </Field>
          <Field label="من">
            <input
              type="date"
              className={inputClass}
              value={filters.from}
              onChange={(event) =>
                setFilters((current) => ({ ...current, from: event.target.value }))
              }
            />
          </Field>
          <Field label="إلى">
            <input
              type="date"
              className={inputClass}
              value={filters.to}
              onChange={(event) =>
                setFilters((current) => ({ ...current, to: event.target.value }))
              }
            />
          </Field>
          <Field label="المواد (يمكن اختيار عدة)">
            <select
              multiple
              className={`${inputClass} min-h-24`}
              value={filters.itemIds}
              onChange={(event) => updateMultiSelect("itemIds", event.target.options)}
            >
              {data?.filterOptions.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} — {item.nameAr}
                </option>
              ))}
            </select>
          </Field>
          <Field label="العملاء/الموردون (يمكن اختيار عدة)">
            <select
              multiple
              className={`${inputClass} min-h-24`}
              value={filters.partyIds}
              onChange={(event) => updateMultiSelect("partyIds", event.target.options)}
            >
              {data?.filterOptions.parties.map((party) => (
                <option key={party.id} value={party.id}>
                  {party.nameAr}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex gap-2">
          <button className={primaryButton} onClick={() => loadInventory(filters)}>
            تطبيق الفلاتر
          </button>
          <button
            className={secondaryButton}
            onClick={() => {
              setFilters(emptyFilters);
              loadInventory(emptyFilters);
            }}
          >
            مسح الفلاتر
          </button>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Tab active={tab === "company"} onClick={() => setTab("company")}>مخزون الشركة</Tab>
        <Tab active={tab === "customers"} onClick={() => setTab("customers")}>مخزون العملاء</Tab>
        <Tab active={tab === "statement"} onClick={() => setTab("statement")}>كشف الفترة</Tab>
        <Tab active={tab === "movements"} onClick={() => setTab("movements")}>سجل الحركات</Tab>
      </div>

      <section className="mt-3 overflow-hidden rounded-2xl border bg-white shadow-sm">
        {loading ? (
          <Empty text="جاري تحميل بيانات المخزون..." />
        ) : tab === "company" ? (
          <DataTable headers={["الكود", "المادة", "التصنيف", "الوحدة", "الكمية", "متوسط التكلفة", "القيمة"]}>
            {companyRows.map((row) => (
              <tr key={row.id}>
                <Cell>{row.item.code}</Cell><Cell strong>{row.item.nameAr}</Cell>
                <Cell>{row.item.category?.nameAr ?? "-"}</Cell><Cell>{row.item.unit?.nameAr ?? "-"}</Cell>
                <Cell>{number(row.quantity)}</Cell><Cell>{money(row.averageCost)}</Cell><Cell>{money(row.stockValue)}</Cell>
              </tr>
            ))}
            {!companyRows.length && <EmptyRow columns={7} />}
          </DataTable>
        ) : tab === "customers" ? (
          <DataTable headers={["العميل/المورد", "الكود", "المادة", "الوحدة", "الكمية", "متوسط القيمة", "القيمة", "الحالة"]}>
            {partyRows.map((row) => (
              <tr key={row.id} className={row.isNegative ? "bg-red-50" : ""}>
                <Cell strong>{row.party.nameAr}</Cell><Cell>{row.item.code}</Cell><Cell>{row.item.nameAr}</Cell>
                <Cell>{row.item.unit?.nameAr ?? "-"}</Cell><Cell danger={row.isNegative}>{number(row.quantity)}</Cell>
                <Cell>{money(row.averageValue)}</Cell><Cell danger={row.stockValue < 0}>{money(row.stockValue)}</Cell>
                <Cell>{row.isNegative ? <Badge danger>رصيد سالب</Badge> : <Badge>طبيعي</Badge>}</Cell>
              </tr>
            ))}
            {!partyRows.length && <EmptyRow columns={8} />}
          </DataTable>
        ) : tab === "statement" ? (
          <DataTable headers={["الملكية", "المادة", "الوحدة", "أول المدة", "الوارد", "الصادر", "آخر المدة", "قيمة الوارد", "قيمة الصادر"]}>
            {data?.statement.map((row) => (
              <tr key={row.key} className={row.closingQuantity < 0 ? "bg-red-50" : ""}>
                <Cell strong>{row.partyName}</Cell><Cell>{row.itemCode} — {row.itemName}</Cell><Cell>{row.unitName}</Cell>
                <Cell>{number(row.openingQuantity)}</Cell><Cell>{number(row.quantityIn)}</Cell><Cell>{number(row.quantityOut)}</Cell>
                <Cell danger={row.closingQuantity < 0}>{number(row.closingQuantity)}</Cell>
                <Cell>{money(row.movementInValue)}</Cell><Cell>{money(row.movementOutValue)}</Cell>
              </tr>
            ))}
            {!data?.statement.length && <EmptyRow columns={9} />}
          </DataTable>
        ) : (
          <DataTable headers={["رقم الحركة", "التاريخ", "الملكية", "المادة", "النوع", "وارد", "صادر", "تكلفة الوحدة", "القيمة", "الرصيد", "المرجع", "ملاحظات"]}>
            {movementRows.map((row) => (
              <tr key={row.id} className={Number(row.balanceAfter) < 0 ? "bg-red-50" : ""}>
                <Cell>{row.movementNumber}</Cell><Cell>{date(row.movementDate)}</Cell>
                <Cell>{row.ownershipType === "COMPANY" ? "الشركة" : row.party?.nameAr ?? "-"}</Cell>
                <Cell>{row.item.code} — {row.item.nameAr}</Cell><Cell>{row.movementType}</Cell>
                <Cell>{number(row.quantityIn)}</Cell><Cell>{number(row.quantityOut)}</Cell><Cell>{money(row.unitCost)}</Cell>
                <Cell>{money(row.totalValue)}</Cell><Cell danger={Number(row.balanceAfter) < 0}>{number(row.balanceAfter)}</Cell>
                <Cell>{row.referenceNumber ?? "-"}</Cell><Cell>{row.notes ?? "-"}</Cell>
              </tr>
            ))}
            {!movementRows.length && <EmptyRow columns={12} />}
          </DataTable>
        )}
      </section>

      {showMovement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={saveMovement} className="max-h-[95vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">تسجيل حركة مخزون</h2>
              <button type="button" className={secondaryButton} onClick={() => setShowMovement(false)}>إغلاق</button>
            </div>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="العملية">
                <select className={inputClass} value={movement.operation} onChange={(event) => setMovement((current) => ({ ...current, operation: event.target.value as Operation }))}>
                  <option value="COMPANY_IN">وارد إلى مخزون الشركة</option>
                  <option value="COMPANY_OUT">صادر من مخزون الشركة</option>
                  <option value="PARTY_IN">وارد إلى مخزون عميل</option>
                  <option value="PARTY_OUT">صادر من مخزون عميل</option>
                  <option value="COMPANY_TO_PARTY">تحويل ملكية من الشركة إلى العميل</option>
                  <option value="PARTY_TO_COMPANY">تحويل ملكية من العميل إلى الشركة</option>
                </select>
              </Field>
              <Field label="المادة">
                <select required className={inputClass} value={movement.itemId} onChange={(event) => setMovement((current) => ({ ...current, itemId: event.target.value }))}>
                  <option value="">اختر المادة</option>
                  {data?.filterOptions.items.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.nameAr}</option>)}
                </select>
              </Field>
              {needsParty && <Field label="العميل/المورد"><select required className={inputClass} value={movement.partyId} onChange={(event) => setMovement((current) => ({ ...current, partyId: event.target.value }))}><option value="">اختر الكيان</option>{data?.filterOptions.parties.map((party) => <option key={party.id} value={party.id}>{party.nameAr}</option>)}</select></Field>}
              <Field label="الكمية"><input required min="0.000001" step="any" type="number" className={inputClass} value={movement.quantity} onChange={(event) => setMovement((current) => ({ ...current, quantity: event.target.value }))} /></Field>
              <Field label="تكلفة/قيمة الوحدة"><input min="0" step="any" type="number" className={inputClass} value={movement.unitCost} onChange={(event) => setMovement((current) => ({ ...current, unitCost: event.target.value }))} /></Field>
              <Field label="تاريخ الحركة"><input required type="date" className={inputClass} value={movement.movementDate} onChange={(event) => setMovement((current) => ({ ...current, movementDate: event.target.value }))} /></Field>
              {!movement.operation.includes("_TO_") && <Field label="نوع الحركة"><select className={inputClass} value={movement.movementType} onChange={(event) => setMovement((current) => ({ ...current, movementType: event.target.value }))}><option value="OPENING">رصيد افتتاحي</option><option value="RECEIPT">استلام</option><option value="DELIVERY">تسليم</option><option value="PURCHASE">شراء</option><option value="SALE">بيع</option><option value="ADJUSTMENT">تسوية</option><option value="PROCESSING_IN">دخول تصنيع</option><option value="PROCESSING_OUT">خروج تصنيع</option></select></Field>}
              <Field label="نوع المرجع"><input className={inputClass} value={movement.referenceType} onChange={(event) => setMovement((current) => ({ ...current, referenceType: event.target.value }))} /></Field>
              <Field label="رقم المرجع"><input className={inputClass} value={movement.referenceNumber} onChange={(event) => setMovement((current) => ({ ...current, referenceNumber: event.target.value }))} /></Field>
              <Field label="ملاحظات"><textarea className={inputClass} rows={3} value={movement.notes} onChange={(event) => setMovement((current) => ({ ...current, notes: event.target.value }))} /></Field>
            </div>
            <div className="mt-6 flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={() => setShowMovement(false)}>إلغاء</button><button disabled={saving} className={primaryButton}>{saving ? "جاري الحفظ..." : "حفظ الحركة"}</button></div>
          </form>
        </div>
      )}
    </main>
  );
}

function SummaryCard({ title, value, danger = false }: { title: string; value: ReactNode; danger?: boolean }) {
  return <div className={`rounded-2xl border p-5 shadow-sm ${danger ? "border-red-200 bg-red-50" : "bg-white"}`}><div className="text-sm text-slate-500">{title}</div><div className={`mt-2 text-2xl font-bold ${danger ? "text-red-700" : ""}`}>{value}</div></div>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="flex flex-col gap-2 text-sm font-semibold text-slate-700"><span>{label}</span>{children}</label>; }
function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) { return <button onClick={onClick} className={`rounded-xl border px-4 py-2 font-semibold ${active ? "border-blue-600 bg-blue-600 text-white" : "bg-white"}`}>{children}</button>; }
function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) { return <div className="overflow-x-auto"><table className="w-full min-w-[1000px] border-collapse text-sm"><thead className="bg-slate-50"><tr>{headers.map((header) => <th key={header} className="whitespace-nowrap border-b p-4 text-right">{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>; }
function Cell({ children, strong = false, danger = false }: { children: ReactNode; strong?: boolean; danger?: boolean }) { return <td className={`whitespace-nowrap border-b p-4 ${strong ? "font-bold" : ""} ${danger ? "font-bold text-red-700" : ""}`}>{children}</td>; }
function EmptyRow({ columns }: { columns: number }) { return <tr><td colSpan={columns} className="p-12 text-center text-slate-500">لا توجد بيانات مطابقة.</td></tr>; }
function Empty({ text }: { text: string }) { return <div className="p-12 text-center text-slate-500">{text}</div>; }
function Badge({ children, danger = false }: { children: ReactNode; danger?: boolean }) { return <span className={`rounded-full px-3 py-1 text-xs font-bold ${danger ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{children}</span>; }
function number(value: number | null | undefined) { return Number(value ?? 0).toLocaleString("ar-SA", { maximumFractionDigits: 3 }); }
function money(value: number | null | undefined) { return Number(value ?? 0).toLocaleString("ar-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function date(value: string) { return new Date(value).toLocaleDateString("ar-SA"); }

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900";
const primaryButton = "rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50";
const secondaryButton = "rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700";
