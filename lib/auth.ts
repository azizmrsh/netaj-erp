import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { SESSION_COOKIE } from "@/lib/auth-constants";
import { MfaError, verifyUserMfa } from "@/lib/mfa";

export { SESSION_COOKIE };
const SESSION_DAYS = 7;

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 401
  ) {
    super(message);
  }
}

export type AuthRequirement = {
  moduleKey: string;
  action:
    | "READ"
    | "CREATE"
    | "UPDATE"
    | "POST"
    | "CANCEL"
    | "APPROVE"
    | "MANAGE"
    | "UPLOAD"
    | "PREVIEW"
    | "EXECUTE"
    | "UPDATE_EXISTING"
    | "ACCOUNTING_IMPORT"
    | "ROLLBACK"
    | "PUBLISH";
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(left: string, right: string) {
  const first = Buffer.from(left);
  const second = Buffer.from(right);
  return first.length === second.length && timingSafeEqual(first, second);
}

export function sessionTokenFromRequest(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export async function completeInitialSetup(
  tx: Prisma.TransactionClient,
  input: { email: unknown; password: unknown; setupToken?: unknown }
) {
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new AuthError("البريد الإلكتروني غير صالح", "INVALID_EMAIL", 400);
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new AuthError("كلمة المرور يجب أن تكون 12 حرفًا على الأقل وتضم حروفًا وأرقامًا", "WEAK_PASSWORD", 400);
  }

  if (process.env.NODE_ENV === "production") {
    const configured = process.env.AUTH_BOOTSTRAP_TOKEN ?? "";
    const supplied = String(input.setupToken ?? "");
    if (!configured || !safeEqual(configured, supplied)) {
      throw new AuthError("رمز الإعداد الأولي غير صالح", "INVALID_SETUP_TOKEN", 403);
    }
  }

  const unconfigured = await tx.platformUser.findMany({ where: { passwordHash: null, status: "ACTIVE" } });
  const configuredCount = await tx.platformUser.count({ where: { passwordHash: { not: null } } });
  if (configuredCount > 0 || unconfigured.length !== 1) {
    throw new AuthError("تم إغلاق الإعداد الأولي بالفعل", "SETUP_ALREADY_COMPLETED", 409);
  }

  const user = await tx.platformUser.update({
    where: { id: unconfigured[0].id },
    data: { email, passwordHash: await bcrypt.hash(password, 12) },
  });
  await tx.platformAdministrator.upsert({ where: { userId: user.id }, create: { userId: user.id, role: "PLATFORM_OWNER" }, update: { status: "ACTIVE" } });
  return user;
}

export async function authenticateCredentials(
  tx: Prisma.TransactionClient,
  input: { email: unknown; password: unknown; mfaCode?: unknown; companyId?: unknown; userAgent?: string | null; ipAddress?: string | null }
) {
  const email = normalizeEmail(input.email);
  const password = String(input.password ?? "");
  const user = await tx.platformUser.findUnique({
    where: { email },
    include: {
      memberships: {
        where: { status: "ACTIVE" },
        include: { companies: { include: { company: true } } },
      },
    },
  });
  if (!user?.passwordHash || user.status !== "ACTIVE" || !(await bcrypt.compare(password, user.passwordHash))) {
    throw new AuthError("بيانات الدخول غير صحيحة", "INVALID_CREDENTIALS");
  }
  if (user.mfaEnabled) {
    try { await verifyUserMfa(tx, user.id, input.mfaCode); }
    catch (error) {
      if (error instanceof MfaError) throw new AuthError(error.message, error.code, error.status);
      throw error;
    }
  }

  const membership = user.memberships[0];
  if (!membership) throw new AuthError("لا توجد عضوية نشطة للمستخدم", "NO_ACTIVE_MEMBERSHIP", 403);
  const requestedCompanyId = Number(input.companyId ?? membership.defaultCompanyId);
  const access = membership.companies.find((row) => row.companyId === requestedCompanyId && row.company.isActive);
  if (!access) throw new AuthError("لا يوجد وصول إلى الشركة المطلوبة", "COMPANY_ACCESS_DENIED", 403);

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  const session = await tx.authSession.create({
    data: {
      id: randomUUID(),
      tokenHash: hashToken(token),
      userId: user.id,
      membershipId: membership.id,
      companyId: access.companyId,
      expiresAt,
      userAgent: input.userAgent?.slice(0, 500) || null,
      ipAddress: input.ipAddress?.slice(0, 100) || null,
    },
  });
  return { token, expiresAt, session };
}

export async function resolveAuthContext(tx: Prisma.TransactionClient, token: string | null) {
  if (!token) throw new AuthError("يجب تسجيل الدخول", "AUTH_REQUIRED");
  const session = await tx.authSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: true,
      company: { include: { modules: true, entitlements: true } },
      membership: {
        include: {
          tenant: { include: { subscriptions: { include: { plan: { include: { modules: true } } } } } },
          companies: { include: { company: { select: { id: true, code: true, legalNameAr: true, isActive: true } } } },
          roles: { include: { role: { include: { permissions: true } } } },
        },
      },
    },
  });
  const now = new Date();
  if (!session || session.revokedAt || session.expiresAt <= now || session.user.status !== "ACTIVE") {
    throw new AuthError("الجلسة منتهية أو غير صالحة", "INVALID_SESSION");
  }
  if (
    session.company.tenantId !== session.membership.tenantId ||
    !session.membership.companies.some((access) => access.companyId === session.companyId)
  ) {
    throw new AuthError("سياق الشركة لا يتبع العضوية الحالية", "TENANT_SCOPE_VIOLATION", 403);
  }

  const permissions = new Set<string>();
  for (const membershipRole of session.membership.roles) {
    const role = membershipRole.role;
    if (role.tenantId !== session.membership.tenantId || (role.companyId && role.companyId !== session.companyId)) continue;
    for (const permission of role.permissions) if (permission.granted) permissions.add(permission.permissionKey);
  }

  return {
    sessionId: session.id,
    userId: session.userId,
    userName: session.user.name,
    membershipId: session.membershipId,
    tenantId: session.membership.tenantId,
    companyId: session.companyId,
    companyCode: session.company.code,
    availableCompanies: session.membership.companies.filter((access) => access.company.isActive).map((access) => access.company),
    permissions,
    roleCodes: session.membership.roles
      .map((membershipRole) => membershipRole.role)
      .filter((role) => role.tenantId === session.membership.tenantId && (!role.companyId || role.companyId === session.companyId))
      .map((role) => role.code),
    companyModules: new Map(session.company.modules.map((row) => [row.moduleKey, row.enabled])),
    subscription: session.membership.tenant.subscriptions.find(
      (row) =>
        ["ACTIVE", "TRIAL"].includes(row.status) &&
        (!row.endsAt || row.endsAt > now) &&
        (!row.trialEndsAt || row.trialEndsAt > now)
    ),
  };
}

