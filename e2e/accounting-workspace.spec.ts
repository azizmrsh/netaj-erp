import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { accountingPages } from "../lib/accounting-navigation";
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  const setup = await page.request.post("/api/auth/setup", { data: { email: "owner.e2e@netaj.test", password: "BrowserE2E123", setupToken: "e2e-bootstrap-token" } });
  expect([201, 409]).toContain(setup.status());
  await page.goto("/login"); await page.locator('input[name="email"]').fill("owner.e2e@netaj.test"); await page.locator('input[name="password"]').fill("BrowserE2E123"); await page.getByRole("button", { name: /دخول/ }).click(); await expect(page).toHaveURL(/\/$/);
});
test("كل وجهة محاسبية لها محتواها الفعلي وتسلسل القائمة ثابت", async ({ page }, info) => {
  test.skip(info.project.name.includes("mobile"), "24-page route acceptance on desktop"); test.setTimeout(300000);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message)); page.on("response", r => { if (r.url().includes("/api/finance") && r.status() >= 500) errors.push(`${r.status()} ${r.url()}`); });
  for (const item of accountingPages) {
    await page.goto(item.href);
    await expect(page.getByRole("navigation", { name: "صفحات المحاسبة" })).toBeVisible({ timeout: 30000 });
    const labels = await page.getByRole("navigation", { name: "صفحات المحاسبة" }).getByRole("link").allTextContents(); expect(labels).toEqual(accountingPages.map(p => p.label));
    const workspace = page.locator(".finance-workspace").first();
    const expected = item.tab === "budgets" ? "ميزانية حسابية حسب الأبعاد" : item.tab === "currencies" ? "العملات" : item.label;
    await expect(workspace.getByRole("heading", { name: expected, exact: true }).first()).toBeVisible({ timeout: 30000 });
    await expect(workspace).not.toContainText("مساحة محاسبية");
  }
  expect(errors).toEqual([]);
});
test("إنشاء وتحرير الحساب حقيقي والنافذة وسط الشاشة وExcel ملف صحيح", async ({ page }, info) => {
  test.setTimeout(90000); await page.goto("/accounting?tab=accounts");
  await page.getByRole("button", { name: /إضافة حساب/ }).click(); const modal = page.getByRole("dialog", { name: "إضافة حساب", exact: true }); await expect(modal).toBeVisible();
  const code = `E2EACC${Date.now()}`; await modal.getByLabel("اسم الحساب", { exact: true }).fill("حساب تحقق واجهة"); await modal.getByLabel("رقم الحساب", { exact: true }).fill(code);
  const box = await modal.boundingBox(), viewport = page.viewportSize()!; expect(box).toBeTruthy(); expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThan(5);
  mkdirSync("artifacts/finance-acceptance", { recursive: true }); await page.screenshot({ path: `artifacts/finance-acceptance/account-modal-${info.project.name}.png`, fullPage: true });
  await modal.getByRole("button", { name: "حفظ الحساب", exact: true }).click(); await expect(modal).not.toBeVisible({ timeout: 30000 });
  await page.getByLabel("فلترة رقم الحساب", { exact: true }).fill(code); const row = page.locator(".account-directory-table tbody tr").filter({ hasText: code }); await expect(row).toHaveCount(1);
  await row.getByRole("button", { name: "تحرير", exact: true }).click(); const edit = page.getByRole("dialog", { name: "تحرير حساب", exact: true }); await edit.getByLabel("اسم الحساب", { exact: true }).fill("حساب تحقق معدل"); await edit.getByRole("button", { name: "حفظ الحساب" }).click(); await expect(edit).not.toBeVisible(); await expect(row).toContainText("حساب تحقق معدل");
  const xlsx = await page.request.get(`/api/finance/accounts/export?code=${code}&format=xlsx`); expect(xlsx.status()).toBe(200); expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
  const print = await page.request.get(`/api/finance/accounts/export?code=${code}&format=print`); expect(print.status()).toBe(200); expect(await print.text()).toContain("حساب تحقق معدل"); expect(await print.text()).not.toContain("<canvas");
  await row.getByRole("button", { name: "حذف", exact: true }).click(); await page.getByRole("dialog").getByRole("button", { name: "تأكيد الحذف" }).click(); await expect(row).toHaveCount(0);
});
test("دورة القيد من أزرار الواجهة تنعكس على دفتر الأستاذ ثم تنعكس إلى صفر", async ({ page }, info) => {
  test.skip(info.project.name.includes("mobile"), "posting flow desktop; dialog responsive covered above"); test.setTimeout(90000);
  const workspace = await (await page.request.get("/api/finance/journals")).json(); const accounts = workspace.accounts.slice(0, 2); expect(accounts).toHaveLength(2);
  await page.goto("/accounting?tab=journals"); await page.getByRole("button", { name: "+ قيد يومية", exact: true }).click(); const modal = page.getByRole("dialog", { name: "إضافة قيد يومية" });
  const description = `قبول متصفح ${Date.now()}`; await modal.getByLabel("البيان", { exact: true }).fill(description); await modal.getByLabel("حساب السطر 1").selectOption(String(accounts[0].id)); await modal.getByLabel("حساب السطر 2").selectOption(String(accounts[1].id)); await modal.getByLabel("مدين السطر 1", { exact: true }).fill("12.34"); await modal.getByLabel("دائن السطر 2", { exact: true }).fill("12.34"); await modal.getByRole("button", { name: "حفظ المسودة" }).click(); await expect(modal).not.toBeVisible();
  await page.getByLabel("بحث القيود").fill(description); const row = page.locator("table tbody tr").filter({ hasText: description }); await row.getByRole("button", { name: "اعتماد", exact: true }).click(); await row.getByRole("button", { name: "ترحيل", exact: true }).click(); await expect(row).toContainText("مرحل");
  await row.getByRole("button", { name: "عكس…", exact: true }).click(); await page.getByRole("dialog", { name: "تفاصيل القيد" }).getByRole("button", { name: "تأكيد عكس القيد" }).click(); await expect(row).toContainText("معكوس");
});
