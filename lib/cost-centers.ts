import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
type Input = Record<string, unknown>;
export class CostCenterError extends Error {
  constructor(message: string, public readonly status = 400) { super(message); this.name = "CostCenterError"; }
}
const text = (value: unknown) => String(value ?? "").trim();
const keyFor = (id: number) => `CENTER_${id}`;
const optionalId = (value: unknown) => {
  if (value === "" || value == null) return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new CostCenterError("رقم الربط غير صحيح");
  return id;
};
const types = new Set(["GENERAL", "PROJECT", "VEHICLE", "FACTORY", "DEPARTMENT"]);
type Metadata = { parentId: number | null; branchId: number | null; allowPosting: boolean; centerType: string; linkedEntityId: number | null; notes: string };
function metadata(value?: string): Metadata {
  let row: Input = {};
  try { const parsed = JSON.parse(value ?? "{}"); if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) row = parsed; } catch { /* Older rows have no hierarchy. */ }
  const id = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
  return { parentId: id(row.parentId), branchId: id(row.branchId), allowPosting: row.allowPosting !== false,
    centerType: types.has(text(row.centerType)) ? text(row.centerType) : "GENERAL", linkedEntityId: id(row.linkedEntityId), notes: text(row.notes) };
}

export async function costCenterWorkspace(tx: Tx) {
  const scope = await getVerifiedDataScope();
  const [centers, settings, branches, projects, vehicles, departments, company] = await Promise.all([
    tx.costCenter.findMany({ where: scope, orderBy: { code: "asc" } }),
    tx.companyConfiguration.findMany({ where: { ...scope, category: "COST_CENTERS", configKey: { startsWith: "CENTER_" } } }),
    tx.branch.findMany({ where: { companyId: scope.companyId }, select: { id: true, nameAr: true, isActive: true }, orderBy: { nameAr: "asc" } }),
    tx.project.findMany({ where: scope, select: { id: true, name: true, projectNumber: true }, orderBy: { projectNumber: "asc" } }),
    tx.truck.findMany({ where: scope, select: { id: true, plateNumber: true }, orderBy: { plateNumber: "asc" } }),
    tx.department.findMany({ where: { companyId: scope.companyId }, select: { id: true, nameAr: true }, orderBy: { nameAr: "asc" } }),
    tx.company.findFirst({ where: { id: scope.companyId, tenantId: scope.tenantId }, select: { legalNameAr: true, baseCurrencyCode: true } }),
  ]);
  const byKey = new Map(settings.map(row => [row.configKey, metadata(row.valueJson)]));
  const rows = centers.map(row => ({ ...row, ...metadata(), ...byKey.get(keyFor(row.id)) }));
  const byId = new Map(rows.map(row => [row.id, row]));
  return { rows: rows.map(row => {
    let parentId = row.parentId, level = 1;
    const seen = new Set([row.id]);
    while (parentId && byId.has(parentId) && !seen.has(parentId)) { seen.add(parentId); level++; parentId = byId.get(parentId)!.parentId; }
    return { ...row, level, parentName: row.parentId ? byId.get(row.parentId)?.nameAr ?? null : null,
      branchName: branches.find(branch => branch.id === row.branchId)?.nameAr ?? null,
      childCount: rows.filter(child => child.parentId === row.id).length };
  }), branches, projects: projects.map(row => ({ id: row.id, name: row.name, projectCode: row.projectNumber })), vehicles, departments,
    company: company ? { nameAr: company.legalNameAr, baseCurrencyCode: company.baseCurrencyCode } : null };
}

