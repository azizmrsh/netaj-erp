import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { PlatformError } from "@/lib/platform";
import { assertTenantLimit } from "@/lib/saas";

export async function listTenantUsers(tx: Prisma.TransactionClient, tenantId: number) {
  return tx.tenantMembership.findMany({
    where: { tenantId },
    include: {
      user: { select: { id: true, email: true, name: true, status: true, locale: true, mfaEnabled: true, createdAt: true } },
      companies: { include: { company: { select: { id: true, code: true, legalNameAr: true } } } },
      roles: { include: { role: { include: { permissions: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createTenantUser(
  tx: Prisma.TransactionClient,
  tenantId: number,
  input: Record<string, unknown>
) {
  await assertTenantLimit(tx, tenantId, "USERS");
  const email = String(input.email ?? "").trim().toLowerCase();
  const name = String(input.name ?? "").trim();
  const password = String(input.password ?? "");
  const companyId = Number(input.companyId);
  const permissionKeys = Array.isArray(input.permissionKeys)
    ? [...new Set(input.permissionKeys.map((key) => String(key)))]
    : [];
  if (!/^\S+@\S+\.\S+$/.test(email) || !name) throw new PlatformError("الاسم والبريد الصحيحان مطلوبان", "INVALID_USER", 400);
  if (password.length < 12 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new PlatformError("كلمة المرور يجب أن تكون 12 حرفًا على الأقل وتضم حروفًا وأرقامًا", "WEAK_PASSWORD", 400);
  }
  const company = await tx.company.findFirst({ where: { id: companyId, tenantId, isActive: true } });
  if (!company) throw new PlatformError("الشركة لا تتبع المستأجر الحالي", "COMPANY_SCOPE_VIOLATION", 403);
  const existing = await tx.platformUser.findUnique({ where: { email } });
  if (existing) throw new PlatformError("البريد مستخدم بالفعل", "DUPLICATE_USER", 409);
  const permissions = await tx.permission.findMany({ where: { key: { in: permissionKeys } } });
  if (permissions.length !== permissionKeys.length) throw new PlatformError("توجد صلاحية غير معروفة", "INVALID_PERMISSION", 400);

  return tx.platformUser.create({
    data: {
      email,
      name,
      passwordHash: await bcrypt.hash(password, 12),
      memberships: {
        create: {
          tenantId,
          defaultCompanyId: companyId,
          companies: { create: { companyId, isDefault: true } },
          roles: {
            create: {
              role: {
                create: {
                  tenantId,
                  companyId,
                  code: `USER-${Date.now().toString(36).toUpperCase()}`,
                  name: `صلاحيات ${name}`,
                  permissions: { create: permissions.map((permission) => ({ permissionKey: permission.key })) },
                },
              },
            },
          },
        },
      },
    },
    select: { id: true, email: true, name: true, status: true },
  });
}
