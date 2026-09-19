import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 3147;
const temporaryDirectory = mkdtempSync(join(tmpdir(), "netaj-production-smoke-"));
const databasePath = join(temporaryDirectory, "production-smoke.db");
copyFileSync("prisma/netaj.db", databasePath);
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: `file:${databasePath}`,
    ATTACHMENT_STORAGE_DIR: join(temporaryDirectory, "attachments"),
  },
});

let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk.toString()));
server.stderr.on("data", (chunk) => (logs += chunk.toString()));

async function waitUntilReady() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/units`);
      if (response.ok) return;
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Production server did not become ready.\n${logs}`);
}

const routes = [
  "/",
  "/items",
  "/parties",
  "/parties/1",
  "/inventory",
  "/notes",
  "/transport",
  "/sales",
  "/purchases",
  "/accounting",
  "/factory",
  "/hr",
  "/external",
  "/settings/organization",
  "/api/units",
  "/api/item-categories",
  "/api/items",
  "/api/parties",
  "/api/parties/1",
  "/api/inventory",
  "/api/notes",
  "/api/transport",
  "/api/transport/trucks",
  "/api/transport/drivers",
  "/api/sales",
  "/api/purchases",
  "/api/workflows?direction=SALES",
  "/api/accounting",
  "/api/finance",
  "/api/finance/banks",
  "/api/finance/vouchers",
  "/api/finance/expenses",
  "/api/finance/revenues",
  "/api/finance/transfers",
  "/api/finance/reports?report=trial-balance",
  "/api/factory",
  "/api/factory/transactions",
  "/api/factory/fees",
  "/api/factory/fuel",
  "/api/factory/maintenance",
  "/api/hr",
  "/api/hr/employees",
  "/api/hr/workers",
  "/api/hr/attendance",
  "/api/hr/payroll",
  "/api/hr/advances",
  "/api/hr/worker-costs",
  "/api/external",
  "/api/external/trades",
  "/api/external/costs",
  "/api/external/expenses",
  "/api/platform",
];

async function jsonRequest(route, init) {
  const response = await fetch(`http://127.0.0.1:${port}${route}`, init);
  const body = await response.json();
  return { response, body };
}

