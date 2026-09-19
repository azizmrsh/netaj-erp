"use client";

import { useEffect, useMemo, useState } from "react";

type Source = { key: string; fields: string[] };
type Definition = { id: number; code: string; name: string; sourceType: string; visibility: string };
type Result = { columns: string[]; rows: Record<string, unknown>[]; totals: Record<string, number>; sourceRowCount: number; truncated: boolean };

export default function ReportBuilderClient() {
  const [catalog, setCatalog] = useState<Source[]>([]);
  const [definitions, setDefinitions] = useState<Definition[]>([]);
  const [source, setSource] = useState("PARTIES");
  const [fields, setFields] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [groupBy, setGroupBy] = useState("");
  const [calcField, setCalcField] = useState("");
  const [calcOp, setCalcOp] = useState("SUM");
  const [filterField, setFilterField] = useState("");
  const [filterOperator, setFilterOperator] = useState("EQ");
  const [filterValue, setFilterValue] = useState("");
  const [sortField, setSortField] = useState("");
  const [sortDirection, setSortDirection] = useState("asc");
  const [visibility, setVisibility] = useState("PRIVATE");
  const [result, setResult] = useState<Result | null>(null);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    fetch("/api/custom-reports", { cache: "no-store" }).then((response) => response.json()).then((payload) => {
      if (!active) return;
      setCatalog(payload.catalog ?? []);
      setDefinitions(payload.definitions ?? []);
      const first = payload.catalog?.[0];
      if (first) {
        setSource(first.key);
        setFields(first.fields.slice(0, 5));
        setCalcField(first.fields.find((field: string) => /amount|total|value|quantity/i.test(field)) ?? first.fields[0]);
      }
    }).catch(() => setMessage("تعذر تحميل منشئ التقارير"));
    return () => { active = false; };
  }, []);

  const sourceFields = useMemo(() => catalog.find((entry) => entry.key === source)?.fields ?? [], [catalog, source]);

  function changeSource(value: string) {
    const next = catalog.find((entry) => entry.key === value)?.fields ?? [];
    setSource(value); setFields(next.slice(0, 5)); setGroupBy(""); setFilterField(""); setFilterValue(""); setSortField("");
    setCalcField(next.find((field) => /amount|total|value|quantity/i.test(field)) ?? next[0] ?? "");
  }

  async function save() {
    if (!name || !code || !fields.length) return setMessage("الاسم والكود وحقل واحد على الأقل مطلوبة");
    const calculations = calcField ? [{ field: calcField, operation: calcOp, label: `${calcOp}_${calcField}` }] : [];
    const filters = filterField && filterValue !== "" ? [{ field: filterField, operator: filterOperator, value: filterValue }] : [];
    const sort = sortField ? [{ field: sortField, direction: sortDirection }] : [];
    const response = await fetch("/api/custom-reports", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, code, sourceType: source, fields, filters, groupBy: groupBy ? [groupBy] : [], calculations, sort, visibility }) });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error);
    setResult(payload.result); setCurrentId(payload.definition.id);
    setDefinitions((old) => [payload.definition, ...old.filter((definition) => definition.id !== payload.definition.id)]);
    setMessage("تم حفظ التقرير وتشغيله");
  }

  async function open(id: number) {
    const response = await fetch(`/api/custom-reports?id=${id}`), payload = await response.json();
    if (!response.ok) return setMessage(payload.error);
    setResult(payload.result); setCurrentId(id); setName(payload.definition.name); setCode(payload.definition.code);
    setSource(payload.definition.sourceType); setVisibility(payload.definition.visibility);
  }

  return <div className="mx-auto grid max-w-7xl gap-6 p-5 lg:grid-cols-[1.4fr_.6fr]">
    <div className="space-y-5">
      {message && <div className="rounded-xl border bg-white p-4">{message}</div>}
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="font-bold">تعريف التقرير</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input className="rounded-lg border p-2" placeholder="اسم التقرير" value={name} onChange={(event) => setName(event.target.value)} />
          <input className="rounded-lg border p-2" placeholder="كود فريد" value={code} onChange={(event) => setCode(event.target.value)} />
          <select className="rounded-lg border p-2" value={source} onChange={(event) => changeSource(event.target.value)}>{catalog.map((entry) => <option key={entry.key}>{entry.key}</option>)}</select>
          <select className="rounded-lg border p-2" value={visibility} onChange={(event) => setVisibility(event.target.value)}><option value="PRIVATE">خاص بي</option><option value="COMPANY">كل الشركة</option><option value="ROLES">أدوار محددة</option></select>
        </div>
        <h3 className="mb-2 mt-5 font-bold">الحقول</h3>
        <div className="flex flex-wrap gap-2">{sourceFields.map((field) => <label className={`rounded-lg border px-3 py-2 text-sm ${fields.includes(field) ? "border-blue-400 bg-blue-50" : ""}`} key={field}><input type="checkbox" checked={fields.includes(field)} onChange={(event) => setFields(event.target.checked ? [...fields, field] : fields.filter((entry) => entry !== field))} /> {field}</label>)}</div>
        <h3 className="mb-2 mt-5 font-bold">التصفية والترتيب</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <select className="rounded-lg border p-2" value={filterField} onChange={(event) => setFilterField(event.target.value)}><option value="">بدون فلتر</option>{sourceFields.map((field) => <option key={field}>{field}</option>)}</select>
          <select className="rounded-lg border p-2" value={filterOperator} onChange={(event) => setFilterOperator(event.target.value)}><option value="EQ">يساوي</option><option value="CONTAINS">يحتوي</option><option value="GTE">أكبر أو يساوي</option><option value="LTE">أصغر أو يساوي</option></select>
          <input className="rounded-lg border p-2" placeholder="قيمة الفلتر" value={filterValue} onChange={(event) => setFilterValue(event.target.value)} />
          <div className="flex gap-2"><select className="min-w-0 flex-1 rounded-lg border p-2" value={sortField} onChange={(event) => setSortField(event.target.value)}><option value="">بدون ترتيب</option>{sourceFields.map((field) => <option key={field}>{field}</option>)}</select><select className="rounded-lg border p-2" value={sortDirection} onChange={(event) => setSortDirection(event.target.value)}><option value="asc">↑</option><option value="desc">↓</option></select></div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <label className="text-sm">تجميع<select className="mt-1 w-full rounded-lg border p-2" value={groupBy} onChange={(event) => setGroupBy(event.target.value)}><option value="">بدون</option>{sourceFields.map((field) => <option key={field}>{field}</option>)}</select></label>
          <label className="text-sm">حقل الحساب<select className="mt-1 w-full rounded-lg border p-2" value={calcField} onChange={(event) => setCalcField(event.target.value)}>{sourceFields.map((field) => <option key={field}>{field}</option>)}</select></label>
          <label className="text-sm">العملية<select className="mt-1 w-full rounded-lg border p-2" value={calcOp} onChange={(event) => setCalcOp(event.target.value)}>{["SUM", "COUNT", "AVG", "MIN", "MAX"].map((operation) => <option key={operation}>{operation}</option>)}</select></label>
        </div>
        <button onClick={save} className="mt-5 rounded-lg bg-blue-700 px-5 py-2.5 font-bold text-white">حفظ وتشغيل</button>
      </section>
      {result && <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap justify-between gap-3"><div><h2 className="font-bold">النتيجة</h2><p className="text-sm text-slate-500">{result.sourceRowCount} صف {result.truncated && "· تم بلوغ حد العرض"}</p></div>{currentId && <div className="flex gap-2"><a className="rounded-lg border px-3 py-2" href={`/api/custom-reports/${currentId}/export?format=xlsx`}>Excel</a><a className="rounded-lg border px-3 py-2" href={`/api/custom-reports/${currentId}/export?format=pdf`}>PDF</a><button className="rounded-lg border px-3 py-2" onClick={() => window.print()}>طباعة</button></div>}</div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-sm"><thead className="bg-slate-100"><tr>{result.columns.map((column) => <th className="p-2 text-right" key={column}>{column}</th>)}</tr></thead><tbody>{result.rows.slice(0, 500).map((row, index) => <tr className="border-b" key={index}>{result.columns.map((column) => <td className="p-2" key={column}>{String(row[column] ?? "")}</td>)}</tr>)}</tbody></table></div>
      </section>}
    </div>
    <aside className="h-fit rounded-2xl border bg-white p-5"><h2 className="font-bold">تقاريري المحفوظة</h2><div className="mt-4 space-y-2">{definitions.map((definition) => <button onClick={() => open(definition.id)} className="w-full rounded-xl border p-3 text-right hover:bg-slate-50" key={definition.id}><b>{definition.name}</b><small className="block text-slate-500">{definition.sourceType} · {definition.visibility}</small></button>)}</div></aside>
  </div>;
}