export async function saveCostCenter(tx: Tx, input: Input, userId?: string) {
  const scope = await getVerifiedDataScope(), id = optionalId(input.id);
  const current = id ? await tx.costCenter.findFirst({ where: { ...scope, id } }) : null;
  if (id && !current) throw new CostCenterError("مركز التكلفة غير موجود في الشركة الحالية", 404);
  const workspace = await costCenterWorkspace(tx), previous = workspace.rows.find(row => row.id === id);
  const code = text(input.code ?? current?.code), nameAr = text(input.nameAr ?? current?.nameAr), nameEn = text(input.nameEn ?? current?.nameEn);
  if (!code || code.length > 50 || !nameAr || nameAr.length > 200) throw new CostCenterError("رمز المركز واسمه مطلوبان، بحد أقصى 50 و200 حرف");
  if (current && code !== current.code) throw new CostCenterError("رمز المركز ثابت للحفاظ على ربط الحركات التاريخية؛ يمكن تعديل الاسم");
  const detail: Metadata = { parentId: input.parentId === undefined ? previous?.parentId ?? null : optionalId(input.parentId),
    branchId: input.branchId === undefined ? previous?.branchId ?? null : optionalId(input.branchId),
    allowPosting: input.allowPosting === undefined ? previous?.allowPosting ?? true : input.allowPosting === true,
    centerType: text(input.centerType ?? previous?.centerType ?? "GENERAL"),
    linkedEntityId: input.linkedEntityId === undefined ? previous?.linkedEntityId ?? null : optionalId(input.linkedEntityId),
    notes: text(input.notes ?? previous?.notes) };
  const isActive = input.isActive === undefined ? current?.isActive ?? true : input.isActive === true;
  if (!types.has(detail.centerType)) throw new CostCenterError("نوع مركز التكلفة غير صحيح");
  if (detail.branchId && !workspace.branches.some(row => row.id === detail.branchId && row.isActive)) throw new CostCenterError("الفرع غير نشط أو لا يتبع الشركة الحالية");
  if (detail.parentId) {
    const parent = workspace.rows.find(row => row.id === detail.parentId);
    if (!parent?.isActive) throw new CostCenterError("المركز الأب غير نشط أو غير موجود");
    if (parent.allowPosting) throw new CostCenterError("يجب جعل المركز الأب مركزًا رئيسيًا ومنع الترحيل المباشر عليه أولًا");
    if (parent.branchId && parent.branchId !== detail.branchId) throw new CostCenterError("فرع المركز الفرعي يجب أن يطابق فرع المركز الأب");
    let cursor: typeof parent | undefined = parent;
    const visited = new Set<number>();
    while (cursor) {
      if (cursor.id === id || visited.has(cursor.id)) throw new CostCenterError("لا يمكن ربط مركز بنفسه أو بأحد فروعه");
      visited.add(cursor.id); cursor = workspace.rows.find(row => row.id === cursor!.parentId);
    }
  }
  const children = id ? workspace.rows.filter(row => row.parentId === id) : [];
  if (detail.allowPosting && children.length) throw new CostCenterError("المركز الذي يحتوي فروعًا يجب أن يبقى مركزًا رئيسيًا");
  if (detail.branchId && children.some(row => row.branchId !== detail.branchId)) throw new CostCenterError("لا يمكن تغيير فرع المركز الأب بما يخالف فروع مراكزه التابعة");
  if (!isActive && children.some(row => row.isActive)) throw new CostCenterError("عطّل المراكز الفرعية النشطة أولًا");
  if (detail.linkedEntityId) {
    const valid = detail.centerType === "PROJECT" ? workspace.projects.some(row => row.id === detail.linkedEntityId)
      : detail.centerType === "VEHICLE" ? workspace.vehicles.some(row => row.id === detail.linkedEntityId)
      : detail.centerType === "DEPARTMENT" ? workspace.departments.some(row => row.id === detail.linkedEntityId) : false;
    if (!valid) throw new CostCenterError("الربط بالمشروع أو المركبة أو الإدارة غير صالح في الشركة الحالية");
  }
  const duplicate = await tx.costCenter.findFirst({ where: { code, ...(id ? { id: { not: id } } : {}) } });
  if (duplicate) throw new CostCenterError("رمز مركز التكلفة مستخدم بالفعل");
  const data = { nameAr, nameEn: nameEn || null, isActive };
  const record = current ? await tx.costCenter.update({ where: { id: current.id, ...scope }, data }) : await tx.costCenter.create({ data: { ...scope, code, ...data } });
  await tx.companyConfiguration.upsert({ where: { tenantId_companyId_category_configKey: { ...scope, category: "COST_CENTERS", configKey: keyFor(record.id) } },
    create: { ...scope, category: "COST_CENTERS", configKey: keyFor(record.id), labelAr: nameAr, valueType: "JSON", valueJson: JSON.stringify(detail), updatedBy: userId },
    update: { labelAr: nameAr, valueJson: JSON.stringify(detail), updatedBy: userId } });
  await audit(tx, { action: current ? "COST_CENTER_UPDATE" : "COST_CENTER_CREATE", entityType: "COST_CENTER", entityId: record.id, userId,
    metadata: { before: previous ?? null, after: { ...record, ...detail } } });
  return { ...record, ...detail };
}

