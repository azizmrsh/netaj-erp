import { expect, test } from "@playwright/test";

const email = "owner.e2e@netaj.test", password = "BrowserE2E123";
test.describe.configure({ mode: "serial" });
test.beforeEach(async ({ page }) => {
  const setup = await page.request.post("/api/auth/setup", { data: { email, password, setupToken: "e2e-bootstrap-token" } });
  if (![201, 409].includes(setup.status())) throw new Error(await setup.text());
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button", { name: /دخول/ }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("تسجيل الدخول والتنقل التشغيلي يعرضان بيانات فعلية دون أخطاء متصفح", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("heading", { name: "قيادة أعمالك من صورة واحدة واضحة" })).toBeVisible();
  await page.goto("/inventory");
  await expect(page.getByRole("heading", { name: /المخزون/ })).toBeVisible();
  await page.goto("/sales");
  await expect(page.locator("body")).toContainText("المبيعات");
  expect(errors).toEqual([]);
});

test("المسارات المحمية وIDOR لا يمكن تجاوزهما من سياق بلا جلسة", async ({ browser, baseURL }) => {
  const isolated = await browser.newContext(), response = await isolated.request.get(`${baseURL}/api/parties/1`);
  expect(response.status()).toBe(401);
  const page = await isolated.newPage();
  await page.goto(`${baseURL}/inventory`);
  await expect(page).toHaveURL(/\/login\?next=/);
  await isolated.close();
});

test("واجهات الوحدات الأساسية تعمل داخل الغلاف المؤسسي", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop project only");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeVisible();
  for (const route of ["/sales", "/purchases", "/notes", "/transport", "/accounting", "/reports", "/imports", "/projects", "/items", "/parties", "/settings/design"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("البحث والترقيم يعيدان عقود API قابلة للتوسع", async ({ page }) => {
  for (const [path, key] of [["/api/items?page=1&pageSize=10&q=", "items"], ["/api/parties?page=1&pageSize=10&q=", "parties"]] as const) {
    const {ok,status,body}=await page.evaluate(async url=>{const response=await fetch(url),body=await response.json();return{ok:response.ok,status:response.status,body}},path);
    expect(ok, `${path}: ${status} ${JSON.stringify(body)}`).toBeTruthy();
    expect(Array.isArray(body[key])).toBeTruthy();
    expect(body.pagination).toMatchObject({ page: 1, pageSize: 10 });
    expect(body.pagination.total).toBeGreaterThanOrEqual(0);
  }
  await page.getByLabel("البحث الشامل").fill("NETAj");
  await page.getByLabel("البحث الشامل").press("Enter");
  await expect(page).toHaveURL(/\/search\?q=NETAj/);
  await expect(page.getByRole("heading", { name: "البحث الشامل" })).toBeVisible();
});

test("مصمم المستندات يوفر سحبًا وإفلاتًا ومعاينة فعلية", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop project only");
  await page.goto("/settings/design");
  await expect(page.getByText("المصمم المرئي")).toBeVisible();
  const source = page.getByRole("button", { name: /رقم المستند/ }), target = page.getByRole("button", { name: /التاريخ/ });
  await source.dragTo(target);
  await expect(page.getByText("معاينة المستند")).toBeVisible();
});

test("الواجهة الحرجة قابلة للاستخدام على شاشة هاتف", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile project only");
  await expect(page.getByRole("heading", { name: "قيادة أعمالك من صورة واحدة واضحة" })).toBeVisible();
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeVisible();
  await page.getByRole("navigation", { name: "القائمة الرئيسية" }).getByRole("link", { name: "المخزون", exact: true }).click();
  await expect(page.getByRole("heading", { name: /المخزون/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: "بوابة العملاء والموردين" })).toBeVisible();
});
