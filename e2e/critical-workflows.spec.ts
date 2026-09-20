import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

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
  await expect(page.getByRole("heading", { name: "معًا نبني مستقبلًا أكبر" })).toBeVisible();
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

test("فشل التحليلات ينتهي بحالة خطأ قابلة لإعادة المحاولة ولا يترك Skeleton دائمًا", async ({ browser,baseURL },testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"),"request failure simulation is covered by desktop; mobile remains covered by the live dashboard flow");
  const context=await browser.newContext({baseURL,serviceWorkers:"block"}),page=await context.newPage();
  let shouldFail=true;
  await page.route("**/api/analytics?**",async route=>{
    if(shouldFail)await route.fulfill({status:500,contentType:"application/json",body:JSON.stringify({error:"تعذر تحميل التحليلات"})});
    else await route.continue();
  });
  await page.goto("/login");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole("button",{name:/دخول/}).click();
  await expect(page.getByRole("heading",{name:"تعذر إكمال لوحة التحليلات"})).toBeVisible();
  await expect(page.getByLabel("Loading")).toHaveCount(0);
  shouldFail=false;
  await page.getByRole("button",{name:/إعادة المحاولة/}).click();
  await expect(page.locator(".reference-kpi")).toHaveCount(5);
  await expect(page.getByRole("heading",{name:"تعذر إكمال لوحة التحليلات"})).toHaveCount(0);
  await context.close();
});

test("واجهات الوحدات الأساسية تعمل داخل الغلاف المؤسسي", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop project only");
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeVisible();
  for (const route of ["/sales", "/purchases", "/notes", "/transport", "/accounting", "/reports", "/imports", "/projects", "/items", "/parties", "/operations", "/notifications", "/settings/design"]) {
    await page.goto(route, { waitUntil: "domcontentloaded" });
    await expect(page.locator("main").first()).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("التنقل المتكرر بين الوحدات لا يوقف خادم الإنتاج", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop navigation stress only");
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  const routes=["/","/accounting","/sales","/purchases","/inventory","/factory","/notes","/transport","/reports","/hr"];
  for(let pass=0;pass<3;pass++)for(const route of routes){const response=await page.goto(route,{waitUntil:"domcontentloaded"});expect(response?.status(),`${route} pass ${pass+1}`).toBeLessThan(500);await expect(page.locator("main").first()).toBeVisible();expect((await page.request.get("/login")).status(),`server health after ${route}`).toBe(200)}
  expect(errors).toEqual([]);
});

test("وثيقة أسطول بتاريخ قديم تظهر فورًا وتبقى بعد إعادة التحميل", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop transport registry only");
  await page.goto("/transport");
  let transport=await page.evaluate(async()=>{const response=await fetch("/api/transport");if(!response.ok)throw new Error(await response.text());return response.json()});
  if(!transport.trucks.length){transport=await page.evaluate(async()=>{const response=await fetch("/api/transport/trucks",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({plateNumber:`E2E-${Date.now()}`,truckType:"TRACTOR",model:"E2E"})});if(!response.ok)throw new Error(await response.text());const refresh=await fetch("/api/transport");return refresh.json()})}
  const truck=transport.trucks[0],number=`DOC-${Date.now()}`;
  await page.getByRole("button",{name:"الوثائق والتنبيهات"}).click();
  await page.getByLabel("الشاحنة").selectOption(String(truck.id));
  await page.getByLabel("نوع الوثيقة").selectOption("VEHICLE_LICENSE");
  await page.getByLabel("رقم الوثيقة").fill(number);
  await page.getByLabel("تاريخ الإصدار").fill("1995-06-15");
  await page.getByLabel("تاريخ الانتهاء").fill("2035-06-15");
  await page.getByRole("button",{name:"حفظ ورفع الوثيقة"}).click();
  await expect(page.getByText("تم حفظ الوثيقة وظهرت فورًا في السجل")).toBeVisible();
  await expect(page.getByText(number,{exact:true})).toBeVisible();
  await page.reload();await page.getByRole("button",{name:"الوثائق والتنبيهات"}).click();
  await expect(page.getByText(number,{exact:true})).toBeVisible();
  await expect(page.getByText("6/15/1995",{exact:true})).toBeVisible();
});

