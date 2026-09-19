import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma } from "@prisma/client";
import { scopePrismaArgs } from "../lib/data-scope.ts";

const scope = { tenantId: 7, companyId: 19 };

test("نطاق القراءة يضاف إلى findMany ولا يزيل الفلاتر الأصلية", () => {
  const args = scopePrismaArgs("findMany", { where: { isActive: true } }, scope);
  assert.deepEqual(args.where, { AND: [{ isActive: true }, scope] });
});

test("المعرّف المباشر لا يستطيع تجاوز نطاق الشركة", () => {
  const args = scopePrismaArgs("findUnique", { where: { id: 44, companyId: 1, tenantId: 1 } }, scope);
  assert.deepEqual(args.where, { id: 44, companyId: 19, tenantId: 7 });
});

test("الإنشاء المتداخل يرث tenant والشركة ويحافظ على Decimal", () => {
  const amount = new Prisma.Decimal("123.45");
  const args = scopePrismaArgs("create", {
    data: { totalAmount: amount, lines: { create: [{ quantity: amount }] } },
  }, scope);
  assert.equal(args.data.tenantId, 7);
  assert.equal(args.data.companyId, 19);
  assert.equal(args.data.totalAmount, amount);
  assert.equal(args.data.lines.create[0].tenantId, 7);
  assert.equal(args.data.lines.create[0].companyId, 19);
  assert.equal(args.data.lines.create[0].quantity, amount);
});

test("التحديث لا يسمح بتغيير حقول النطاق", () => {
  const args = scopePrismaArgs("update", { where: { id: 9 }, data: { tenantId: 1, companyId: 1, notes: "ok" } }, scope);
  assert.equal(args.data.tenantId, undefined);
  assert.equal(args.data.companyId, undefined);
  assert.equal(args.data.notes, "ok");
});
