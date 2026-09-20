"use client";

import { useEffect, useState, type ReactNode } from "react";

const tabs = [
  "نظرة عامة",
  "المبيعات",
  "المشتريات",
  "المخزون",
  "المصنع",
  "النقل",
  "الحساب",
  "السندات والإشعارات",
  "المرفقات",
];

type Props = {
  partyId: number;
};

type ItemRef = { id: number; nameAr: string; code?: string };
type StockAccount = {
  itemId: number;
  quantity: string | number;
  averageValue: string | number;
  item: ItemRef;
};
type StockMovement = {
  id: number;
  movementNumber: string;
  movementDate: string;
  movementType: string;
  itemId: number;
  quantityIn: string | number;
  quantityOut: string | number;
  balanceAfter: string | number | null;
  item: ItemRef;
};
type NoteDocument = {
  id: number;
  noteNumber: string;
  noteDate: string;
  noteType: string;
  status: string;
  items: Array<{ id: number }>;
};
type TransportTrip = {
  id: number;
  tripNumber: string;
  tripDate: string;
  quantity: string | number;
  transportRevenue: string | number;
  totalCost: string | number;
  netProfit: string | number;
  status: string;
};
type InvoiceItem = {
  id: number;
  quantity: string | number;
  unitPrice: string | number;
  totalAmount: string | number;
  item: ItemRef;
};
type Sale = {
  id: number;
  invoiceNumber: string;
  invoiceDate: string;
  status: string;
  totalAmount: string | number;
  items: InvoiceItem[];
};
type Purchase = {
  id: number;
  purchaseNumber: string;
  purchaseDate: string;
  status: string;
  totalAmount: string | number;
  items: InvoiceItem[];
};
type JournalEntry = { id:number;entryNumber:string;entryDate:string;description?:string|null;status:string;totalDebit:string|number;totalCredit:string|number };
type Attachment = { id:number;originalName:string;mimeType:string;size:number;uploadedAt:string;uploadedBy?:string|null };
type BusinessDocument = { id:number;documentNumber:string;documentType:string;documentDate:string;status:string;totalAmount:string|number };
type FactoryTransaction = { id:number;transactionNumber:string;transactionDate:string;quantity:string|number;manufacturingFeePerTon:string|number;manufacturingFeeTotal:string|number;totalAmount:string|number;status:string;item:ItemRef };
type FactoryFeeRate = { id:number;feePerTon:string|number;item:ItemRef };
type FinancialExposure = { receivable:string|number;inventoryValue:string|number;exposureRatio:string|number;shortage:string|number;status:string;thresholds:{warning:number;critical:number};lines:Array<{itemId:number;unitValue:string|number;value:string|number;effectiveAt?:string|null}> };
type PartyData = {
  stockAccounts?: StockAccount[];
  stockMovements?: StockMovement[];
  notesDocuments?: NoteDocument[];
  transportTrips?: TransportTrip[];
  sales?: Sale[];
  purchases?: Purchase[];
  businessDocuments?: BusinessDocument[];
  journalEntries?: JournalEntry[];
  attachments?: Attachment[];
  factoryTransactions?: FactoryTransaction[];
  factoryFeeRates?: FactoryFeeRate[];
  financialExposure?: FinancialExposure | null;
};

