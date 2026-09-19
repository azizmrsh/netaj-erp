import type { Prisma } from "@prisma/client";
import { activeSubscription, assertTenantLimit } from "@/lib/saas";
import { PlatformError } from "@/lib/platform-error";
export { PlatformError } from "@/lib/platform-error";

const companyInclude = {
  group: true,
  country: true,
  baseCurrency: true,
  language: true,
  timeZone: true,
  branches: { orderBy: [{ isMain: "desc" as const }, { code: "asc" as const }] },
  warehouses: { orderBy: [{ isMain: "desc" as const }, { code: "asc" as const }] },
  departments: { orderBy: { code: "asc" as const } },
  costCenters: { orderBy: { code: "asc" as const } },
  modules: { include: { module: true }, orderBy: { moduleKey: "asc" as const } },
  localizations: { include: { localizationPack: true } },
} satisfies Prisma.CompanyInclude;

function requiredText(value: unknown, label: string) {
  const result = String(value ?? "").trim();
  if (!result) throw new PlatformError(`${label} مطلوب`, "VALIDATION_ERROR");
  return result;
}

export async function getTenantWorkspace(tx: Prisma.TransactionClient, tenantId: number, membershipId?: number) {
  const companyIds = membershipId
    ? (await tx.companyAccess.findMany({ where: { membershipId }, select: { companyId: true } })).map((row) => row.companyId)
    : undefined;
  const tenant = await tx.tenant.findUnique({
    where: { id: tenantId },
    include: {
      groups: { orderBy: { code: "asc" } },
      companies: { where: companyIds ? { id: { in: companyIds } } : undefined, include: companyInclude, orderBy: { code: "asc" } },
      subscriptions: {
        where: { status: { in: ["ACTIVE", "TRIAL"] } },
        include: { plan: { include: { modules: { include: { module: true } } } } },
        orderBy: { startsAt: "desc" },
        take: 1,
      },
    },
  });
  if (!tenant) throw new PlatformError("المستأجر غير موجود", "TENANT_NOT_FOUND", 404);

  const [countries, currencies, languages, timeZones, moduleDefinitions] = await Promise.all([
    tx.country.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    tx.currency.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    tx.language.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    tx.timeZone.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    tx.moduleDefinition.findMany({ orderBy: [{ isCore: "desc" }, { key: "asc" }] }),
  ]);

  return { tenant, countries, currencies, languages, timeZones, moduleDefinitions };
}