test("القبول البصري التنفيذي ولقطات الشاشات والاتجاهين", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop project captures all target viewports");
  const evidence = resolve("artifacts/dashboard-recovery"); mkdirSync(evidence, { recursive: true });
  const assertDashboard = async (maxHero:number) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "معًا نبني مستقبلًا أكبر" })).toBeVisible();
    await expect(page.locator(".reference-kpi")).toHaveCount(5);
    await expect(page.locator(".reference-chart-grid")).toBeVisible();
    await expect(page.getByText("تعذر تحميل التحليلات")).toHaveCount(0);
    await expect(page.getByLabel("Loading")).toHaveCount(0);
    await expect(page.getByText("المهام والتنبيهات")).toBeVisible();
    await expect(page.getByText("أحدث المعاملات", { exact:true })).toBeVisible();
    await expect(page.getByRole("button", { name:"فتح NETAJ ONE" })).toBeVisible();
    for (const label of ["صافي الربح","إجمالي المبيعات","إجمالي المشتريات","قيمة المخزون","العملاء النشطون"]) await expect(page.getByText(label,{exact:true}).first()).toBeVisible();
    const metrics = await page.evaluate(() => ({
      hero: document.querySelector(".reference-hero")?.getBoundingClientRect().height ?? 999,
      analyticsTop: document.querySelector(".reference-chart-grid")?.getBoundingClientRect().top ?? 9999,
      viewport: innerHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      sidebarWidth: document.querySelector(".erp-sidebar")?.getBoundingClientRect().width ?? 0,
      sidebarBackground: getComputedStyle(document.querySelector(".erp-sidebar") as Element).backgroundImage,
      kpiValues: [...document.querySelectorAll(".reference-kpi strong")].map(node=>node.textContent?.trim()??""),
    }));
    expect(metrics.hero).toBeLessThanOrEqual(maxHero);
    expect(metrics.analyticsTop).toBeLessThan(metrics.viewport);
    expect(metrics.overflow).toBeLessThanOrEqual(2);
    expect(metrics.sidebarWidth).toBeGreaterThanOrEqual(240);
    expect(metrics.sidebarBackground).toContain("gradient");
    expect(metrics.kpiValues).toHaveLength(5);
    expect(metrics.kpiValues.every(Boolean)).toBeTruthy();
    await expect(page.locator(".reference-bars")).toBeVisible();
  };
  await page.setViewportSize({ width:1440, height:900 }); await assertDashboard(245); await page.evaluate(()=>scrollTo(0,0)); await page.screenshot({ path:resolve(evidence,"dashboard-desktop.png"), fullPage:false });
  await page.setViewportSize({ width:1024, height:900 }); await assertDashboard(245); await page.screenshot({ path:resolve(evidence,"dashboard-tablet.png"), fullPage:true });
  await page.setViewportSize({ width:390, height:844 }); await assertDashboard(310); await page.screenshot({ path:resolve(evidence,"dashboard-mobile.png"), fullPage:true });
  await page.setViewportSize({ width:1440, height:900 }); await page.goto("/");
  await page.getByRole("button", { name:"Switch to English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir","ltr");
  await expect(page.locator(".reference-kpi strong")).toHaveCount(5);
  await expect(page.locator(".erp-nav-item").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  await page.screenshot({ path:resolve(evidence,"dashboard-ltr.png"), fullPage:false });
  for (const route of ["/accounting","/sales","/inventory","/imports"]) {
    await page.goto(route); await expect(page.locator("main").first()).toBeVisible();
    expect(await page.locator("main").first().evaluate(element => getComputedStyle(element).direction)).toBe("ltr");
    expect(await page.evaluate(() => document.documentElement.scrollWidth-document.documentElement.clientWidth)).toBeLessThanOrEqual(2);
  }
  await page.goto("/");
  await page.getByRole("button", { name:"التبديل إلى العربية" }).click();
  for (const [route,name] of [["/accounting","accounting-desktop.png"],["/sales","sales-desktop.png"],["/inventory","inventory-desktop.png"],["/imports","migration-center-desktop.png"]] as const) {
    await page.goto(route); await expect(page.locator("main").first()).toBeVisible();
    await page.waitForFunction(() => !document.body.innerText.includes("جارٍ تحميل"), null, { timeout:10000 }).catch(() => undefined);
    await page.screenshot({ path:resolve(evidence,name), fullPage:false });
  }
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

test("مركز الترحيل ينفذ ملف CSV من المعاينة حتى التسوية والتراجع", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop project only");
  const suffix = Date.now().toString(36).toUpperCase(), filename = `browser-migration-${suffix}.csv`;
  await page.goto("/imports");
  await page.getByLabel("ملف المصدر").setInputFiles({ name: filename, mimeType: "text/csv", buffer: Buffer.from(`الاسم العربي,الرقم الموحد,عميل\nعميل متصفح,WEB-${suffix},نعم\n`) });
  await page.getByRole("button", { name: "تحليل الأعمدة" }).click();
  await expect(page.getByRole("heading", { name: /اكتشاف الأوراق/ })).toBeVisible();
  await expect(page.getByText("مساعد ترحيل NETAJ")).toBeVisible();
  await page.getByRole("button", { name: "إنشاء معاينة التحقق" }).click();
  await expect(page.getByRole("button", { name: "تشغيل Dry Run" })).toBeVisible();
  await page.getByRole("button", { name: "تشغيل Dry Run" }).click();
  await expect(page.getByRole("button", { name: "اعتماد الاستيراد" })).toBeVisible();
  await page.getByRole("button", { name: "اعتماد الاستيراد" }).click();
  await expect(page.getByRole("button", { name: "تنفيذ الدفعة المعتمدة" })).toBeVisible();
  const payload = await page.evaluate(async () => (await fetch("/api/imports", { cache: "no-store" })).json()), batch = payload.batches.find((row: { sourceFile: string }) => row.sourceFile === filename);
  expect(batch).toBeTruthy();
  const executed = await page.evaluate(async (id) => { const response = await fetch(`/api/imports/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "EXECUTE" }) }); return { status: response.status, body: await response.json() }; }, batch.id);
  expect(executed.status, JSON.stringify(executed.body)).toBe(200);
  await page.reload();
  await page.getByRole("button", { name: new RegExp(batch.batchNumber) }).click();
  await expect(page.getByText("تقرير التسوية بعد الاستيراد")).toBeVisible();
  await page.getByRole("button", { name: "إنشاء شهادة المطابقة" }).click();
  await expect(page.getByRole("heading", { name: "شهادة مطابقة الترحيل" })).toBeVisible();
  const certificate = await page.evaluate(async () => { const response = await fetch("/api/imports/certification"); return (await response.json())[0]; });
  expect(certificate.status).toBe("MATCHED");
  for (const format of ["xlsx", "pdf"]) expect(await page.evaluate(async ({ id, format }) => (await fetch(`/api/imports/certification/${id}/export?format=${format}`)).status, { id: certificate.id, format })).toBe(200);
  const rolledBack = await page.evaluate(async (id) => { const response = await fetch(`/api/imports/${id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "ROLLBACK" }) }); return { status: response.status, body: await response.json() }; }, batch.id);
  expect(rolledBack.status, JSON.stringify(rolledBack.body)).toBe(200);
});