export default function PartyTabs({ partyId }: Props) {
  const [activeTab, setActiveTab] = useState("نظرة عامة");
  const [data, setData] = useState<PartyData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/parties/${partyId}`)
      .then((res) => res.json())
      .then((result) => {
        setData(result);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [partyId]);

  const stock = data?.stockAccounts ?? [];
  const movements = data?.stockMovements ?? [];
  const notes = data?.notesDocuments ?? [];
  const trips = data?.transportTrips ?? [];
  const sales = data?.sales ?? [];
  const purchases = data?.purchases ?? [];
  const businessDocuments = data?.businessDocuments ?? [];
  const journals = data?.journalEntries ?? [];
  const attachments = data?.attachments ?? [];
  const factoryTransactions = data?.factoryTransactions ?? [];
  const factoryFeeRates = data?.factoryFeeRates ?? [];
  const exposure = data?.financialExposure;

  async function uploadPartyAttachment(file: File) {
    const form = new FormData();
    form.set("entityType", "PARTY");
    form.set("entityId", String(partyId));
    form.set("file", file);
    const response = await fetch("/api/attachments", { method: "POST", body: form });
    if (response.ok) {
      const refreshed = await fetch(`/api/parties/${partyId}`).then((res) => res.json());
      setData(refreshed);
    }
  }

  const stockStatement = stock.map((account) => {
    const itemMovements = movements.filter(
      (movement) => movement.itemId === account.itemId
    );
    return {
      ...account,
      quantityIn: itemMovements.reduce(
        (sum, movement) => sum + Number(movement.quantityIn),
        0
      ),
      quantityOut: itemMovements.reduce(
        (sum, movement) => sum + Number(movement.quantityOut),
        0
      ),
    };
  });

  const stockQuantity = stock.reduce(
    (sum, row) => sum + Number(row.quantity ?? 0),
    0
  );

  const stockValue = stock.reduce(
    (sum, row) =>
      sum +
      Number(row.quantity ?? 0) * Number(row.averageValue ?? 0),
    0
  );

  const transportRevenue = trips.reduce(
    (sum, row) => sum + Number(row.transportRevenue ?? 0),
    0
  );

  const transportCost = trips.reduce(
    (sum, row) => sum + Number(row.totalCost ?? 0),
    0
  );

  const transportProfit = trips.reduce(
    (sum, row) => sum + Number(row.netProfit ?? 0),
    0
  );

  return (
    <div style={{ marginTop: "32px" }}>
      <div
        style={{
          display: "flex",
          gap: "8px",
          flexWrap: "wrap",
          borderBottom: "1px solid #e2e8f0",
          paddingBottom: "12px",
        }}
      >
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              border: "none",
              borderRadius: "8px",
              padding: "10px 16px",
              cursor: "pointer",
              fontWeight: 600,
              background: activeTab === tab ? "#2563eb" : "#f1f5f9",
              color: activeTab === tab ? "white" : "#334155",
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      <div
        style={{
          marginTop: "20px",
          padding: "24px",
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          background: "white",
        }}
      >
        {loading ? (
          <p>جاري تحميل البيانات...</p>
        ) : activeTab === "نظرة عامة" ? (
          <>
            <h2 style={{ marginTop: 0 }}>نظرة عامة</h2>

            <div style={grid}>
              <Summary title="أصناف المخزون" value={String(stock.length)} />
              <Summary
                title="إجمالي كمية المخزون"
                value={formatNumber(stockQuantity)}
              />
              <Summary
                title="قيمة المخزون"
                value={`${formatMoney(stockValue)} ر.س`}
              />
              <Summary title="حركات المخزون" value={String(movements.length)} />
              <Summary title="السندات" value={String(notes.length)} />
              <Summary title="رحلات النقل" value={String(trips.length)} />
              <Summary
                title="إيراد النقل"
                value={`${formatMoney(transportRevenue)} ر.س`}
              />
              <Summary
                title="تكلفة النقل"
                value={`${formatMoney(transportCost)} ر.س`}
              />
              <Summary
                title="صافي النقل"
                value={`${formatMoney(transportProfit)} ر.س`}
              />
              {exposure && <Summary title="المديونية المالية" value={`${formatMoney(exposure.receivable)} ر.س`} />}
              {exposure && <Summary title="قيمة مخزونه التقديرية" value={`${formatMoney(exposure.inventoryValue)} ر.س`} />}
              {exposure && <Summary title="Financial Exposure" value={`${formatNumber(exposure.exposureRatio)}٪`} />}
            </div>
            {exposure && exposure.status !== "NORMAL" && <div style={{marginTop:16,padding:16,borderRadius:12,border:"1px solid #fecaca",background:"#fef2f2",color:"#b91c1c",fontWeight:700}}>تنبيه التعرض المالي: {exposure.status === "DEFICIT" ? `عجز بقيمة ${formatMoney(exposure.shortage)} ر.س` : `تجاوز مستوى ${exposure.status === "CRITICAL" ? exposure.thresholds.critical : exposure.thresholds.warning}٪`}</div>}
          </>
        ) : activeTab === "المبيعات" ? (
          <>
            <h2 style={{ marginTop: 0 }}>المبيعات</h2>
            <div style={grid}>
              <Summary title="عدد الفواتير" value={String(sales.length)} />
              <Summary
                title="إجمالي المبيعات"
                value={`${formatMoney(
                  sales.reduce((sum, sale) => sum + Number(sale.totalAmount), 0)
                )} ر.س`}
              />
            </div>
            <div style={{ marginTop: 24 }}>
              <Table
                headers={["رقم الفاتورة", "التاريخ", "الحالة", "البنود", "الإجمالي"]}
                rows={sales.map((sale) => [
                  sale.invoiceNumber,
                  formatDate(sale.invoiceDate),
                  sale.status,
                  String(sale.items.length),
                  `${formatMoney(sale.totalAmount)} ر.س`,
                ])}
              />
            </div>
            <h3 style={{ marginTop: 28 }}>المستندات التشغيلية</h3>
            <Table headers={["الرقم", "النوع", "التاريخ", "الحالة", "الإجمالي"]} rows={businessDocuments.filter((row) => ["QUOTATION","PROFORMA_INVOICE","SALES_ORDER"].includes(row.documentType)).map((row) => [row.documentNumber,row.documentType,formatDate(row.documentDate),row.status,formatMoney(row.totalAmount)])}/>
          </>
        ) : activeTab === "المشتريات" ? (
          <>
            <h2 style={{ marginTop: 0 }}>المشتريات</h2>
            <div style={grid}>
              <Summary title="عدد أوامر الشراء" value={String(purchases.length)} />
              <Summary
                title="إجمالي المشتريات"
                value={`${formatMoney(
                  purchases.reduce(
                    (sum, purchase) => sum + Number(purchase.totalAmount),
                    0
                  )
                )} ر.س`}
              />
            </div>
            <div style={{ marginTop: 24 }}>
              <Table
                headers={["رقم الشراء", "التاريخ", "الحالة", "البنود", "الإجمالي"]}
                rows={purchases.map((purchase) => [
                  purchase.purchaseNumber,
                  formatDate(purchase.purchaseDate),
                  purchase.status,
                  String(purchase.items.length),
                  `${formatMoney(purchase.totalAmount)} ر.س`,
                ])}
              />
            </div>
            <h3 style={{ marginTop: 28 }}>المستندات التشغيلية</h3>
            <Table headers={["الرقم", "النوع", "التاريخ", "الحالة", "الإجمالي"]} rows={businessDocuments.filter((row) => ["PURCHASE_REQUEST","PURCHASE_ORDER"].includes(row.documentType)).map((row) => [row.documentNumber,row.documentType,formatDate(row.documentDate),row.status,formatMoney(row.totalAmount)])}/>
          </>
        ) : activeTab === "المخزون" ? (
          <>
            <h2 style={{ marginTop: 0 }}>المخزون</h2>

            <h3>رصيد المخزون</h3>
            <Table
              headers={["المادة", "الوارد", "الصادر", "الرصيد الحالي", "متوسط القيمة", "الحالة"]}
              rows={stockStatement.map((row) => {
                const valuation = exposure?.lines.find((line) => line.itemId === row.itemId);
                return [
                itemName(row),
                formatNumber(row.quantityIn),
                formatNumber(row.quantityOut),
                formatNumber(row.quantity),
                formatMoney(valuation?.unitValue ?? row.averageValue),
                Number(row.quantity) < 0 ? (
                  <span style={{ color: "#b91c1c", fontWeight: 700 }}>
                    رصيد سالب
                  </span>
                ) : (
                  "طبيعي"
                ),
              ];})}
            />

            <h3 style={{ marginTop: "32px" }}>حركات المخزون</h3>
            <Table
              headers={[
                "رقم الحركة",
                "التاريخ",
                "المادة",
                "النوع",
                "داخل",
                "خارج",
                "الرصيد",
              ]}
              rows={movements.map((row) => [
                row.movementNumber ?? "-",
                formatDate(row.movementDate),
                itemName(row),
                row.movementType ?? "-",
                formatNumber(row.quantityIn),
                formatNumber(row.quantityOut),
                row.balanceAfter == null
                  ? "-"
                  : formatNumber(row.balanceAfter),
              ])}
            />
          </>
        ) : activeTab === "المصنع" ? (
          <>
            <h2 style={{ marginTop: 0 }}>المصنع</h2>
            <div style={grid}>
              <Summary title="إجمالي الإنتاج" value={formatNumber(factoryTransactions.reduce((sum,row)=>sum+Number(row.quantity),0))} />
              <Summary title="رسوم التصنيع" value={`${formatMoney(factoryTransactions.reduce((sum,row)=>sum+Number(row.manufacturingFeeTotal),0))} ر.س`} />
              <Summary title="عدد عمليات الإنتاج" value={String(factoryTransactions.length)} />
            </div>
            <h3 style={{marginTop:28}}>التعرفة حسب المادة</h3>
            <Table headers={["المادة","رسوم الطن"]} rows={factoryFeeRates.map(row=>[row.item.nameAr,`${formatMoney(row.feePerTon)} ر.س`])}/>
            <h3 style={{marginTop:28}}>سجل الإنتاج</h3>
            <Table headers={["الرقم","التاريخ","المادة","الكمية","رسوم/طن","رسوم التصنيع","الإجمالي","الحالة"]} rows={factoryTransactions.map(row=>[row.transactionNumber,formatDate(row.transactionDate),row.item.nameAr,formatNumber(row.quantity),formatMoney(row.manufacturingFeePerTon),formatMoney(row.manufacturingFeeTotal),formatMoney(row.totalAmount),row.status])}/>
          </>
        ) : activeTab === "النقل" ? (
          <>
            <h2 style={{ marginTop: 0 }}>النقل</h2>

            <div style={grid}>
              <Summary title="عدد الرحلات" value={String(trips.length)} />
              <Summary
                title="إجمالي الإيراد"
                value={`${formatMoney(transportRevenue)} ر.س`}
              />
              <Summary
                title="إجمالي التكلفة"
                value={`${formatMoney(transportCost)} ر.س`}
              />
              <Summary
                title="صافي الربح"
                value={`${formatMoney(transportProfit)} ر.س`}
              />
            </div>

            <div style={{ marginTop: "24px" }}>
              <Table
                headers={[
                  "رقم الرحلة",
                  "التاريخ",
                  "الكمية",
                  "الإيراد",
                  "التكلفة",
                  "الصافي",
                  "الحالة",
                ]}
                rows={trips.map((row) => [
                  row.tripNumber ?? "-",
                  formatDate(row.tripDate),
                  formatNumber(row.quantity),
                  formatMoney(row.transportRevenue),
                  formatMoney(row.totalCost),
                  formatMoney(row.netProfit),
                  row.status ?? "-",
                ])}
              />
            </div>
          </>
        ) : activeTab === "السندات والإشعارات" ? (
          <>
            <h2 style={{ marginTop: 0 }}>السندات والإشعارات</h2>

            <Table
              headers={[
                "رقم السند",
                "التاريخ",
                "النوع",
                "الحالة",
                "عدد البنود",
              ]}
              rows={notes.map((row) => [
                row.noteNumber,
                formatDate(row.noteDate),
                row.noteType ?? "-",
                row.status ?? "-",
                String(row.items?.length ?? 0),
              ])}
            />
          </>
        ) : activeTab === "الحساب" ? (
          <>
            <h2 style={{ marginTop: 0 }}>الحساب والقيود</h2>
            <Table headers={["رقم القيد", "التاريخ", "البيان", "مدين", "دائن", "الحالة"]} rows={journals.map((row) => [row.entryNumber,formatDate(row.entryDate),row.description??"-",formatMoney(row.totalDebit),formatMoney(row.totalCredit),row.status])}/>
          </>
        ) : activeTab === "المرفقات" ? (
          <>
            <h2 style={{ marginTop: 0 }}>المرفقات</h2>
            <label style={{ display:"inline-block",padding:"10px 16px",borderRadius:8,background:"#2563eb",color:"white",cursor:"pointer",marginBottom:16 }}>رفع مرفق<input type="file" accept=".pdf,.jpg,.jpeg,.png,.xls,.xlsx" style={{display:"none"}} onChange={(event) => event.target.files?.[0] && void uploadPartyAttachment(event.target.files[0])}/></label>
            <Table headers={["الملف", "النوع", "الحجم", "تاريخ الرفع", ""]} rows={attachments.map((row) => [row.originalName,row.mimeType,`${Math.ceil(row.size/1024)} KB`,formatDate(row.uploadedAt),<a key={row.id} href={`/api/attachments/${row.id}`} target="_blank" style={{color:"#2563eb"}}>فتح</a>])}/>
          </>
        ) : (
          <>
            <h2 style={{ margin: 0 }}>{activeTab}</h2>
            <p style={{ color: "#64748b" }}>
              سيتم ربط بيانات {activeTab} في المرحلة التالية.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function itemName(row: { item?: ItemRef; itemId?: number }) {
  return row.item?.nameAr ?? `مادة #${row.itemId ?? "-"}`;
}

