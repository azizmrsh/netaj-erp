import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  assertMembershipPermission,
  createCompany,
  getTenantWorkspace,
  PlatformError,
  setCompanyModule,
} from "../lib/platform.ts";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "netaj-platform-test-"));
const databasePath = join(temporaryDirectory, "platform.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });

let secondTenantId;
let secondCompanyId;

before(async () => {
  const tenant = await prisma.tenant.create({ data: { slug: "isolation-test", name: "Isolation Test" } });
  secondTenantId = tenant.id;
  const company = await prisma.$transaction((tx) =>
    createCompany(tx, tenant.id, {
      code: "ISO",
      legalNameAr: "شركة اختبار العزل",
      legalNameEn: "Isolation Company",
      countryCode: "SA",
      baseCurrencyCode: "SAR",
      defaultLanguageCode: "ar",
      timeZoneName: "Asia/Riyadh",
    })
  );
  secondCompanyId = company.id;
});

after(async () => {
  await prisma.$disconnect();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("ترحيل SaaS يحفظ NETAj كشركة افتراضية كاملة", async () => {
  const workspace = await prisma.$transaction((tx) => getTenantWorkspace(tx, 1));
  const netaj = workspace.tenant.companies.find((company) => company.code === "NETAJ");
  assert.ok(netaj);
  assert.equal(netaj.countryCode, "SA");
  assert.equal(netaj.baseCurrencyCode, "SAR");
  assert.equal(netaj.branches.length, 1);
  assert.equal(netaj.warehouses.length, 1);
  assert.ok(netaj.modules.some((row) => row.moduleKey === "CORE" && row.enabled));
});

test("إنشاء شركة يضيف الفرع والمستودع والوحدات الأساسية فعليًا", async () => {
  const company = await prisma.company.findUnique({
    where: { id: secondCompanyId },
    include: { branches: true, warehouses: true, modules: true },
  });
  assert.equal(company.tenantId, secondTenantId);
  assert.equal(company.branches.length, 1);
  assert.equal(company.warehouses.length, 1);
  assert.ok(company.modules.some((row) => row.moduleKey === "CORE" && row.enabled));
});

test("استعلام مساحة المستأجر لا يسرب شركات مستأجر آخر", async () => {
  const first = await prisma.$transaction((tx) => getTenantWorkspace(tx, 1));
  const second = await prisma.$transaction((tx) => getTenantWorkspace(tx, secondTenantId));
  assert.ok(first.tenant.companies.every((company) => company.tenantId === 1));
  assert.ok(second.tenant.companies.every((company) => company.tenantId === secondTenantId));
  assert.equal(first.tenant.companies.some((company) => company.id === secondCompanyId), false);
});

test("تحديث الوحدات يرفض شركة من tenant آخر ولا يعطل Core", async () => {
  await assert.rejects(
    prisma.$transaction((tx) => setCompanyModule(tx, 1, secondCompanyId, "SALES", true)),
    (error) => error instanceof PlatformError && error.code === "COMPANY_SCOPE_VIOLATION"
  );
  await assert.rejects(
    prisma.$transaction((tx) => setCompanyModule(tx, secondTenantId, secondCompanyId, "CORE", false)),
    (error) => error instanceof PlatformError && error.code === "CORE_MODULE_REQUIRED"
  );
});

test("RBAC يمنح الصلاحية داخل tenant والشركة فقط", async () => {
  const permission = await prisma.permission.upsert({
    where: { key: "SALES.APPROVE" },
    update: {},
    create: { key: "SALES.APPROVE", moduleKey: "SALES", action: "APPROVE" },
  });
  const user = await prisma.platformUser.create({ data: { email: "isolation@example.test", name: "Isolation User" } });
  const membership = await prisma.tenantMembership.create({ data: { tenantId: secondTenantId, userId: user.id } });
  const role = await prisma.role.create({
    data: {
      tenantId: secondTenantId,
      companyId: secondCompanyId,
      code: "SALES_APPROVER",
      name: "Sales Approver",
      permissions: { create: { permissionKey: permission.key } },
      memberships: { create: { membershipId: membership.id } },
    },
  });
  assert.ok(role.id > 0);

  const allowed = await prisma.$transaction((tx) =>
    assertMembershipPermission(tx, {
      membershipId: membership.id,
      tenantId: secondTenantId,
      companyId: secondCompanyId,
      permissionKey: permission.key,
    })
  );
  assert.equal(allowed.id, membership.id);

  await assert.rejects(
    prisma.$transaction((tx) =>
      assertMembershipPermission(tx, {
        membershipId: membership.id,
        tenantId: 1,
        companyId: 1,
        permissionKey: permission.key,
      })
    ),
    (error) => error instanceof PlatformError && error.code === "TENANT_SCOPE_VIOLATION"
  );
});
