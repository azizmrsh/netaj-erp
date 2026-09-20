import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./prisma/netaj.db" }) });

const batch = await prisma.importBatch.findUnique({ where: { batchNumber: "NETAJ-LEGACY-20260919-V1" } });
assert.equal(batch?.status, "COMPLETED", "The verified migration batch must be completed");
const [journals, lines, movements, snapshots, excluded, purchaseProof, duplicateMovements, duplicateEntries] = await Promise.all([
  prisma.journalEntry.findMany({ where: { tenantId: 1, companyId: 1, status: "POSTED" }, select: { id:true, entryNumber:true, totalDebit:true, totalCredit:true } }),
  prisma.journalEntryLine.count({ where: { tenantId: 1, companyId: 1 } }),
  prisma.stockMovement.count({ where: { tenantId: 1, companyId: 1, movementNumber: { startsWith: "LEG-" } } }),
  prisma.legacyReferenceSnapshot.count({ where: { tenantId: 1, companyId: 1, importBatchId: batch.id } }),
  prisma.journalEntry.count({ where: { entryNumber: "20260002237" } }),
  prisma.journalEntry.findUnique({ where: { entryNumber: "20260002235" }, select: { referenceNumber:true, totalDebit:true, totalCredit:true } }),
  prisma.$queryRawUnsafe(`SELECT movementNumber, COUNT(*) AS n FROM StockMovement GROUP BY movementNumber HAVING COUNT(*) > 1`),
  prisma.$queryRawUnsafe(`SELECT entryNumber, COUNT(*) AS n FROM JournalEntry GROUP BY entryNumber HAVING COUNT(*) > 1`),
]);
assert.equal(journals.length, 3677);
assert.equal(lines, 14306);
assert.equal(movements, 3725);
assert.equal(snapshots, 82);
assert.equal(excluded, 0, "The user-excluded SAR 360,000 entry must not be imported");
assert.equal(purchaseProof?.referenceNumber, "PO/0817");
assert.equal(Number(purchaseProof?.totalDebit), Number(purchaseProof?.totalCredit));
assert.equal(duplicateMovements.length, 0);
assert.equal(duplicateEntries.length, 0);
for (const journal of journals) assert.ok(Math.abs(Number(journal.totalDebit)-Number(journal.totalCredit)) < 0.005, `Unbalanced journal ${journal.entryNumber}`);
const totals = journals.reduce((result,row)=>({ debit:result.debit+Number(row.totalDebit), credit:result.credit+Number(row.totalCredit) }),{debit:0,credit:0});
assert.ok(Math.abs(totals.debit-totals.credit)<0.005);
const ahli = await prisma.bankAccount.findFirst({ where: { ledgerAccount: { code: "1030110" } } });
assert.equal(Number(ahli?.currentBalance), 364840.41);
console.log(JSON.stringify({ ok:true, batch:batch.batchNumber, journals:journals.length, lines, movements, snapshots, totalDebit:Number(totals.debit.toFixed(2)), totalCredit:Number(totals.credit.toFixed(2)), nationalBankBookBalance:Number(ahli?.currentBalance), excludedEntry20260002237:excluded },null,2));
await prisma.$disconnect();