function formatNumber(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-US", {
    maximumFractionDigits: 3,
  });
}

function formatMoney(value: unknown) {
  return Number(value ?? 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(value: unknown) {
  if (!value) return "-";
  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    !(value instanceof Date)
  ) {
    return "-";
  }
  return new Date(value).toLocaleDateString("en-US");
}

const grid = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
  gap: "16px",
  marginTop: "20px",
};

function Summary({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div
      style={{
        padding: "18px",
        border: "1px solid #e2e8f0",
        borderRadius: "10px",
        background: "#f8fafc",
      }}
    >
      <div style={{ color: "#64748b", fontSize: "13px" }}>{title}</div>
      <div style={{ marginTop: "8px", fontSize: "20px", fontWeight: 700 }}>
        {value}
      </div>
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  if (!rows.length) {
    return (
      <div
        style={{
          padding: "24px",
          border: "1px dashed #cbd5e1",
          borderRadius: "10px",
          color: "#64748b",
        }}
      >
        لا توجد بيانات حتى الآن.
      </div>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          minWidth: "700px",
        }}
      >
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header} style={th}>
                {header}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} style={td}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const th = {
  padding: "12px",
  textAlign: "right" as const,
  background: "#f8fafc",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap" as const,
};

const td = {
  padding: "12px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap" as const,
};