/** Shared by the posting engine: an operational center must exist in the current company. */
export async function validateCostCenterForPosting(tx: Tx, input: { costCenterId?: number | null; costCenter?: string | null }) {
  const code = text(input.costCenter), id = input.costCenterId;
  if (!id && (!code || code === "MULTI")) return null;
  const scope = await getVerifiedDataScope();
  const center = await tx.costCenter.findFirst({ where: { ...scope, ...(id ? { id } : { code }) } });
  if (!center?.isActive) throw new CostCenterError("مركز التكلفة غير نشط أو لا يتبع الشركة الحالية");
  if (id && code && code !== "MULTI" && code !== center.code) throw new CostCenterError("رمز مركز التكلفة لا يطابق المركز المحدد");
  const config = await tx.companyConfiguration.findFirst({ where: { ...scope, category: "COST_CENTERS", configKey: keyFor(center.id) } });
  if (!metadata(config?.valueJson).allowPosting) throw new CostCenterError("لا يسمح بالقيد المباشر على مركز تكلفة رئيسي؛ اختر مركز حركة");
  return center;
}

function dateFilter(value: string | null, end = false) {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CostCenterError("صيغة التاريخ غير صحيحة");
  const parsed = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new CostCenterError("التاريخ غير صالح");
  return parsed;
}

