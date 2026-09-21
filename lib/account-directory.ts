import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
const category = "ACCOUNT_DETAILS";
export const accountTypes: Record<string, string> = { ASSET: "الأصول", LIABILITY: "الخصوم", EQUITY: "حقوق الملكية", REVENUE: "الإيرادات", EXPENSE: "المصروفات" };
export class AccountDirectoryError extends Error { constructor(message: string, public status = 400) { super(message); } }
const text = (value: unknown) => String(value ?? "").trim();
function metadata(value?: string) { try { return JSON.parse(value ?? "{}") as Record<string, unknown>; } catch { return {}; } }

export async function accountDirectory(tx: Tx) {
  const { companyId } = await getVerifiedDataScope();
  const [accounts, configs, sums, company, branches, currencies] = await Promise.all([
    tx.account.findMany({ orderBy: { code: "asc" } }),
    tx.companyConfiguration.findMany({ where: { category } }),
    tx.journalEntryLine.findMany({ where: { journalEntry: { status: { in: ["POSTED", "REVERSED"] } } }, select: { accountId: true, debit: true, credit: true } }),
    tx.company.findUniqueOrThrow({ where: { id: companyId } }),
    tx.branch.findMany({ where: { companyId }, orderBy: { nameAr: "asc" } }),
    tx.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
  ]);
  const details = new Map(configs.map(row => [Number(row.configKey), metadata(row.valueJson)]));
  const direct = new Map<number, Prisma.Decimal>();
  for (const row of sums) if (row.accountId) direct.set(row.accountId, (direct.get(row.accountId) ?? new Prisma.Decimal(0)).plus(row.debit).minus(row.credit));
  const byId = new Map(accounts.map(row => [row.id, row]));
  const balances = new Map<number, Prisma.Decimal>();
  for (const account of accounts) {
    const amount = direct.get(account.id) ?? new Prisma.Decimal(0);
    let current: typeof account | undefined = account;
    const seen = new Set<number>();
    while (current && !seen.has(current.id)) { seen.add(current.id); balances.set(current.id, (balances.get(current.id) ?? new Prisma.Decimal(0)).plus(amount)); current = current.parentId ? byId.get(current.parentId) : undefined; }
  }
  const rows = accounts.map(account => {
    const detail = details.get(account.id) ?? {}, seen = new Set([account.id]); let level = 1, parent = account.parentId ? byId.get(account.parentId) : undefined;
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); level++; parent = parent.parentId ? byId.get(parent.parentId) : undefined; }
    const normalBalance = detail.normalBalance === "CREDIT" || detail.normalBalance === "DEBIT" ? detail.normalBalance : ["ASSET", "EXPENSE"].includes(account.accountType) ? "DEBIT" : "CREDIT";
    const signedBalance = Number(balances.get(account.id) ?? 0);
    return { ...account, description: text(detail.description), currency: text(detail.currency) || company.baseCurrencyCode, branchId: Number(detail.branchId) || null, branchName: branches.find(b => b.id === Number(detail.branchId))?.nameAr ?? "كل الفروع", companyName: company.legalNameAr, normalBalance, level, signedBalance, balance: normalBalance === "DEBIT" ? signedBalance : -signedBalance, balanceCurrency: company.baseCurrencyCode, parentName: byId.get(account.parentId ?? 0)?.nameAr ?? null };
  });
  return { rows, branches, currencies, company: { id: company.id, nameAr: company.legalNameAr, currency: company.baseCurrencyCode } };
}

export function filterAccountDirectory<T extends { id: number; code: string; nameAr: string; nameEn: string | null; accountType: string; parentId: number | null; currency: string; branchId: number | null; isActive: boolean }>(rows: T[], params: URLSearchParams) {
  const q = text(params.get("q")).toLocaleLowerCase(), ids = params.get("ids")?.split(",").map(Number);
  return rows.filter(row => (!q || `${row.code} ${row.nameAr} ${row.nameEn ?? ""}`.toLocaleLowerCase().includes(q)) && (!params.get("code") || row.code.includes(params.get("code")!)) && (!params.get("name") || row.nameAr.includes(params.get("name")!)) && (!params.get("type") || row.accountType === params.get("type")) && (!params.get("parentId") || row.parentId === Number(params.get("parentId"))) && (!params.get("branchId") || row.branchId === Number(params.get("branchId"))) && (!params.get("currency") || row.currency === params.get("currency")) && (!params.get("status") || row.isActive === (params.get("status") === "ACTIVE")) && (!ids || ids.includes(row.id)));
}

