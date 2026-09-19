import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { ensureFiscalCalendar } from "@/lib/accounting";
import { applyIndustryTemplate, upsertCompanyConfiguration } from "@/lib/configuration";
import { PlatformError } from "@/lib/platform-error";

const text = (value: unknown) => String(value ?? "").trim();
const json = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const periodEnd = (from: Date, period: string) => { const result = new Date(from); if (period === "ANNUAL") result.setFullYear(result.getFullYear() + 1); else result.setMonth(result.getMonth() + 1); return result; };

export async function activeSubscription(tx: Prisma.TransactionClient, tenantId: number) {
  const now = new Date();
  return tx.tenantSubscription.findFirst({ where: { tenantId, status: { in: ["ACTIVE", "TRIAL"] }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, include: { plan: { include: { modules: true, entitlements: true } } }, orderBy: { startsAt: "desc" } });
}

export async function assertTenantLimit(tx: Prisma.TransactionClient, tenantId: number, kind: "USERS" | "COMPANIES" | "STORAGE", additional = 1) {
  const subscription = await activeSubscription(tx, tenantId); if (!subscription) throw new PlatformError("لا يوجد اشتراك نشط", "SUBSCRIPTION_REQUIRED", 402);
  if (kind === "USERS" && subscription.plan.userLimit !== null) { const count = await tx.tenantMembership.count({ where: { tenantId, status: "ACTIVE" } }); if (count + additional > subscription.plan.userLimit) throw new PlatformError("تم بلوغ حد المستخدمين في الخطة", "USER_LIMIT_REACHED", 409); }
  if (kind === "COMPANIES" && subscription.plan.companyLimit !== null) { const count = await tx.company.count({ where: { tenantId, isActive: true } }); if (count + additional > subscription.plan.companyLimit) throw new PlatformError("تم بلوغ حد الشركات في الخطة", "COMPANY_LIMIT_REACHED", 409); }
  if (kind === "STORAGE" && subscription.plan.storageMb !== null) { const rows = await tx.$queryRaw<Array<{ total: bigint | number }>>`SELECT COALESCE(SUM("size"),0) AS total FROM "Attachment" WHERE "tenantId"=${tenantId}`; const used = Number(rows[0]?.total ?? 0); if (used + additional > subscription.plan.storageMb * 1024 * 1024) throw new PlatformError("تم بلوغ حد التخزين في الخطة", "STORAGE_LIMIT_REACHED", 409); }
  return subscription;
}

export async function assertFeatureLimit(tx: Prisma.TransactionClient, tenantId: number, companyId: number, key: string, currentCount: number) {
  const subscription = await activeSubscription(tx, tenantId); if (!subscription) throw new PlatformError("لا يوجد اشتراك نشط", "SUBSCRIPTION_REQUIRED", 402);
  const override = await tx.companyEntitlement.findUnique({ where: { companyId_entitlementKey: { companyId, entitlementKey: key } } });
  const configured = override && (!override.expiresAt || override.expiresAt > new Date()) ? Number(override.value) : Number(json<Record<string, unknown>>(subscription.plan.featureLimitsJson, {})[key]);
  if (Number.isFinite(configured) && configured >= 0 && currentCount + 1 > configured) throw new PlatformError("تم بلوغ حد هذه الميزة في الخطة", "FEATURE_LIMIT_REACHED", 409);
}

export async function requirePlatformAdministrator(tx: Prisma.TransactionClient, userId: number) {
  const administrator = await tx.platformAdministrator.findUnique({ where: { userId } });
  if (!administrator || administrator.status !== "ACTIVE") throw new PlatformError("هذه المساحة مخصصة لإدارة المنصة", "PLATFORM_ADMIN_REQUIRED", 403);
  return administrator;
}

export async function platformWorkspace(tx: Prisma.TransactionClient) {
  const [tenants, plans, subscriptions, administrators, supportGrants, configurations, users, companies] = await Promise.all([
    tx.tenant.findMany({ include: { _count: { select: { companies: true, memberships: true } } }, orderBy: { id: "asc" } }),
    tx.subscriptionPlan.findMany({ include: { modules: true, entitlements: true }, orderBy: { id: "asc" } }),
    tx.tenantSubscription.findMany({ include: { tenant: { select: { slug: true, name: true } }, plan: { select: { code: true, name: true } }, pendingPlan: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" } }),
    tx.platformAdministrator.findMany({ include: { user: { select: { id: true, email: true, name: true } } } }),
    tx.supportAccessGrant.findMany({ include: { administrator: { include: { user: { select: { name: true, email: true } } } }, tenant: { select: { name: true } }, company: { select: { legalNameAr: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    tx.platformConfiguration.findMany({ orderBy: { configKey: "asc" } }), tx.platformUser.count(), tx.company.count(),
  ]);
  return { tenants, plans: plans.map((plan) => ({ ...plan, featureLimits: json(plan.featureLimitsJson, {}) })), subscriptions, administrators, supportGrants: supportGrants.map((grant) => ({ ...grant, scope: json(grant.scopeJson, []) })), configurations: configurations.map((row) => ({ ...row, value: json(row.valueJson, null) })), health: { database: "OK", tenants: tenants.length, companies, users, activeSubscriptions: subscriptions.filter((row) => ["ACTIVE", "TRIAL"].includes(row.status)).length, checkedAt: new Date() } };
}

export async function savePlan(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId: string) {
  const code = text(input.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_"), name = text(input.name), moduleKeys = Array.isArray(input.moduleKeys) ? input.moduleKeys.map(text) : [];
  if (!code || !name) throw new PlatformError("كود واسم الخطة مطلوبان", "INVALID_PLAN");
  const known = await tx.moduleDefinition.findMany({ where: { key: { in: moduleKeys } } }); if (known.length !== new Set(moduleKeys).size) throw new PlatformError("توجد وحدة غير معروفة", "INVALID_MODULE");
  const data = { name, status: ["ACTIVE", "ARCHIVED"].includes(text(input.status).toUpperCase()) ? text(input.status).toUpperCase() : "ACTIVE", userLimit: Number(input.userLimit) > 0 ? Number(input.userLimit) : null, companyLimit: Number(input.companyLimit) > 0 ? Number(input.companyLimit) : null, storageMb: Number(input.storageMb) > 0 ? Number(input.storageMb) : null, monthlyPrice: Math.max(0, Number(input.monthlyPrice) || 0), annualPrice: Math.max(0, Number(input.annualPrice) || 0), currencyCode: text(input.currencyCode).toUpperCase() || "SAR", trialDays: Math.max(0, Number(input.trialDays) || 0), featureLimitsJson: JSON.stringify(input.featureLimits && typeof input.featureLimits === "object" ? input.featureLimits : {}) };
  const plan = await tx.subscriptionPlan.upsert({ where: { code }, create: { code, ...data }, update: data });
  await tx.planModule.deleteMany({ where: { planId: plan.id } }); for (const moduleKey of moduleKeys) await tx.planModule.create({ data: { planId: plan.id, moduleKey, enabled: true } });
  for (const [entitlementKey, value] of [["USERS_MAX", data.userLimit], ["COMPANIES_MAX", data.companyLimit], ["STORAGE_MB", data.storageMb]] as const) await tx.planEntitlement.upsert({ where: { planId_entitlementKey: { planId: plan.id, entitlementKey } }, create: { planId: plan.id, entitlementKey, value: String(value ?? -1) }, update: { value: String(value ?? -1) } });
  await audit(tx, { action: "SAAS_PLAN_SAVE", entityType: "SUBSCRIPTION_PLAN", entityId: plan.id, userId, metadata: { code, moduleKeys } }); return plan;
}

export async function changeSubscription(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId: string) {
  const tenantId = Number(input.tenantId), planId = Number(input.planId), billingPeriod = text(input.billingPeriod).toUpperCase() === "ANNUAL" ? "ANNUAL" : "MONTHLY";
  const [tenant, plan, current] = await Promise.all([tx.tenant.findUnique({ where: { id: tenantId } }), tx.subscriptionPlan.findUnique({ where: { id: planId } }), activeSubscription(tx, tenantId)]); if (!tenant || !plan || plan.status !== "ACTIVE") throw new PlatformError("المستأجر أو الخطة غير صالح", "INVALID_SUBSCRIPTION");
  const now = new Date(), effective = text(input.effective).toUpperCase();
  if (current && effective !== "IMMEDIATE") { const at = current.currentPeriodEnd ?? current.endsAt ?? periodEnd(now, current.billingPeriod); const scheduled = await tx.tenantSubscription.update({ where: { id: current.id }, data: { pendingPlanId: plan.id, changeEffectiveAt: at, cancelAtPeriodEnd: false } }); await audit(tx, { action: "SAAS_PLAN_CHANGE_SCHEDULE", entityType: "TENANT_SUBSCRIPTION", entityId: current.id, userId, metadata: { planId, effectiveAt: at } }); return scheduled; }
  if (current) await tx.tenantSubscription.update({ where: { id: current.id }, data: { status: "SUPERSEDED", endsAt: now } });
  const status = Boolean(input.trial) ? "TRIAL" : "ACTIVE", end = periodEnd(now, billingPeriod), created = await tx.tenantSubscription.create({ data: { tenantId, planId, status, startsAt: now, trialEndsAt: status === "TRIAL" ? new Date(now.getTime() + plan.trialDays * 86400000) : null, billingPeriod, currentPeriodStart: now, currentPeriodEnd: end, renewsAt: end } });
  await audit(tx, { action: "SAAS_SUBSCRIPTION_CHANGE", entityType: "TENANT_SUBSCRIPTION", entityId: created.id, userId, metadata: { tenantId, planId, billingPeriod, status, paymentProvider: "NOT_CONFIGURED" } }); return created;
}

export async function saveSupportGrant(tx: Prisma.TransactionClient, administratorId: number, input: Record<string, unknown>, userId: string) {
  const tenantId = Number(input.tenantId), companyId = input.companyId ? Number(input.companyId) : null, expiresAt = new Date(String(input.expiresAt)); if (!text(input.reason) || !text(input.approvedBy) || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new PlatformError("سبب وموافق وانتهاء مستقبلي مطلوبة", "INVALID_SUPPORT_GRANT");
  const tenant = await tx.tenant.findUnique({ where: { id: tenantId } }); if (!tenant) throw new PlatformError("المستأجر غير موجود", "TENANT_NOT_FOUND", 404); if (companyId && !(await tx.company.findFirst({ where: { id: companyId, tenantId } }))) throw new PlatformError("الشركة لا تتبع المستأجر", "COMPANY_SCOPE_VIOLATION", 403);
  const grant = await tx.supportAccessGrant.create({ data: { platformAdminId: administratorId, tenantId, companyId, scopeJson: JSON.stringify(Array.isArray(input.scopes) ? input.scopes.map(text) : ["DIAGNOSTICS"]), reason: text(input.reason), approvedBy: text(input.approvedBy), expiresAt } });
  await audit(tx, { action: "SUPPORT_ACCESS_GRANT", entityType: "SUPPORT_ACCESS_GRANT", entityId: grant.id, userId, metadata: { tenantId, companyId, expiresAt } }); return grant;
}

export async function onboardingWorkspace(tx: Prisma.TransactionClient, tenantId: number, companyId: number) {
  const [session, company, templates, modules, subscription, invitations] = await Promise.all([tx.onboardingSession.upsert({ where: { tenantId_companyId: { tenantId, companyId } }, create: { tenantId, companyId }, update: {} }), tx.company.findFirstOrThrow({ where: { id: companyId, tenantId } }), tx.industryTemplateDefinition.findMany({ where: { isActive: true } }), tx.moduleDefinition.findMany({ orderBy: { key: "asc" } }), activeSubscription(tx, tenantId), tx.userInvitation.findMany({ where: { tenantId, companyId }, orderBy: { createdAt: "desc" } })]);
  return { session: { ...session, data: json(session.dataJson, {}) }, company, templates, modules, allowedModules: subscription?.plan.modules.filter((row) => row.enabled).map((row) => row.moduleKey) ?? [], plan: subscription?.plan ?? null, invitations };
}

export async function saveOnboardingStep(tx: Prisma.TransactionClient, tenantId: number, companyId: number, userId: number, input: Record<string, unknown>) {
  const step = text(input.step).toUpperCase(), data = input.data && typeof input.data === "object" ? input.data as Record<string, unknown> : {};
  const session = await tx.onboardingSession.upsert({ where: { tenantId_companyId: { tenantId, companyId } }, create: { tenantId, companyId, startedBy: userId }, update: {} }); const accumulated = { ...json<Record<string, unknown>>(session.dataJson, {}), [step]: data };
  if (step === "COMPANY") await tx.company.update({ where: { id: companyId }, data: { legalNameAr: text(data.legalNameAr) || undefined, legalNameEn: text(data.legalNameEn) || null, tradeName: text(data.tradeName) || null, vatNumber: text(data.vatNumber) || null } });
  else if (step === "LOCALIZATION") await tx.company.update({ where: { id: companyId }, data: { countryCode: text(data.countryCode).toUpperCase() || undefined, baseCurrencyCode: text(data.baseCurrencyCode).toUpperCase() || undefined, defaultLanguageCode: text(data.defaultLanguageCode) || undefined, timeZoneName: text(data.timeZoneName) || undefined } });
  else if (step === "INDUSTRY") await applyIndustryTemplate(tx, companyId, text(data.templateCode).toUpperCase(), String(userId));
  else if (step === "FISCAL_TAX") { await tx.company.update({ where: { id: companyId }, data: { fiscalYearStartMonth: Math.min(12, Math.max(1, Number(data.fiscalYearStartMonth) || 1)) } }); await upsertCompanyConfiguration(tx, { tenantId, companyId, category: "TAXES", configKey: "VAT", labelAr: "ضريبة القيمة المضافة", value: { enabled: data.vatEnabled !== false, rate: Number(data.vatRate) || 15 } }, String(userId)); await ensureFiscalCalendar(tx, new Date()); }
  else if (step === "MODULES") { const subscription = await activeSubscription(tx, tenantId), allowed = new Set(subscription?.plan.modules.filter((row) => row.enabled).map((row) => row.moduleKey) ?? []), selected = new Set(Array.isArray(data.moduleKeys) ? data.moduleKeys.map(text) : []); for (const moduleKey of allowed) await tx.companyModule.upsert({ where: { companyId_moduleKey: { companyId, moduleKey } }, create: { companyId, moduleKey, enabled: selected.has(moduleKey) || moduleKey === "CORE" }, update: { enabled: selected.has(moduleKey) || moduleKey === "CORE" } }); }
  else if (step === "INVITE") { await assertTenantLimit(tx, tenantId, "USERS"); const email = text(data.email).toLowerCase(), roleCode = text(data.roleCode).toUpperCase() || "USER"; if (!/^\S+@\S+\.\S+$/.test(email)) throw new PlatformError("البريد غير صالح", "INVALID_INVITATION"); const token = randomBytes(32).toString("base64url"), tokenHash = createHash("sha256").update(token).digest("hex"); await tx.userInvitation.create({ data: { tenantId, companyId, email, roleCode, tokenHash, invitedById: userId, expiresAt: new Date(Date.now() + 7 * 86400000) } }); accumulated.INVITE = { email, roleCode, sent: false, note: "يتطلب موفر بريد لإرسال الرابط" }; }
  const complete = step === "COMPLETE"; const updated = await tx.onboardingSession.update({ where: { id: session.id }, data: { currentStep: step, status: complete ? "COMPLETED" : "IN_PROGRESS", dataJson: JSON.stringify(accumulated), completedAt: complete ? new Date() : null } }); await audit(tx, { action: "ONBOARDING_STEP", entityType: "ONBOARDING_SESSION", entityId: session.id, userId: String(userId), metadata: { step, complete } }); return updated;
}