export async function costCenterReport(tx: Tx, params: URLSearchParams) {
  const scope = await getVerifiedDataScope(), workspace = await costCenterWorkspace(tx);
  const from = dateFilter(params.get("from")), to = dateFilter(params.get("to"), true);
  if (from && to && from > to) throw new CostCenterError("بداية الفترة يجب أن تسبق نهايتها");
  const centerId = optionalId(params.get("centerId")), branchId = optionalId(params.get("branchId")), accountId = optionalId(params.get("accountId"));
  if (centerId && !workspace.rows.some(row => row.id === centerId)) throw new CostCenterError("مركز التكلفة غير موجود", 404);
  const selectedIds = new Set(centerId ? [centerId] : workspace.rows.map(row => row.id));
  if (centerId && params.get("includeChildren") !== "false") {
    let changed = true;
    while (changed) { changed = false; for (const row of workspace.rows) if (row.parentId && selectedIds.has(row.parentId) && !selectedIds.has(row.id)) { selectedIds.add(row.id); changed = true; } }
  }
  const selected = workspace.rows.filter(row => selectedIds.has(row.id) && (!branchId || row.branchId === branchId));
  const byId = new Map(selected.map(row => [row.id, row])), byCode = new Map(selected.map(row => [row.code, row]));
  const accounts = await tx.account.findMany({ where: scope, select: { id: true, code: true, accountType: true } });
  const accountById = new Map(accounts.map(row => [row.id, row])), accountByCode = new Map(accounts.map(row => [row.code, row]));
  if (accountId && !accountById.has(accountId)) throw new CostCenterError("الحساب غير موجود في الشركة الحالية", 404);
  // Imported ledger rows may retain the account code without an accountId.
  // Resolve against this company's chart only, including inactive historic accounts.
  const lines = await tx.journalEntryLine.findMany({ where: { ...scope,
    ...(accountId ? { AND: [{ OR: [{ accountId }, { accountId: null, accountCode: accountById.get(accountId)!.code }] }] } : {}),
    OR: [{ costCenterId: { in: selected.map(row => row.id) } }, { costCenterId: null, costCenter: { in: selected.map(row => row.code) } }],
    journalEntry: { ...scope, status: { in: ["POSTED", "REVERSED"] }, ...(to ? { entryDate: { lte: to } } : {}) } },
    include: { account: true, journalEntry: true }, orderBy: [{ journalEntry: { entryDate: "asc" } }, { journalEntryId: "asc" }, { id: "asc" }] });
  let opening = new Prisma.Decimal(0), debit = new Prisma.Decimal(0), credit = new Prisma.Decimal(0), revenue = new Prisma.Decimal(0), costs = new Prisma.Decimal(0);
  const comparison = new Map(selected.map(row => [row.id, { id: row.id, code: row.code, nameAr: row.nameAr, revenue: 0, costs: 0, netProfit: 0 }]));
  const search = text(params.get("q")).toLocaleLowerCase();
  const matched = lines.filter(line => !search || [line.description, line.accountName, line.accountCode, line.journalEntry.entryNumber, line.journalEntry.referenceNumber].some(value => String(value ?? "").toLocaleLowerCase().includes(search)));
  for (const line of matched) if (from && line.journalEntry.entryDate < from) opening = opening.plus(line.debit).minus(line.credit);
  let balance = opening;
  const rows = matched.filter(line => !from || line.journalEntry.entryDate >= from).map(line => {
    const center = line.costCenterId ? byId.get(line.costCenterId) : byCode.get(line.costCenter ?? "");
    const dr = new Prisma.Decimal(line.debit), cr = new Prisma.Decimal(line.credit);
    debit = debit.plus(dr); credit = credit.plus(cr); balance = balance.plus(dr).minus(cr);
    const account = line.accountId ? accountById.get(line.accountId) : accountByCode.get(line.accountCode);
    const income = account?.accountType === "REVENUE" ? cr.minus(dr) : new Prisma.Decimal(0);
    const expense = account?.accountType === "EXPENSE" ? dr.minus(cr) : new Prisma.Decimal(0);
    revenue = revenue.plus(income); costs = costs.plus(expense);
    if (center) { const summary = comparison.get(center.id)!; summary.revenue = new Prisma.Decimal(summary.revenue).plus(income).toNumber(); summary.costs = new Prisma.Decimal(summary.costs).plus(expense).toNumber(); summary.netProfit = new Prisma.Decimal(summary.revenue).minus(summary.costs).toNumber(); }
    return { id: line.id, centerId: center?.id ?? null, centerCode: center?.code ?? line.costCenter ?? "", centerName: center?.nameAr ?? "",
      branchName: center?.branchName ?? "كل الفروع", accountCode: line.accountCode, accountName: line.accountName, accountType: account?.accountType ?? "",
      journalId: line.journalEntryId, entryNumber: line.journalEntry.entryNumber, date: line.journalEntry.entryDate.toISOString().slice(0, 10),
      referenceType: line.journalEntry.referenceType, referenceNumber: line.journalEntry.referenceNumber, description: line.description ?? line.journalEntry.description,
      debit: dr.toNumber(), credit: cr.toNumber(), balance: balance.toNumber() };
  });
  return { rows, comparison: [...comparison.values()], company: workspace.company, totals: { opening: opening.toNumber(), debit: debit.toNumber(), credit: credit.toNumber(), closing: balance.toNumber(), revenue: revenue.toNumber(), costs: costs.toNumber(), netProfit: revenue.minus(costs).toNumber() } };
}
