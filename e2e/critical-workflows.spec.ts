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

test("فلاتر المخزون وتصديره والإجراءات المحاسبية المباشرة ظاهرة ومتصلة", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name.includes("mobile"), "desktop export controls; the mobile inventory shell is covered separately");
  await page.goto("/inventory");
  await expect(page.getByRole("button", { name: "Excel" })).toBeVisible();
  await expect(page.getByRole("button", { name: "PDF" })).toBeVisible();
  await expect(page.getByRole("button", { name: "CSV" })).toBeVisible();
  await page.getByRole("button", { name: "هذا الشهر" }).click();
  await expect(page.locator("text=/من 2026-/").first()).toBeVisible();
  const exportResult = await page.evaluate(async () => {
    const response = await fetch("/api/inventory/export?view=statement&from=2026-01-01&to=2026-12-31&format=xlsx");
    const bytes = new Uint8Array(await response.arrayBuffer());
    return { status: response.status, signature: String.fromCharCode(...bytes.slice(0, 2)) };
  });
  expect(exportResult.status).toBe(200);
  expect(exportResult.signature).toBe("PK");
  await page.goto("/accounting?tab=vat");
  await expect(page.getByRole("button", { name: "الإقرارات الضريبية" })).toHaveClass(/is-active/);
  await page.goto("/accounting?tab=vouchers&type=PAYMENT");
  await expect(page.getByRole("button", { name: "سندات القبض والصرف" })).toHaveClass(/is-active/);
});

test("فواتير البيع والشراء منفصلة وتصديرها وكشوف العميل تعمل من المتصفح",async({page},testInfo)=>{
  test.skip(testInfo.project.name.includes("mobile"),"covered on desktop; mobile shell is exercised separately");
  const errors:string[]=[];page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/sales");
  for(const label of ["فواتير المبيعات","عروض الأسعار","الفواتير الأولية","أوامر البيع"])await expect(page.getByRole("button",{name:label,exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"+ فاتورة مبيعات جديدة",exact:true})).toBeVisible();
  const salesExport=await page.evaluate(async()=>{const response=await fetch("/api/commerce/export?direction=SALES&format=xlsx"),bytes=new Uint8Array(await response.arrayBuffer());return{status:response.status,signature:String.fromCharCode(...bytes.slice(0,2))}});expect(salesExport).toEqual({status:200,signature:"PK"});
  await page.goto("/purchases");
  for(const label of ["فواتير الموردين","طلبات الشراء","أوامر الشراء"])await expect(page.getByRole("button",{name:label,exact:true})).toBeVisible();
  const purchasePdf=await page.evaluate(async()=>{const response=await fetch("/api/commerce/export?direction=PURCHASE&format=pdf"),bytes=new Uint8Array(await response.arrayBuffer());return{status:response.status,signature:String.fromCharCode(...bytes.slice(0,4))}});expect(purchasePdf).toEqual({status:200,signature:"%PDF"});
  const party=await page.evaluate(async()=>{const response=await fetch("/api/parties?page=1&pageSize=1");return(await response.json()).parties[0]});expect(party).toBeTruthy();
  await page.goto(`/parties/${party.id}`);await page.getByRole("button",{name:"الحساب",exact:true}).click();await expect(page.getByText("رصيد أول المدة",{exact:true})).toBeVisible();await expect(page.getByRole("link",{name:/Excel/})).toBeVisible();
  mkdirSync(resolve("artifacts/operational-correction"),{recursive:true});await page.screenshot({path:resolve("artifacts/operational-correction/customer-financial-statement.png"),fullPage:true});
  const statement=await page.evaluate(async id=>{const response=await fetch(`/api/parties/${id}/statement?kind=financial`);return{status:response.status,body:await response.json()}},party.id);expect(statement.status).toBe(200);expect(Array.isArray(statement.body.rows)).toBeTruthy();expect(errors).toEqual([]);
});

test("تشغيل الأسطول يعرض 12 إطارًا وبطاريتين بوضوح",async({page},testInfo)=>{
  test.skip(testInfo.project.name.includes("mobile"),"dense fleet map is covered on desktop");await page.goto("/transport");await page.getByRole("button",{name:"تشغيل الأسطول",exact:true}).click();await page.getByRole("button",{name:"الإطارات",exact:true}).click();await expect(page.getByText("رأس الشاحنة — 6 إطارات")).toBeVisible();await expect(page.getByText("الصهريج / المقطورة — 6 إطارات")).toBeVisible();expect(await page.locator('button[aria-label*="إطارات"]').count()).toBe(12);mkdirSync(resolve("artifacts/operational-correction"),{recursive:true});await page.screenshot({path:resolve("artifacts/operational-correction/fleet-12-tires.png"),fullPage:true});await page.getByRole("button",{name:"البطاريات",exact:true}).click();await expect(page.getByRole("option",{name:"البطارية 1"})).toHaveCount(1);await expect(page.getByRole("option",{name:"البطارية 2"})).toHaveCount(1);
});

