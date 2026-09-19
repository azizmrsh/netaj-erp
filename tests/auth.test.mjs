import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import {
  AuthError,
  authenticateCredentials,
  completeInitialSetup,
  requireAuthorization,
  resolveAuthContext,
  revokeSession,
  switchSessionCompany,
} from "../lib/auth.ts";
import { createCompany } from "../lib/platform.ts";

const temporaryDirectory = mkdtempSync(join(tmpdir(), "netaj-auth-test-"));
const databasePath = join(temporaryDirectory, "auth.test.db");
copyFileSync("prisma/netaj.db", databasePath);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${databasePath}` }) });
const email = "admin.auth@example.test";
const password = "StrongPassword123";
let token;
let foreignCompanyId;

before(async () => {
  // The production-like fixture may already be configured by a prior smoke run.
  // Reset identity credentials only inside this disposable database copy so the
  // one-time bootstrap contract is tested without depending on live DB state.
  await prisma.authSession.deleteMany();
  await prisma.platformAdministrator.deleteMany();
  await prisma.platformUser.updateMany({ data: { email: "pending.auth@example.test", passwordHash: null, mfaEnabled: false } });
  await prisma.$transaction((tx) => completeInitialSetup(tx, { email, password }));
  const login = await prisma.$transaction((tx) => authenticateCredentials(tx, { email, password }));
  token = login.token;
  const tenant = await prisma.tenant.create({ data: { slug: "foreign-auth", name: "Foreign Tenant" } });
  const company = await prisma.$transaction((tx) => createCompany(tx, tenant.id, { code: "FOREIGN", legalNameAr: "شركة أخرى" }));
  foreignCompanyId = company.id;
});

after(async () => {
  await prisma.$disconnect();
  rmSync(temporaryDirectory, { recursive: true, force: true });
});

test("الإعداد الأولي يعمل مرة واحدة فقط ويحفظ hash", async () => {
  const user = await prisma.platformUser.findUnique({ where: { email } });
  assert.ok(user.passwordHash);
  assert.notEqual(user.passwordHash, password);
  await assert.rejects(
    prisma.$transaction((tx) => completeInitialSetup(tx, { email: "second@example.test", password })),
    (error) => error instanceof AuthError && error.code === "SETUP_ALREADY_COMPLETED"
  );
});

test("تسجيل الدخول يرفض كلمة المرور الخاطئة وينشئ جلسة opaque صحيحة", async () => {
  await assert.rejects(
    prisma.$transaction((tx) => authenticateCredentials(tx, { email, password: "wrong-password" })),
    (error) => error instanceof AuthError && error.code === "INVALID_CREDENTIALS"
  );
  const context = await prisma.$transaction((tx) => resolveAuthContext(tx, token));
  assert.equal(context.tenantId, 1);
  assert.equal(context.companyId, 1);
  assert.equal(context.companyCode, "NETAJ");
});

test("RBAC واشتراك الوحدة يجيزان القراءة المصرح بها", async () => {
  const context = await prisma.$transaction((tx) =>
    requireAuthorization(tx, token, { moduleKey: "INVENTORY", action: "READ" })
  );
  assert.equal(context.companyId, 1);
});

test("تبديل الشركة عبر ID مباشر يرفض شركة tenant آخر", async () => {
  await assert.rejects(
    prisma.$transaction((tx) => switchSessionCompany(tx, token, foreignCompanyId)),
    (error) => error instanceof AuthError && error.code === "COMPANY_ACCESS_DENIED"
  );
});

test("إلغاء الجلسة يمنع استخدامها فورًا", async () => {
  const login = await prisma.$transaction((tx) => authenticateCredentials(tx, { email, password }));
  await prisma.$transaction((tx) => revokeSession(tx, login.token));
  await assert.rejects(
    prisma.$transaction((tx) => resolveAuthContext(tx, login.token)),
    (error) => error instanceof AuthError && error.code === "INVALID_SESSION"
  );
});
