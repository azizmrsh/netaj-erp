import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export async function globalSearch(tx: Tx, query: string, modules: Set<string>, page = 1, pageSize = 20, tenantId = 1, companyId = 1) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { query: q, page: 1, pageSize, results: [], hasMore: false };
  const take = Math.min(50, Math.max(5, pageSize)), skip = (Math.max(1, page) - 1) * take;
  const normalized = (value: string) => value.normalize("NFKC").replace(/[إأآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");
  const variants = Array.from(new Set([q, normalized(q), q.replace(/\s+/g, "")])).filter((value) => value.length > 1);
  const contains = (field: string) => variants.map((value) => ({ [field]: { contains: value } }));
  const scope = { tenantId, companyId };
  const batches = await Promise.all([
    modules.has("CORE") ? tx.party.findMany({ where: { ...scope, OR: [...contains("nameAr"), ...contains("nameEn"), ...contains("unifiedNumber")] }, select: { id: true, nameAr: true, nameEn: true, unifiedNumber: true }, skip, take: take + 1 }) : [],
    modules.has("CORE") ? tx.item.findMany({ where: { ...scope, OR: [...contains("code"), ...contains("nameAr"), ...contains("nameEn")] }, select: { id: true, code: true, nameAr: true, nameEn: true }, skip, take: take + 1 }) : [],
    modules.has("SALES") ? tx.sale.findMany({ where: { ...scope, OR: [...contains("invoiceNumber"), ...contains("referenceNumber"), { party: { OR: [...contains("nameAr"), ...contains("nameEn")] } }] }, select: { id: true, invoiceNumber: true, totalAmount: true, party: { select: { nameAr: true } } }, skip, take: take + 1 }) : [],
    modules.has("PURCHASES") ? tx.purchase.findMany({ where: { ...scope, OR: [...contains("purchaseNumber"), ...contains("supplierInvoiceNumber"), { party: { OR: [...contains("nameAr"), ...contains("nameEn")] } }] }, select: { id: true, purchaseNumber: true, totalAmount: true, party: { select: { nameAr: true } } }, skip, take: take + 1 }) : [],
    modules.has("PROJECTS") ? tx.project.findMany({ where: { ...scope, OR: [...contains("projectNumber"), ...contains("name")] }, select: { id: true, projectNumber: true, name: true }, skip, take: take + 1 }) : [],
    modules.has("DMS") ? tx.managedDocument.findMany({ where: { ...scope, OR: [...contains("documentNumber"), ...contains("title")] }, select: { id: true, documentNumber: true, title: true }, skip, take: take + 1 }) : [],
    modules.has("TRANSPORT") ? tx.truck.findMany({ where: { ...scope, OR: [...contains("plateNumber"), ...contains("fleetCode"), ...contains("make"), ...contains("model")] }, select: { id: true, plateNumber: true, fleetCode: true }, skip, take: take + 1 }) : [],
    modules.has("TRANSPORT") ? tx.driver.findMany({ where: { ...scope, OR: [...contains("name"), ...contains("idNumber"), ...contains("phone")] }, select: { id: true, name: true, idNumber: true }, skip, take: take + 1 }) : [],
    modules.has("TRANSPORT") ? tx.transportTrip.findMany({ where: { ...scope, OR: [...contains("tripNumber"), { truck: { OR: [...contains("plateNumber"), ...contains("fleetCode")] } }, { driver: { OR: [...contains("name"), ...contains("idNumber")] } }] }, select: { id: true, tripNumber: true, tripDate: true }, skip, take: take + 1 }) : [],
  ]);
  const [parties, items, sales, purchases, projects, documents, trucks, drivers, trips] = batches;
  const results = [
    ...parties.slice(0, take).map((row) => ({ type: "PARTY", id: row.id, title: row.nameAr, subtitle: row.unifiedNumber, href: `/parties/${row.id}` })),
    ...items.slice(0, take).map((row) => ({ type: "ITEM", id: row.id, title: row.nameAr, subtitle: row.code, href: `/items?itemId=${row.id}` })),
    ...sales.slice(0, take).map((row) => ({ type: "SALE", id: row.id, title: row.invoiceNumber, subtitle: row.party.nameAr, href: `/sales?invoiceId=${row.id}` })),
    ...purchases.slice(0, take).map((row) => ({ type: "PURCHASE", id: row.id, title: row.purchaseNumber, subtitle: row.party.nameAr, href: `/purchases?invoiceId=${row.id}` })),
    ...projects.slice(0, take).map((row) => ({ type: "PROJECT", id: row.id, title: row.name, subtitle: row.projectNumber, href: `/projects?projectId=${row.id}` })),
    ...documents.slice(0, take).map((row) => ({ type: "DOCUMENT", id: row.id, title: row.title, subtitle: row.documentNumber, href: `/documents?documentId=${row.id}` })),
    ...trucks.slice(0, take).map((row) => ({ type: "TRUCK", id: row.id, title: row.plateNumber, subtitle: row.fleetCode ?? "", href: `/transport?truckId=${row.id}` })),
    ...drivers.slice(0, take).map((row) => ({ type: "DRIVER", id: row.id, title: row.name, subtitle: row.idNumber ?? "", href: `/transport?driverId=${row.id}` })),
    ...trips.slice(0, take).map((row) => ({ type: "TRIP", id: row.id, title: row.tripNumber, subtitle: new Date(row.tripDate).toISOString().slice(0, 10), href: `/transport/trips/${row.id}/print` })),
  ].slice(0, take);
  return { query: q, page: Math.max(1, page), pageSize: take, results, hasMore: batches.some((batch) => batch.length > take) };
}