export async function createCompany(
  tx: Prisma.TransactionClient,
  tenantId: number,
  input: Record<string, unknown>
) {
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant) throw new PlatformError("المستأجر غير موجود", "TENANT_NOT_FOUND", 404);
  const subscription = await activeSubscription(tx, tenantId);
  if (subscription) await assertTenantLimit(tx, tenantId, "COMPANIES");
  else if (await tx.company.count({ where: { tenantId, isActive: true } })) throw new PlatformError("يجب تفعيل اشتراك قبل إضافة شركة أخرى", "SUBSCRIPTION_REQUIRED", 402);

  const code = requiredText(input.code, "رمز الشركة").toUpperCase();
  const legalNameAr = requiredText(input.legalNameAr, "الاسم القانوني");
  const countryCode = String(input.countryCode ?? "SA").trim().toUpperCase();
  const baseCurrencyCode = String(input.baseCurrencyCode ?? "SAR").trim().toUpperCase();
  const defaultLanguageCode = String(input.defaultLanguageCode ?? "ar").trim();
  const timeZoneName = String(input.timeZoneName ?? "Asia/Riyadh").trim();

  const [country, currency, language, timeZone] = await Promise.all([
    tx.country.findUnique({ where: { code: countryCode } }),
    tx.currency.findUnique({ where: { code: baseCurrencyCode } }),
    tx.language.findUnique({ where: { code: defaultLanguageCode } }),
    tx.timeZone.findUnique({ where: { name: timeZoneName } }),
  ]);
  if (!country || !currency || !language || !timeZone) {
    throw new PlatformError("إعدادات الدولة أو العملة أو اللغة أو المنطقة الزمنية غير صالحة", "INVALID_LOCALIZATION");
  }

  const existing = await tx.company.findUnique({ where: { tenantId_code: { tenantId, code } } });
  if (existing) throw new PlatformError("رمز الشركة مستخدم داخل هذا المستأجر", "DUPLICATE_COMPANY", 409);

  const groupId = input.groupId ? Number(input.groupId) : null;
  if (groupId) {
    const group = await tx.companyGroup.findFirst({ where: { id: groupId, tenantId } });
    if (!group) throw new PlatformError("المجموعة لا تتبع المستأجر الحالي", "GROUP_SCOPE_VIOLATION", 403);
  }

  const enabledModules = await tx.moduleDefinition.findMany({ where: { isCore: true } });
  const company = await tx.company.create({
    data: {
      tenantId,
      groupId,
      code,
      legalNameAr,
      legalNameEn: String(input.legalNameEn ?? "").trim() || null,
      tradeName: String(input.tradeName ?? "").trim() || null,
      countryCode,
      baseCurrencyCode,
      defaultLanguageCode,
      timeZoneName,
      vatNumber: String(input.vatNumber ?? "").trim() || null,
      modules: {
        create: enabledModules.map((definition) => ({ moduleKey: definition.key, enabled: true })),
      },
    },
  });
  const branch = await tx.branch.create({
    data: { companyId: company.id, code: "MAIN", nameAr: "الفرع الرئيسي", nameEn: "Main Branch", isMain: true },
  });
  await tx.warehouse.create({
    data: {
      companyId: company.id,
      branchId: branch.id,
      code: "MAIN",
      nameAr: "المستودع الرئيسي",
      nameEn: "Main Warehouse",
      isMain: true,
    },
  });
  return tx.company.findUniqueOrThrow({ where: { id: company.id }, include: companyInclude });
}

export async function setCompanyModule(
  tx: Prisma.TransactionClient,
  tenantId: number,
  companyId: number,
  moduleKey: string,
  enabled: boolean
) {
  const company = await tx.company.findFirst({ where: { id: companyId, tenantId } });
  if (!company) throw new PlatformError("الشركة غير موجودة ضمن المستأجر الحالي", "COMPANY_SCOPE_VIOLATION", 404);

  const moduleDefinition = await tx.moduleDefinition.findUnique({ where: { key: moduleKey } });
  if (!moduleDefinition) throw new PlatformError("الوحدة غير معروفة", "MODULE_NOT_FOUND", 404);
  if (moduleDefinition.isCore && !enabled) {
    throw new PlatformError("لا يمكن تعطيل الوحدة الأساسية", "CORE_MODULE_REQUIRED", 409);
  }

  return tx.companyModule.upsert({
    where: { companyId_moduleKey: { companyId, moduleKey } },
    update: { enabled },
    create: { companyId, moduleKey, enabled },
    include: { module: true },
  });
}

export async function assertMembershipPermission(
  tx: Prisma.TransactionClient,
  input: { membershipId: number; tenantId: number; companyId?: number; permissionKey: string }
) {
  const membership = await tx.tenantMembership.findFirst({
    where: { id: input.membershipId, tenantId: input.tenantId, status: "ACTIVE" },
    include: {
      roles: {
        include: {
          role: { include: { permissions: true } },
        },
      },
    },
  });
  if (!membership) throw new PlatformError("عضوية غير صالحة للمستأجر", "TENANT_SCOPE_VIOLATION", 403);

  const granted = membership.roles.some(({ role }) =>
    (!role.companyId || role.companyId === input.companyId) &&
    role.permissions.some((permission) => permission.permissionKey === input.permissionKey && permission.granted)
  );
  if (!granted) throw new PlatformError("لا توجد صلاحية لتنفيذ الإجراء", "PERMISSION_DENIED", 403);
  return membership;
}

export function platformErrorResponse(error: unknown) {
  if (error instanceof PlatformError) return { status: error.status, message: error.message, code: error.code };
  return { status: 500, message: "تعذر تنفيذ عملية إعدادات المؤسسة", code: "INTERNAL_ERROR" };
}