export async function saveAccount(tx: Tx, input: Record<string, unknown>, userId: string, id?: number) {
  const scope = await getVerifiedDataScope();
  const current = id ? await tx.account.findUnique({ where: { id } }) : null;
  if (id && !current) throw new AccountDirectoryError("الحساب غير موجود", 404);
  const code = text(input.code ?? current?.code), nameAr = text(input.nameAr ?? current?.nameAr), type = text(input.accountType ?? current?.accountType);
  if (!code || !nameAr || !accountTypes[type]) throw new AccountDirectoryError("رقم الحساب واسمه وتصنيفه الصحيح مطلوبة");
  const duplicate = await tx.account.findUnique({ where: { code } });
  if (duplicate && duplicate.id !== id) throw new AccountDirectoryError("رقم الحساب مستخدم بالفعل", 409);
  const parentId = input.parentId === undefined ? current?.parentId ?? null : Number(input.parentId) || null;
  const allowPosting = input.allowPosting === undefined ? current?.allowPosting ?? true : input.allowPosting === true;
  const isActive = input.isActive === undefined ? current?.isActive ?? true : input.isActive === true;
  if (parentId) {
    const parent = await tx.account.findUnique({ where: { id: parentId } });
    if (!parent || !parent.isActive || parent.allowPosting) throw new AccountDirectoryError("الحساب الأب يجب أن يكون حسابًا رئيسيًا نشطًا يمنع القيود المباشرة");
    if (parent.accountType !== type) throw new AccountDirectoryError("تصنيف الحساب الفرعي يجب أن يطابق الحساب الأب");
    const seen = new Set<number>(id ? [id] : []); let node: typeof parent | null = parent;
    while (node) { if (seen.has(node.id)) throw new AccountDirectoryError("لا يجوز وضع الحساب تحت نفسه أو أحد فروعه"); seen.add(node.id); node = node.parentId ? await tx.account.findUnique({ where: { id: node.parentId } }) : null; }
  }
  if (current) {
    const movements = await tx.journalEntryLine.count({ where: { accountId: current.id } });
    if (movements && (type !== current.accountType || code !== current.code || parentId !== current.parentId || allowPosting !== current.allowPosting)) throw new AccountDirectoryError("الحساب عليه حركات؛ لا يمكن تغيير رقمه أو تصنيفه أو موقعه أو نوعه", 409);
    const children = await tx.account.count({ where: { parentId: current.id } });
    if (children && (allowPosting || !isActive || type !== current.accountType)) throw new AccountDirectoryError("الحساب له فروع؛ لا يمكن تحويله لحساب حركة أو إيقافه أو تغيير تصنيفه", 409);
  }
  const company = await tx.company.findUniqueOrThrow({ where: { id: scope.companyId } });
  const oldConfig = current ? await tx.companyConfiguration.findFirst({ where: { category, configKey: String(current.id) } }) : null;
  const oldDetails = metadata(oldConfig?.valueJson);
  const currency = text(input.currency ?? oldDetails.currency) || company.baseCurrencyCode;
  if (!await tx.currency.findFirst({ where: { code: currency, isActive: true } })) throw new AccountDirectoryError("العملة غير نشطة أو غير موجودة");
  const branchId = input.branchId === undefined ? Number(oldDetails.branchId) || null : Number(input.branchId) || null;
  if (branchId && !await tx.branch.findFirst({ where: { id: branchId, companyId: scope.companyId } })) throw new AccountDirectoryError("الفرع لا يتبع الشركة الحالية");
  const normalBalance = text(input.normalBalance ?? oldDetails.normalBalance) || (["ASSET", "EXPENSE"].includes(type) ? "DEBIT" : "CREDIT");
  if (!["DEBIT", "CREDIT"].includes(normalBalance)) throw new AccountDirectoryError("طبيعة الحساب غير صحيحة");
  const data = { code, nameAr, nameEn: text(input.nameEn ?? current?.nameEn) || null, accountType: type, parentId, allowPosting, isActive };
  const row = current ? await tx.account.update({ where: { id }, data }) : await tx.account.create({ data });
  const valueJson = JSON.stringify({ currency, branchId, normalBalance, description: text(input.description ?? oldDetails.description) });
  await tx.companyConfiguration.upsert({ where: { tenantId_companyId_category_configKey: { ...scope, category, configKey: String(row.id) } }, create: { ...scope, category, configKey: String(row.id), valueType: "JSON", valueJson, updatedBy: userId }, update: { valueJson, updatedBy: userId } });
  await audit(tx, { action: current ? "ACCOUNT_UPDATE" : "ACCOUNT_CREATE", entityType: "ACCOUNT", entityId: row.id, userId, metadata: { before: current, after: row, details: JSON.parse(valueJson) } });
  return row;
}

export async function deleteAccount(tx: Tx, id: number, userId: string) {
  const account = await tx.account.findUnique({ where: { id } });
  if (!account) throw new AccountDirectoryError("الحساب غير موجود", 404);
  const blockers = await Promise.all([tx.account.count({ where: { parentId: id } }), tx.journalEntryLine.count({ where: { accountId: id } }), tx.accountingMapping.count({ where: { accountId: id } }), tx.bankAccount.count({ where: { ledgerAccountId: id } }), tx.expenseCategory.count({ where: { accountId: id } }), tx.revenueCategory.count({ where: { accountId: id } }), tx.accountingAdjustmentLine.count({ where: { accountId: id } }), tx.budgetLine.count({ where: { accountId: id } })]);
  if (blockers.some(Boolean)) throw new AccountDirectoryError("لا يمكن حذف حساب له فروع أو حركات أو روابط محاسبية؛ يمكن إيقاف حساب الحركة عند الحاجة", 409);
  await tx.account.delete({ where: { id } });
  await tx.companyConfiguration.deleteMany({ where: { category, configKey: String(id) } });
  await audit(tx, { action: "ACCOUNT_DELETE", entityType: "ACCOUNT", entityId: id, userId, metadata: { before: account } });
  return { deleted: true, id };
}