test("كشف العميل يفصل الرصيد الرسمي عن المسودات ويطبق اختيار عدة مواد والتصدير",async({page},testInfo)=>{
  test.skip(testInfo.project.name.includes("mobile"),"desktop statement acceptance");
  const parties=await page.evaluate(async()=>{const response=await fetch("/api/parties?page=1&pageSize=100");return(await response.json()).parties as Array<{id:number}>}),candidates=[] as Array<{party:{id:number};statement:{availableItems:Array<{id:number;nameAr:string}>;rows:Array<unknown>}}>;
  for(const party of parties){const statement=await page.evaluate(async id=>(await fetch(`/api/parties/${id}/statement?kind=inventory`)).json(),party.id);if(statement.availableItems?.length>=2)candidates.push({party,statement});if(candidates.length>=5)break}candidates.sort((a,b)=>a.statement.rows.length-b.statement.rows.length);
  expect(candidates.length).toBeGreaterThan(0);const candidate=candidates[0],ids=candidate.statement.availableItems.slice(0,2).map(item=>item.id),inventory=await page.evaluate(async({id,ids})=>{const url=`/api/parties/${id}/statement?kind=inventory&itemIds=${ids.join(",")}&from=2026-01-01&to=2026-12-31`,response=await fetch(url),body=await response.json(),xlsx=await fetch(`${url}&format=xlsx`),pdf=await fetch(`${url}&format=pdf`);return{status:response.status,body,xlsx:{status:xlsx.status,sig:String.fromCharCode(...new Uint8Array(await xlsx.arrayBuffer()).slice(0,2))},pdf:{status:pdf.status,sig:String.fromCharCode(...new Uint8Array(await pdf.arrayBuffer()).slice(0,4))}}},{id:candidate.party.id,ids});
  expect(inventory.status).toBe(200);expect(inventory.body.summaries).toHaveLength(2);for(const row of inventory.body.summaries)expect(Number(row.opening)+Number(row.in)-Number(row.out)).toBeCloseTo(Number(row.closing),8);expect(inventory.xlsx).toEqual({status:200,sig:"PK"});expect(inventory.pdf).toEqual({status:200,sig:"%PDF"});
  await page.goto(`/parties/${candidate.party.id}`);await page.getByRole("button",{name:"المخزون",exact:true}).click();await expect(page.getByText("رصيد المخزون",{exact:true})).toBeVisible({timeout:30000});await page.getByRole("button",{name:/كل المواد/}).click();const menu=page.locator(".party-statement");for(const id of ids)await menu.locator(`label:has(input[type=checkbox])`).filter({hasText:String(candidate.statement.availableItems.find(item=>item.id===id)?.id?candidate.statement.availableItems.find(item=>item.id===id)?.nameAr??"":"")}).locator("input").check();await expect(page.getByRole("button",{name:/2 مادة محددة/})).toBeVisible();await expect(page.getByText("متطابق").first()).toBeVisible();mkdirSync(resolve("artifacts/final-acceptance"),{recursive:true});await page.screenshot({path:resolve("artifacts/final-acceptance/customer-inventory-multiselect.png"),fullPage:true});
  const financialDefault=await page.evaluate(async id=>(await fetch(`/api/parties/${id}/statement?kind=financial`)).json(),candidate.party.id),withDrafts=await page.evaluate(async id=>{const response=await fetch(`/api/parties/${id}/statement?kind=financial&includeDrafts=1`);return{status:response.status,body:await response.json()}},candidate.party.id);expect(financialDefault.unpostedRows).toEqual([]);expect(withDrafts.status).toBe(200);expect(withDrafts.body.totals.closing).toBe(financialDefault.totals.closing);
});