export async function requireAuthorization(
  tx: Prisma.TransactionClient,
  token: string | null,
  requirement: AuthRequirement
) {
  const context = await resolveAuthContext(tx, token);
  if (!context.subscription) throw new AuthError("لا يوجد اشتراك نشط", "SUBSCRIPTION_REQUIRED", 402);

  const planModule = context.subscription.plan.modules.find((row) => row.moduleKey === requirement.moduleKey);
  if (!planModule?.enabled || context.companyModules.get(requirement.moduleKey) !== true) {
    throw new AuthError("الوحدة غير مفعلة للشركة الحالية", "MODULE_DISABLED", 403);
  }

  const permissionKey = `${requirement.moduleKey}.${requirement.action}`;
  if (!context.permissions.has(permissionKey)) {
    throw new AuthError("لا توجد صلاحية لتنفيذ الإجراء", "PERMISSION_DENIED", 403);
  }
  return context;
}

export async function switchSessionCompany(
  tx: Prisma.TransactionClient,
  token: string | null,
  companyId: number
) {
  const context = await resolveAuthContext(tx, token);
  const access = await tx.companyAccess.findUnique({
    where: { membershipId_companyId: { membershipId: context.membershipId, companyId } },
    include: { company: true },
  });
  if (!access || access.company.tenantId !== context.tenantId || !access.company.isActive) {
    throw new AuthError("لا يوجد وصول إلى الشركة المطلوبة", "COMPANY_ACCESS_DENIED", 403);
  }
  await tx.authSession.update({ where: { id: context.sessionId }, data: { companyId, lastSeenAt: new Date() } });
  return access.company;
}

export async function revokeSession(tx: Prisma.TransactionClient, token: string | null) {
  if (!token) return;
  await tx.authSession.updateMany({
    where: { tokenHash: hashToken(token), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) return { status: error.status, message: error.message, code: error.code };
  return { status: 500, message: "تعذر تنفيذ عملية المصادقة", code: "AUTH_INTERNAL_ERROR" };
}
