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
type InventoryCount = { id:number;countNumber:string;countDate:string;frequency:string;ownershipType:string;partyId?:number|null;status:string;lines:Array<{id:number;systemQuantity:number;countedQuantity:number;variance:number;item:Item}> };

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
    "company" | "customers" | "statement" | "movements" | "counts"
  >("company");
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [search, setSearch] = useState("");
  const [showMovement, setShowMovement] = useState(false);
  const [saving, setSaving] = useState(false);
  const [movement, setMovement] = useState(emptyMovement);
  const [counts, setCounts] = useState<InventoryCount[]>([]);
  const [showCount, setShowCount] = useState(false);
  const [showValuation, setShowValuation] = useState(false);
  const [countForm, setCountForm] = useState({ ownershipType:"COMPANY",partyId:"",itemId:"",countedQuantity:"",frequency:"DAILY",countDate:new Date().toISOString().slice(0,10),notes:"" });
  const [valuationForm, setValuationForm] = useState({partyId:"",itemId:"",unitValue:"",effectiveAt:new Date().toISOString().slice(0,10),notes:""});

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

  useEffect(() => { void loadCounts(); }, []);

  async function loadCounts() {
    const response = await fetch("/api/inventory/controls?view=counts", { cache:"no-store" });
    if (response.ok) setCounts(await response.json() as InventoryCount[]);
  }

  async function saveControl(payload:Record<string,unknown>, success:string) {
    setSaving(true); setMessage("");
    try { const response=await fetch("/api/inventory/controls",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});const result=await response.json() as {error?:string};if(!response.ok)throw new Error(result.error||"تعذر حفظ العملية");setMessage(success);setShowCount(false);setShowValuation(false);await Promise.all([loadInventory(),loadCounts()]); }
    catch(error){setMessage(error instanceof Error?error.message:"تعذر حفظ العملية");}finally{setSaving(false);}
  }

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
  const exportQuery = useMemo(() => {
    const params = new URLSearchParams({ view: tab === "counts" ? "movements" : tab });
    if (filters.from) params.set("from", filters.from);
    if (filters.to) params.set("to", filters.to);
    if (filters.itemIds.length) params.set("itemIds", filters.itemIds.join(","));
    if (filters.partyIds.length) params.set("partyIds", filters.partyIds.join(","));
    return params;
  }, [filters, tab]);

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-900 md:p-8">
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
          <button className={primaryButton} onClick={() => setShowCount(true)}>+ محضر جرد</button>
          <button className={secondaryButton} onClick={() => setShowValuation(true)}>قيمة مخزون عميل</button>
          <button className={secondaryButton} onClick={() => window.print()}>طباعة</button>
          <button className={secondaryButton} onClick={() => window.open(`/api/inventory/export?${exportQuery}&format=xlsx`, "_blank")}>Excel</button>
          <button className={secondaryButton} onClick={() => window.open(`/api/inventory/export?${exportQuery}&format=pdf`, "_blank")}>PDF</button>
          <button className={secondaryButton} onClick={() => window.open(`/api/inventory/export?${exportQuery}&format=csv`, "_blank")}>CSV</button>
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
          <button className={secondaryButton} onClick={() => { const today = new Date(), from = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10), to = today.toISOString().slice(0, 10), next = { ...filters, from, to }; setFilters(next); void loadInventory(next); }}>هذا الشهر</button>
          <button className={secondaryButton} onClick={() => { const today = new Date(), from = new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10), to = today.toISOString().slice(0, 10), next = { ...filters, from, to }; setFilters(next); void loadInventory(next); }}>من بداية السنة</button>
        </div>
        {(filters.itemIds.length > 0 || filters.partyIds.length > 0 || filters.from || filters.to) && <div className="mt-3 flex flex-wrap gap-2 text-xs">{filters.from && <span className="rounded-full bg-amber-100 px-3 py-1">من {filters.from}</span>}{filters.to && <span className="rounded-full bg-amber-100 px-3 py-1">إلى {filters.to}</span>}{filters.itemIds.map(id => <span key={`i-${id}`} className="rounded-full bg-blue-100 px-3 py-1">{data?.filterOptions.items.find(item => String(item.id) === id)?.nameAr ?? id}</span>)}{filters.partyIds.map(id => <span key={`p-${id}`} className="rounded-full bg-emerald-100 px-3 py-1">{data?.filterOptions.parties.find(party => String(party.id) === id)?.nameAr ?? id}</span>)}</div>}
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Tab active={tab === "company"} onClick={() => setTab("company")}>مخزون الشركة</Tab>
        <Tab active={tab === "customers"} onClick={() => setTab("customers")}>مخزون العملاء</Tab>
        <Tab active={tab === "statement"} onClick={() => setTab("statement")}>كشف الفترة</Tab>
        <Tab active={tab === "movements"} onClick={() => setTab("movements")}>سجل الحركات</Tab>
        <Tab active={tab === "counts"} onClick={() => setTab("counts")}>الجرد والتسويات</Tab>
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
        ) : tab === "movements" ? (
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
        ) : (
          <DataTable headers={["رقم الجرد","التاريخ","الدورية","الملكية","المادة","رصيد النظام","الفعلي","الفرق","الحالة",""]}>
            {counts.flatMap((count)=>count.lines.map((line,index)=><tr key={`${count.id}-${line.id}`} className={Number(line.variance)!==0?"bg-amber-50":""}><Cell>{index===0?count.countNumber:""}</Cell><Cell>{index===0?date(count.countDate):""}</Cell><Cell>{count.frequency}</Cell><Cell>{count.ownershipType==="COMPANY"?"الشركة":"عميل"}</Cell><Cell>{line.item.code} — {line.item.nameAr}</Cell><Cell>{number(line.systemQuantity)}</Cell><Cell>{number(line.countedQuantity)}</Cell><Cell danger={Number(line.variance)<0}>{number(line.variance)}</Cell><Cell>{count.status}</Cell><Cell>{index===0&&count.status==="DRAFT"?<button className={primaryButton} onClick={()=>void saveControl({action:"APPROVE_COUNT",id:count.id},"تم اعتماد الجرد وتسجيل التسويات")}>اعتماد التسوية</button>:"-"}</Cell></tr>))}
            {!counts.length&&<EmptyRow columns={10}/>}
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
      {showCount&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event)=>{event.preventDefault();void saveControl({action:"CREATE_COUNT",countDate:countForm.countDate,frequency:countForm.frequency,ownershipType:countForm.ownershipType,partyId:countForm.ownershipType==="PARTY"?Number(countForm.partyId):null,notes:countForm.notes,lines:[{itemId:Number(countForm.itemId),countedQuantity:Number(countForm.countedQuantity)}]},"تم إنشاء محضر الجرد للمراجعة والاعتماد");}} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">محضر جرد جديد</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="الملكية"><select className={inputClass} value={countForm.ownershipType} onChange={e=>setCountForm({...countForm,ownershipType:e.target.value})}><option value="COMPANY">مخزون الشركة</option><option value="PARTY">مخزون عميل</option></select></Field>{countForm.ownershipType==="PARTY"&&<Field label="العميل"><select required className={inputClass} value={countForm.partyId} onChange={e=>setCountForm({...countForm,partyId:e.target.value})}><option value="">اختر</option>{data?.filterOptions.parties.map(row=><option key={row.id} value={row.id}>{row.nameAr}</option>)}</select></Field>}<Field label="المادة"><select required className={inputClass} value={countForm.itemId} onChange={e=>setCountForm({...countForm,itemId:e.target.value})}><option value="">اختر</option>{data?.filterOptions.items.map(row=><option key={row.id} value={row.id}>{row.code} — {row.nameAr}</option>)}</select></Field><Field label="الكمية الفعلية"><input required type="number" step="any" className={inputClass} value={countForm.countedQuantity} onChange={e=>setCountForm({...countForm,countedQuantity:e.target.value})}/></Field><Field label="الدورية"><select className={inputClass} value={countForm.frequency} onChange={e=>setCountForm({...countForm,frequency:e.target.value})}><option value="DAILY">يومي</option><option value="WEEKLY">أسبوعي</option><option value="MONTHLY">شهري</option><option value="AD_HOC">مفاجئ</option></select></Field><Field label="التاريخ"><input required type="date" className={inputClass} value={countForm.countDate} onChange={e=>setCountForm({...countForm,countDate:e.target.value})}/></Field></div><div className="mt-6 flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={()=>setShowCount(false)}>إلغاء</button><button disabled={saving} className={primaryButton}>حفظ للمراجعة</button></div></form></div>}
      {showValuation&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4"><form onSubmit={(event)=>{event.preventDefault();void saveControl({action:"SET_VALUATION",partyId:Number(valuationForm.partyId),itemId:Number(valuationForm.itemId),unitValue:Number(valuationForm.unitValue),effectiveAt:valuationForm.effectiveAt,notes:valuationForm.notes},"تم حفظ القيمة التقديرية بتاريخ السريان دون تغيير الحركات القديمة");}} className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-xl"><h2 className="text-xl font-bold">قيمة تقديرية لمخزون عميل</h2><p className="mt-2 text-sm text-slate-500">تطبق من تاريخ السريان ولا تعيد تقييم الحركات التاريخية.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="العميل"><select required className={inputClass} value={valuationForm.partyId} onChange={e=>setValuationForm({...valuationForm,partyId:e.target.value})}><option value="">اختر</option>{data?.filterOptions.parties.map(row=><option key={row.id} value={row.id}>{row.nameAr}</option>)}</select></Field><Field label="المادة"><select required className={inputClass} value={valuationForm.itemId} onChange={e=>setValuationForm({...valuationForm,itemId:e.target.value})}><option value="">اختر</option>{data?.filterOptions.items.map(row=><option key={row.id} value={row.id}>{row.code} — {row.nameAr}</option>)}</select></Field><Field label="قيمة الوحدة"><input required min="0" type="number" step="any" className={inputClass} value={valuationForm.unitValue} onChange={e=>setValuationForm({...valuationForm,unitValue:e.target.value})}/></Field><Field label="تاريخ السريان"><input required type="date" className={inputClass} value={valuationForm.effectiveAt} onChange={e=>setValuationForm({...valuationForm,effectiveAt:e.target.value})}/></Field></div><div className="mt-6 flex justify-end gap-2"><button type="button" className={secondaryButton} onClick={()=>setShowValuation(false)}>إلغاء</button><button disabled={saving} className={primaryButton}>حفظ القيمة</button></div></form></div>}
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
function number(value: number | null | undefined) { return Number(value ?? 0).toLocaleString("en-US", { maximumFractionDigits: 3 }); }
function money(value: number | null | undefined) { return Number(value ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function date(value: string) { return new Date(value).toLocaleDateString("en-US"); }

const inputClass = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-normal text-slate-900";
const primaryButton = "rounded-xl bg-blue-600 px-4 py-2 font-bold text-white disabled:opacity-50";
const secondaryButton = "rounded-xl border border-slate-300 bg-white px-4 py-2 font-semibold text-slate-700";
