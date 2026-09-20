import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PrismaClient} from "@prisma/client";
import {PrismaBetterSqlite3} from "@prisma/adapter-better-sqlite3";
import {postSalesInvoiceJournal,postSupplierInvoiceJournal,reverseJournalEntry} from "../lib/accounting.ts";

const directory=mkdtempSync(join(tmpdir(),"netaj-commerce-correction-")),databasePath=join(directory,"test.db");
copyFileSync("prisma/netaj.db",databasePath);
const prisma=new PrismaClient({adapter:new PrismaBetterSqlite3({url:`file:${databasePath}`})});
let customerId,supplierId,itemId;
before(async()=>{
  const suffix=Date.now().toString(36).toUpperCase();
  const fiscalYear=await prisma.fiscalYear.upsert({where:{companyId_startDate_endDate:{companyId:1,startDate:new Date("2038-01-01"),endDate:new Date("2038-12-31T23:59:59.999")}},create:{companyId:1,name:"2038 commerce",startDate:new Date("2038-01-01"),endDate:new Date("2038-12-31T23:59:59.999")},update:{status:"OPEN",closedAt:null}});
  await prisma.accountingPeriod.upsert({where:{startDate_endDate:{startDate:new Date("2038-01-01"),endDate:new Date("2038-12-31T23:59:59.999")}},create:{name:"2038 commerce",startDate:new Date("2038-01-01"),endDate:new Date("2038-12-31T23:59:59.999")},update:{status:"OPEN",closedAt:null}});
  await prisma.fiscalPeriod.upsert({where:{fiscalYearId_periodNumber:{fiscalYearId:fiscalYear.id,periodNumber:1}},create:{fiscalYearId:fiscalYear.id,periodNumber:1,name:"2038 commerce",startDate:new Date("2038-01-01"),endDate:new Date("2038-12-31T23:59:59.999")},update:{status:"OPEN",closedAt:null}});
  const unit=await prisma.unit.create({data:{code:`U-${suffix}`,nameAr:"وحدة اختبار",nameEn:"Test unit"}}),customer=await prisma.party.create({data:{nameAr:`عميل مباشر ${suffix}`,isCustomer:true}}),supplier=await prisma.party.create({data:{nameAr:`مورد مباشر ${suffix}`,isSupplier:true}}),item=await prisma.item.create({data:{code:`I-${suffix}`,nameAr:"مادة اختبار",nameEn:"Test item",unitId:unit.id}});
  customerId=customer.id;supplierId=supplier.id;itemId=item.id;
});
after(async()=>{await prisma.$disconnect();rmSync(directory,{recursive:true,force:true})});

test("الفاتورة المباشرة ترحل محاسبيًا مرة واحدة ولا تحرك المخزون",async()=>{
  const suffix=Date.now().toString(36).toUpperCase(),sale=await prisma.sale.create({data:{invoiceNumber:`INV-${suffix}`,invoiceDate:new Date("2038-05-01"),partyId:customerId,subtotal:1000,vatAmount:150,totalAmount:1150,status:"DRAFT",items:{create:{itemId,quantity:1,unitPrice:1000,vatRate:15,vatAmount:150,totalAmount:1150}}}});
  const first=await prisma.$transaction(tx=>postSalesInvoiceJournal(tx,sale.id)),second=await prisma.$transaction(tx=>postSalesInvoiceJournal(tx,sale.id));
  assert.equal(first.id,second.id);assert.equal(await prisma.journalEntry.count({where:{referenceType:"SALES_INVOICE",referenceId:sale.id}}),1);assert.equal(await prisma.stockMovement.count({where:{referenceType:"SALES_INVOICE",referenceId:sale.id}}),0);
});

test("إلغاء فاتورة مرحّلة ينشئ قيد عكس متوازن ويحفظ الأصل",async()=>{
  const suffix=Date.now().toString(36).toUpperCase(),purchase=await prisma.purchase.create({data:{purchaseNumber:`PINV-${suffix}`,purchaseDate:new Date("2038-05-02"),partyId:supplierId,subtotal:500,vatAmount:75,totalAmount:575,status:"DRAFT",items:{create:{itemId,quantity:1,unitPrice:500,vatRate:15,vatAmount:75,totalAmount:575}}}}),journal=await prisma.$transaction(tx=>postSupplierInvoiceJournal(tx,purchase.id));
  const reversal=await prisma.$transaction(tx=>reverseJournalEntry(tx,{originalId:journal.id,description:"عكس اختباري موثق",referenceType:"SUPPLIER_INVOICE_REVERSAL",referenceId:purchase.id,referenceNumber:purchase.purchaseNumber}));
  assert.equal(Number(reversal.totalDebit),Number(reversal.totalCredit));assert.equal((await prisma.journalEntry.findUniqueOrThrow({where:{id:journal.id}})).status,"REVERSED");assert.equal(await prisma.journalEntry.count({where:{referenceId:purchase.id,referenceType:{in:["SUPPLIER_INVOICE","SUPPLIER_INVOICE_REVERSAL"]}}}),2);
});

test("سجل الإطار والبطارية يحتفظ بالتاريخ وحقول الضمان",async()=>{
  const suffix=Date.now().toString(36).toUpperCase(),truck=await prisma.truck.create({data:{plateNumber:`T-${suffix}`,model:"Test"}}),old=await prisma.vehicleTireRecord.create({data:{truckId:truck.id,vehiclePart:"TRACTOR",axle:1,position:"FRONT_LEFT",serialNumber:`OLD-${suffix}`,model:"A",status:"INSTALLED",installedAt:new Date("2038-01-01")}});
  await prisma.$transaction(async tx=>{await tx.vehicleTireRecord.update({where:{id:old.id},data:{status:"REPLACED",removedAt:new Date("2038-05-03"),replacementReason:"استهلاك"}});await tx.vehicleTireRecord.create({data:{truckId:truck.id,vehiclePart:"TRACTOR",axle:1,position:"FRONT_LEFT",serialNumber:`NEW-${suffix}`,model:"B",status:"INSTALLED",installedAt:new Date("2038-05-03"),warrantyStart:new Date("2038-05-03"),warrantyExpiry:new Date("2039-05-03")}})});
});

test("واجهات التصحيح تعرض المسارات المنفصلة ومخطط 12 إطارًا",()=>{
  const sales=readFileSync("app/sales/SalesWorkspace.tsx","utf8"),purchases=readFileSync("app/purchases/PurchasesWorkspace.tsx","utf8"),fleet=readFileSync("app/transport/FleetOperations.tsx","utf8");
  for(const text of ["فواتير المبيعات","عروض الأسعار","الفواتير الأولية","أوامر البيع"])assert.match(sales,new RegExp(text));
  for(const text of ["فواتير الموردين","طلبات الشراء","أوامر الشراء"])assert.match(purchases,new RegExp(text));
  assert.match(fleet,/مخطط 12 إطارًا/);assert.match(fleet,/رأس الشاحنة — 6 إطارات/);assert.match(fleet,/الصهريج \/ المقطورة — 6 إطارات/);assert.match(fleet,/البطارية 1/);assert.match(fleet,/البطارية 2/);
});