test("صلاحية قراءة كشف العميل لا تمنح رؤية غير المرحل ولا تتجاوز عزل الشركة",async({page,browser},testInfo)=>{test.skip(testInfo.project.name.includes("mobile"),"desktop RBAC acceptance");const suffix=Date.now().toString(36).toLowerCase(),email=`statement.${suffix}@netaj.test`,password="StatementRead123",created=await page.evaluate(async input=>{const response=await fetch("/api/platform/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});return response.status},{email,name:"Statement Reader",password,companyId:1,permissionKeys:["ACCOUNTING.READ","CORE.READ"]});expect(created).toBe(201);const parties=await page.evaluate(async()=>(await(await fetch("/api/parties?page=1&pageSize=1")).json()).parties),context=await browser.newContext({baseURL:testInfo.project.use.baseURL as string}),readerPage=await context.newPage();await readerPage.goto("/login");await readerPage.locator('input[name="email"]').fill(email);await readerPage.locator('input[name="password"]').fill(password);await readerPage.getByRole("button",{name:/دخول/}).click();await expect(readerPage).toHaveURL(/\/$/);const statuses=await readerPage.evaluate(async id=>({official:(await fetch(`/api/parties/${id}/statement?kind=financial`)).status,drafts:(await fetch(`/api/parties/${id}/statement?kind=financial&includeDrafts=1`)).status,foreign:(await fetch("/api/parties/999999999/statement?kind=financial")).status}),parties[0].id);expect(statuses).toEqual({official:200,drafts:403,foreign:403});await context.close()});

test("سجلات العداد مستقلة للإطار والبطاريتين ولا تستبدل التاريخ",async({page},testInfo)=>{
  test.skip(testInfo.project.name.includes("mobile"),"desktop fleet acceptance");const transport=await page.evaluate(async()=>(await fetch("/api/transport")).json()),truck=transport.trucks[0];expect(truck).toBeTruthy();const stamp=Date.now();
  async function post(body:Record<string,unknown>){return page.evaluate(async payload=>{const response=await fetch("/api/transport/operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return{status:response.status,body:await response.json()}},body)}
  const tire=await post({type:"TIRE",truckId:truck.id,vehiclePart:"TRACTOR",axle:1,position:"FRONT_LEFT",serialNumber:`E2E-T-${stamp}`,installedAt:"2026-01-01",installationOdometer:1000,cost:0}),battery1=await post({type:"BATTERY",truckId:truck.id,position:"MAIN",serialNumber:`E2E-B1-${stamp}`,installedAt:"2026-01-01",installationOdometer:1000,cost:0}),battery2=await post({type:"BATTERY",truckId:truck.id,position:"AUXILIARY",serialNumber:`E2E-B2-${stamp}`,installedAt:"2026-01-01",installationOdometer:1000,cost:0});expect(tire.status).toBe(201);expect(battery1.status).toBe(201);expect(battery2.status).toBe(201);await post({type:"TIRE_READING",truckId:truck.id,componentRecordId:tire.body.id,odometer:1300,readingDate:"2026-02-01"});await post({type:"BATTERY_READING",truckId:truck.id,componentRecordId:battery1.body.id,odometer:1250,readingDate:"2026-02-01"});await post({type:"BATTERY_READING",truckId:truck.id,componentRecordId:battery2.body.id,odometer:1400,readingDate:"2026-02-01"});const history=await page.evaluate(async id=>(await fetch(`/api/transport/operations?truckId=${id}`)).json(),truck.id),tireRow=history.tires.find((row:{id:number})=>row.id===tire.body.id),b1=history.batteries.find((row:{id:number})=>row.id===battery1.body.id),b2=history.batteries.find((row:{id:number})=>row.id===battery2.body.id);expect(tireRow.readings.map((row:{odometer:string})=>Number(row.odometer))).toEqual([1300,1000]);expect(Number(b1.readings[0].odometer)).toBe(1250);expect(Number(b2.readings[0].odometer)).toBe(1400);await page.goto("/transport");await page.getByRole("button",{name:"تشغيل الأسطول",exact:true}).click();await page.getByRole("button",{name:"الإطارات",exact:true}).click();await page.getByRole("combobox",{name:"الشاحنة",exact:true}).selectOption(String(truck.id));await expect(page.getByText("المسافة: 300 كم")).toBeVisible();await page.screenshot({path:resolve("artifacts/final-acceptance/fleet-component-history.png"),fullPage:true});
});

test("فاتورة البيع المباشرة تمر بالموافقة وتترحل مرة واحدة فقط",async({page,browser},testInfo)=>{
  test.skip(testInfo.project.name.includes("mobile"),"desktop approval acceptance");const suffix=Date.now().toString(36).toUpperCase(),options=await page.evaluate(async()=>(await fetch("/api/workflows?direction=SALES&pageSize=1")).json()),party=options.options.parties.find((row:{isCustomer:boolean})=>row.isCustomer),item=options.options.items[0],approverEmail=`requester.${suffix.toLowerCase()}@netaj.test`,approverPassword="BrowserApprove123";expect(party&&item).toBeTruthy();const createdUser=await page.evaluate(async input=>{const response=await fetch("/api/platform/users",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(input)});return{status:response.status,body:await response.json()}},{email:approverEmail,name:"E2E Invoice Requester",password:approverPassword,companyId:1,permissionKeys:["SALES.READ","SALES.CREATE","SALES.UPDATE","CORE.READ"]});expect(createdUser.status).toBe(201);
  const sale=await page.evaluate(async payload=>{const response=await fetch("/api/sales",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});return{status:response.status,body:await response.json()}},{invoiceDate:"2026-09-20",partyId:party.id,currency:"SAR",items:[{itemId:item.id,quantity:1,unitPrice:10,discount:0,vatRate:15}]});expect(sale.status).toBe(201);expect(sale.body.status).toBe("DRAFT");
  const requester=await browser.newContext({baseURL:testInfo.project.use.baseURL as string}),requesterPage=await requester.newPage();await requesterPage.goto("/login");await requesterPage.locator('input[name="email"]').fill(approverEmail);await requesterPage.locator('input[name="password"]').fill(approverPassword);await requesterPage.getByRole("button",{name:/دخول/}).click();await expect(requesterPage).toHaveURL(/\/$/);const submitted=await requesterPage.evaluate(async id=>{const response=await fetch(`/api/sales/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"SUBMIT"})});return{status:response.status,body:await response.json()}},sale.body.id);expect(submitted.status).toBe(200);expect(submitted.body.sale.status).toBe("PENDING");await requester.close();const approval=await page.evaluate(async saleId=>{const response=await fetch("/api/approvals"),body=await response.json();return body.requests.find((row:{entityId:number;entityType:string})=>row.entityId===saleId&&row.entityType==="SALE")},sale.body.id);expect(approval).toBeTruthy();const approved=await page.evaluate(async id=>{const response=await fetch("/api/approvals",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"APPROVE",id,comment:"E2E approval"})});return{status:response.status,body:await response.json()}},approval.id);expect(approved.status,JSON.stringify(approved.body)).toBe(200);
  const first=await page.evaluate(async id=>{const response=await fetch(`/api/sales/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"POST"})});return{status:response.status,body:await response.json()}},sale.body.id),second=await page.evaluate(async id=>{const response=await fetch(`/api/sales/${id}`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({action:"POST"})});return{status:response.status,body:await response.json()}},sale.body.id);expect(first.status).toBe(200);expect(second.status).toBe(200);expect(second.body.idempotent).toBeTruthy();expect(first.body.journal.id).toBe(second.body.journal.id);await page.goto("/sales");await expect(page.getByText(sale.body.invoiceNumber,{exact:true})).toBeVisible();await page.screenshot({path:resolve("artifacts/final-acceptance/direct-sales-approved-posted.png"),fullPage:true});
});

test("التعريب والإنجليزية مكتملان في صفحات الحزمة الجديدة",async({page},testInfo)=>{test.skip(testInfo.project.name.includes("mobile"),"desktop localization acceptance");await page.goto("/");await page.getByRole("button",{name:"Switch to English"}).click();for(const [route,text] of [["/sales","Sales"],["/accounting?tab=receipt","Receipt voucher workspace"],["/transport","Transport & Fleet"]] as const){await page.goto(route);await expect(page.locator("html")).toHaveAttribute("dir","ltr");await expect(page.locator("body")).toContainText(text)}await page.goto("/");await page.getByRole("button",{name:"التبديل إلى العربية"}).click();await page.goto("/sales");await expect(page.locator("html")).toHaveAttribute("dir","rtl");await expect(page.locator("body")).toContainText("المبيعات")});

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
  mkdirSync(resolve("artifacts/final-acceptance"), { recursive: true });
  const panel = await page.locator(".netaj-one-panel").evaluate(element => { const rect = element.getBoundingClientRect(); const style = getComputedStyle(element); return { top: rect.top, right: innerWidth - rect.right, background: style.backgroundImage }; });
  expect(panel.top).toBeLessThan(100);
  expect(panel.right).toBeLessThan(40);
  expect(panel.background).toContain("linear-gradient");
  await page.screenshot({ path: resolve("artifacts/final-acceptance/netaj-one-dashboard.png"), fullPage: false });
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
