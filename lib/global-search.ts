import type { Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;
export async function globalSearch(tx: Tx, query: string, modules: Set<string>, page = 1, pageSize = 20) {
  const q = query.trim().slice(0, 100);
  if (q.length < 2) return { query: q, page: 1, pageSize, results: [], hasMore: false };
  const take = Math.min(50, Math.max(5, pageSize)), skip = (Math.max(1, page) - 1) * take;
  const batches = await Promise.all([
    modules.has("CORE") ? tx.party.findMany({ where: { OR: [{ nameAr: { contains: q } }, { nameEn: { contains: q } }, { unifiedNumber: { contains: q } }] }, select: { id: true, nameAr: true, unifiedNumber: true }, skip, take: take + 1 }) : [],
    modules.has("CORE") ? tx.item.findMany({ where: { OR: [{ code: { contains: q } }, { nameAr: { contains: q } }, { nameEn: { contains: q } }] }, select: { id: true, code: true, nameAr: true }, skip, take: take + 1 }) : [],
    modules.has("SALES") ? tx.sale.findMany({ where: { OR: [{ invoiceNumber: { contains: q } }, { referenceNumber: { contains: q } }, { party: { nameAr: { contains: q } } }] }, select: { id: true, invoiceNumber: true, totalAmount: true, party: { select: { nameAr: true } } }, skip, take: take + 1 }) : [],
    modules.has("PURCHASES") ? tx.purchase.findMany({ where: { OR: [{ purchaseNumber: { contains: q } }, { supplierInvoiceNumber: { contains: q } }, { party: { nameAr: { contains: q } } }] }, select: { id: true, purchaseNumber: true, totalAmount: true, party: { select: { nameAr: true } } }, skip, take: take + 1 }) : [],
    modules.has("PROJECTS") ? tx.project.findMany({ where: { OR: [{ projectNumber: { contains: q } }, { name: { contains: q } }] }, select: { id: true, projectNumber: true, name: true }, skip, take: take + 1 }) : [],
    modules.has("DMS") ? tx.managedDocument.findMany({ where: { OR: [{ documentNumber: { contains: q } }, { title: { contains: q } }] }, select: { id: true, documentNumber: true, title: true }, skip, take: take + 1 }) : [],
  ]);
  const [parties, items, sales, purchases, projects, documents] = batches;
  const results = [
    ...parties.slice(0, take).map((row) => ({ type: "PARTY", id: row.id, title: row.nameAr, subtitle: row.unifiedNumber, href: `/parties/${row.id}` })),
    ...items.slice(0, take).map((row) => ({ type: "ITEM", id: row.id, title: row.nameAr, subtitle: row.code, href: `/items?itemId=${row.id}` })),
    ...sales.slice(0, take).map((row) => ({ type: "SALE", id: row.id, title: row.invoiceNumber, subtitle: row.party.nameAr, href: `/sales?invoiceId=${row.id}` })),
    ...purchases.slice(0, take).map((row) => ({ type: "PURCHASE", id: row.id, title: row.purchaseNumber, subtitle: row.party.nameAr, href: `/purchases?invoiceId=${row.id}` })),
    ...projects.slice(0, take).map((row) => ({ type: "PROJECT", id: row.id, title: row.name, subtitle: row.projectNumber, href: `/projects?projectId=${row.id}` })),
    ...documents.slice(0, take).map((row) => ({ type: "DOCUMENT", id: row.id, title: row.title, subtitle: row.documentNumber, href: `/documents?documentId=${row.id}` })),
  ].slice(0, take);
  return { query: q, page: Math.max(1, page), pageSize: take, results, hasMore: batches.some((batch) => batch.length > take) };
}