test("NETAJ ONE يعمل عالميًا بالكتابة ويعرض نتيجة مقيدة بالشركة", async ({ page }) => {
  await page.getByRole("button", { name: "فتح NETAJ ONE" }).click();
  await expect(page.getByRole("dialog", { name: "NETAJ ONE" })).toBeVisible();
  await page.getByPlaceholder(/اسأل: لماذا انخفض الربح/).fill("كم السيولة؟");
  await page.getByRole("button", { name: "اسأل", exact: true }).click();
  await expect(page.getByText(/السيولة الحالية/)).toBeVisible();
  await page.getByRole("button", { name: "نفّذ بعد المراجعة" }).click();
  await page.getByPlaceholder(/أضف عميل شركة إعمار/).fill(`أضف عميل شركة تجربة المتصفح ${Date.now()} في الرياض ورقم الهاتف 0501234567`);
  await page.getByRole("button", { name: "جهّز المعاينة" }).click();
  await expect(page.getByText("لم يتم تغيير أي بيانات بعد.")).toBeVisible();
  await expect(page.getByRole("button", { name: "اعتماد وتنفيذ" })).toBeVisible();
  await page.getByRole("button", { name: "إلغاء" }).click();
});

test("نموذج سند الاستلام يطابق الهوية المرجعية ويعرض الشعار الفعلي", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop print evidence only");
  await page.goto("/notes/1/print");
  await expect(page.locator(".netaj-form-header")).toBeVisible();
  await expect(page.getByAltText("شعار شركة نتاج المتطورة التجارية")).toBeVisible();
  await expect(page.getByText("Receipt Document")).toBeVisible();
  await page.screenshot({ path: "artifacts/document-prints/receipt-note-reference.png", fullPage: true });
  await page.goto("/sales/977/print");
  await expect(page.getByText("TAX INVOICE")).toBeVisible();
  await expect(page.getByAltText("شعار شركة نتاج المتطورة التجارية")).toBeVisible();
  await page.screenshot({ path: "artifacts/document-prints/tax-invoice-reference.png", fullPage: true });
});

test("الواجهة الحرجة قابلة للاستخدام على شاشة هاتف", async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "mobile project only");
  await expect(page.getByRole("heading", { name: "معًا نبني مستقبلًا أكبر" })).toBeVisible();
  await page.getByRole("button", { name: "فتح القائمة" }).click();
  await expect(page.getByRole("navigation", { name: "القائمة الرئيسية" })).toBeVisible();
  await page.getByRole("navigation", { name: "القائمة الرئيسية" }).getByRole("link", { name: "المخزون", exact: true }).click();
  await expect(page.getByRole("heading", { name: /المخزون/ })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(2);
  await page.goto("/portal");
  await expect(page.getByRole("heading", { name: "بوابة العملاء والموردين" })).toBeVisible();
});