try {
  await waitUntilReady();
  for (const route of routes) {
    const response = await fetch(`http://127.0.0.1:${port}${route}`);
    assert.equal(response.status, 200, `${route} returned ${response.status}`);
    console.log(`PASS ${route} (${response.status})`);
  }

  const units = await (await fetch(`http://127.0.0.1:${port}/api/units`)).json();
  const suffix = Date.now().toString(36).toUpperCase();
  const companyResult = await jsonRequest("/api/platform", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: `SMOKE-${suffix}`,
      legalNameAr: "شركة اختبار SaaS",
      countryCode: "SA",
      baseCurrencyCode: "SAR",
      defaultLanguageCode: "ar",
      timeZoneName: "Asia/Riyadh",
    }),
  });
  assert.equal(companyResult.response.status, 201);
  assert.equal(companyResult.body.branches.length, 1);
  assert.equal(companyResult.body.warehouses.length, 1);

  const partyResult = await jsonRequest("/api/parties", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      nameAr: "عميل اختبار الإنتاج",
      isCustomer: true,
      isSupplier: true,
    }),
  });
  assert.equal(partyResult.response.status, 201);

  const itemResult = await jsonRequest("/api/items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: `SMOKE-${suffix}`,
      nameAr: "مادة اختبار الإنتاج",
      unitId: units[0].id,
    }),
  });
  assert.equal(itemResult.response.status, 201);

  const movementHeaders = { "Content-Type": "application/json" };
  const companyIn = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "COMPANY",
      itemId: itemResult.body.id,
      quantityIn: 10,
      unitCost: 5,
      movementType: "OPENING",
    }),
  });
  assert.equal(companyIn.response.status, 201);
  assert.equal(companyIn.body.newQuantity, 10);

  const companyOut = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "COMPANY",
      itemId: itemResult.body.id,
      quantityOut: 4,
      movementType: "DELIVERY",
    }),
  });
  assert.equal(companyOut.response.status, 201);
  assert.equal(companyOut.body.newQuantity, 6);

  const rejectedCompanyOut = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "COMPANY",
      itemId: itemResult.body.id,
      quantityOut: 7,
      movementType: "DELIVERY",
    }),
  });
  assert.equal(rejectedCompanyOut.response.status, 400);

  const negativeParty = await jsonRequest("/api/inventory/movements", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      ownershipType: "PARTY",
      partyId: partyResult.body.id,
      itemId: itemResult.body.id,
      quantityOut: 3,
      unitCost: 5,
      movementType: "DELIVERY",
    }),
  });
  assert.equal(negativeParty.response.status, 201);
  assert.equal(negativeParty.body.newQuantity, -3);

  const sale = await jsonRequest("/api/sales", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      invoiceNumber: `SALE-${suffix}`,
      partyId: partyResult.body.id,
      totalAmount: 999999,
      items: [
        {
          itemId: itemResult.body.id,
          quantity: 2,
          unitPrice: 10,
          discount: 1,
          vatRate: 15,
        },
      ],
    }),
  });
  assert.equal(sale.response.status, 201);
  assert.equal(Number(sale.body.totalAmount), 21.85);

  const purchase = await jsonRequest("/api/purchases", {
    method: "POST",
    headers: movementHeaders,
    body: JSON.stringify({
      purchaseNumber: `PUR-${suffix}`,
      partyId: partyResult.body.id,
      items: [
        {
          itemId: itemResult.body.id,
          quantity: 3,
          unitPrice: 4,
          discount: 0,
          vatRate: 15,
        },
      ],
    }),
  });
  assert.equal(purchase.response.status, 201);
  assert.equal(Number(purchase.body.totalAmount), 13.8);

  const partyFile = await jsonRequest(`/api/parties/${partyResult.body.id}`);
  assert.equal(partyFile.response.status, 200);
  assert.equal(partyFile.body.stockMovements.length, 1);
  assert.equal(Number(partyFile.body.stockMovements[0].balanceAfter), -3);
  assert.equal(partyFile.body.sales.length, 1);
  assert.equal(partyFile.body.purchases.length, 1);
  const truck = await jsonRequest("/api/transport/trucks", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({ plateNumber: `SMOKE-${suffix}`, truckType: "اختبار" }),
  });
  assert.equal(truck.response.status, 201);
  const driver = await jsonRequest("/api/transport/drivers", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({ name: "سائق اختبار الإنتاج", idNumber: `SMOKE-${suffix}` }),
  });
  assert.equal(driver.response.status, 201);
  const note = await jsonRequest("/api/notes", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({
      noteType: "RECEIPT", noteDate: "2026-09-19", partyId: partyResult.body.id,
      stockOwnership: "PARTY", transportMethod: "COMPANY", truckId: truck.body.id,
      driverId: driver.body.id, items: [{ itemId: itemResult.body.id, quantity: 5, weight: 4.5 }],
    }),
  });
  assert.equal(note.response.status, 201);
  const postedNote = await jsonRequest(`/api/notes/${note.body.id}`, {
    method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }),
  });
  assert.equal(postedNote.response.status, 200);
  assert.equal(postedNote.body.trip.noteId, note.body.id);
  const updatedTrip = await jsonRequest(`/api/transport/trips/${postedNote.body.trip.id}`, {
    method: "PATCH", headers: movementHeaders,
    body: JSON.stringify({
      truckId: truck.body.id, driverId: driver.body.id, status: "COMPLETED",
      transportRevenue: 1000, fuelLiters: 100, fuelPricePerLiter: 2,
      driverTripFee: 150, maintenanceCost: 50, administrativeCost: 25,
      roadPermitCost: 15, otherCost: 10, actualKm: 250,
    }),
  });
  assert.equal(updatedTrip.response.status, 200);
  assert.equal(Number(updatedTrip.body.totalCost), 450);
  assert.equal(Number(updatedTrip.body.netProfit), 550);
  const document = await jsonRequest("/api/transport/documents", {
    method: "POST", headers: movementHeaders,
    body: JSON.stringify({ ownerType: "TRUCK", ownerId: truck.body.id, documentType: "الاستمارة", expiryDate: "2026-09-20" }),
  });
  assert.equal(document.response.status, 201);
  const transport = await jsonRequest("/api/transport");
  assert.equal(transport.response.status, 200);
  assert.equal(transport.body.trips.some((trip) => trip.noteId === note.body.id), true);
  assert.equal(transport.body.alerts.truckDocuments.some((row) => row.id === document.body.id), true);
  const workflowBody = (documentType, quantity = 2) => ({
    documentType, documentDate: "2026-09-19", partyId: partyResult.body.id,
    currency: "SAR", referenceNumber: `FLOW-${suffix}`,
    items: [{ itemId: itemResult.body.id, quantity, unitPrice: 100, discount: 10, vatRate: 15 }],
  });
  const approve = async (id) => {
    const result = await jsonRequest(`/api/workflows/${id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "APPROVE" }) });
    assert.equal(result.response.status, 200);
    return result.body;
  };
  const convert = async (id, targetType, extra = {}) => {
    const result = await jsonRequest(`/api/workflows/${id}/convert`, { method: "POST", headers: movementHeaders, body: JSON.stringify({ targetType, ...extra }) });
    assert.ok([200, 201].includes(result.response.status));
    return result.body;
  };
  const quote = await jsonRequest("/api/workflows", { method: "POST", headers: movementHeaders, body: JSON.stringify(workflowBody("QUOTATION")) });
  assert.equal(quote.response.status, 201);
  await approve(quote.body.id);
  const pi = await convert(quote.body.id, "PROFORMA_INVOICE"); await approve(pi.document.id);
  const order = await convert(pi.document.id, "SALES_ORDER"); await approve(order.document.id);
  const delivery = await convert(order.document.id, "DELIVERY_NOTE", { transportMethod: "COMPANY", truckId: truck.body.id, driverId: driver.body.id });
  const deliveryPost = await jsonRequest(`/api/notes/${delivery.note.id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }) });
  assert.equal(deliveryPost.response.status, 200);
  const salesInvoice = await jsonRequest(`/api/notes/${delivery.note.id}/invoice`, { method: "POST", headers: movementHeaders, body: "{}" });
  assert.equal(salesInvoice.response.status, 201);
  assert.equal(Number(salesInvoice.body.journal.totalDebit), Number(salesInvoice.body.journal.totalCredit));
  const duplicateInvoice = await jsonRequest(`/api/notes/${delivery.note.id}/invoice`, { method: "POST", headers: movementHeaders, body: "{}" });
  assert.equal(duplicateInvoice.response.status, 200);
  assert.equal(duplicateInvoice.body.invoice.id, salesInvoice.body.invoice.id);
  const purchaseRequest = await jsonRequest("/api/workflows", { method: "POST", headers: movementHeaders, body: JSON.stringify(workflowBody("PURCHASE_REQUEST", 3)) });
  assert.equal(purchaseRequest.response.status, 201); await approve(purchaseRequest.body.id);
  const purchaseOrder = await convert(purchaseRequest.body.id, "PURCHASE_ORDER"); await approve(purchaseOrder.document.id);
  const receipt = await convert(purchaseOrder.document.id, "RECEIPT_NOTE", { transportMethod: "EXTERNAL" });
  await jsonRequest(`/api/notes/${receipt.note.id}`, { method: "PATCH", headers: movementHeaders, body: JSON.stringify({ action: "POST" }) });
  const supplierInvoice = await jsonRequest(`/api/notes/${receipt.note.id}/invoice`, { method: "POST", headers: movementHeaders, body: JSON.stringify({ supplierInvoiceNumber: `SUP-${suffix}` }) });
  assert.equal(supplierInvoice.response.status, 201);
  assert.equal(Number(supplierInvoice.body.journal.totalDebit), Number(supplierInvoice.body.journal.totalCredit));
  const form = new FormData(); form.set("entityType", "BUSINESS_DOCUMENT"); form.set("entityId", String(quote.body.id)); form.set("file", new File(["%PDF-1.4 smoke"], "smoke.pdf", { type: "application/pdf" }));
  const attachmentResponse = await fetch(`http://127.0.0.1:${port}/api/attachments`, { method: "POST", body: form });
  assert.equal(attachmentResponse.status, 201); const attachment = await attachmentResponse.json();
  const attachmentDownload = await fetch(`http://127.0.0.1:${port}/api/attachments/${attachment.id}`); assert.equal(attachmentDownload.status, 200);
  console.log("PASS production sales and purchase workflows, accounting idempotency, and attachment upload");
  console.log("PASS production note to stock to transport flow on isolated database");
  console.log("PASS production inventory write/read flow on isolated database");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => {
    server.once("exit", resolve);
    setTimeout(resolve, 2_000);
  });
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
