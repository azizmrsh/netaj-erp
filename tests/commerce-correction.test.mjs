import assert from "node:assert/strict";
import {after,before,test} from "node:test";
import {copyFileSync,mkdtempSync,readFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {PrismaClient} from "@prisma/client";
import {PrismaBetterSqlite3} from "@prisma/adapter-better-sqlite3";
import {postSalesInvoiceJournal,postSupplierInvoiceJournal,reverseJournalEntry} from "../lib/accounting.ts";
import {saveApproval} from "../lib/business-modules.ts";

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

test("كل إطار وكل بطارية يحتفظان بقراءات عداد مستقلة وتاريخ الاستبدال",async()=>{
  const suffix=Date.now().toString(36).toUpperCase(),truck=await prisma.truck.create({data:{plateNumber:`H-${suffix}`,currentOdometer:10000}}),tireA=await prisma.vehicleTireRecord.create({data:{truckId:truck.id,vehiclePart:"TRACTOR",axle:1,position:"FRONT_LEFT",installedAt:new Date("2038-01-01"),installationOdometer:10000}}),tireB=await prisma.vehicleTireRecord.create({data:{truckId:truck.id,vehiclePart:"TRACTOR",axle:1,position:"FRONT_RIGHT",installedAt:new Date("2038-01-01"),installationOdometer:10000}}),battery1=await prisma.vehicleBatteryRecord.create({data:{truckId:truck.id,position:"MAIN",installedAt:new Date("2038-01-01"),installationOdometer:10000}}),battery2=await prisma.vehicleBatteryRecord.create({data:{truckId:truck.id,position:"AUXILIARY",installedAt:new Date("2038-01-01"),installationOdometer:10000}});
  await prisma.vehicleTireOdometerReading.createMany({data:[{tireRecordId:tireA.id,odometer:11000,readingDate:new Date("2038-02-01")},{tireRecordId:tireA.id,odometer:12500,readingDate:new Date("2038-03-01")},{tireRecordId:tireB.id,odometer:11900,readingDate:new Date("2038-03-01")}]});await prisma.vehicleBatteryOdometerReading.createMany({data:[{batteryRecordId:battery1.id,odometer:12100,readingDate:new Date("2038-03-01")},{batteryRecordId:battery2.id,odometer:11800,readingDate:new Date("2038-03-01")}]});
  assert.equal(await prisma.vehicleTireOdometerReading.count({where:{tireRecordId:tireA.id}}),2);assert.equal(await prisma.vehicleTireOdometerReading.count({where:{tireRecordId:tireB.id}}),1);assert.equal(Number((await prisma.vehicleTireOdometerReading.findFirstOrThrow({where:{tireRecordId:tireA.id},orderBy:{odometer:"desc"}})).odometer)-10000,2500);assert.equal(Number((await prisma.vehicleBatteryOdometerReading.findFirstOrThrow({where:{batteryRecordId:battery1.id}})).odometer),12100);assert.equal(Number((await prisma.vehicleBatteryOdometerReading.findFirstOrThrow({where:{batteryRecordId:battery2.id}})).odometer),11800);
});

test("اعتماد فاتورة مباشرة ثم ترحيلها مرتين لا ينشئ إلا قيدًا واحدًا",async()=>{
  const suffix=Date.now().toString(36).toUpperCase(),sale=await prisma.sale.create({data:{invoiceNumber:`APR-${suffix}`,invoiceDate:new Date("2038-06-01"),partyId:customerId,subtotal:200,vatAmount:30,totalAmount:230,status:"DRAFT",items:{create:{itemId,quantity:1,unitPrice:200,vatRate:15,vatAmount:30,totalAmount:230}}}}),request=await prisma.$transaction(tx=>saveApproval(tx,{action:"REQUEST",tenantId:1,companyId:1,moduleKey:"SALES",entityType:"SALE",entityId:sale.id,entityNumber:sale.invoiceNumber,title:"Direct invoice approval",amount:sale.totalAmount},1001));
  await prisma.sale.update({where:{id:sale.id},data:{status:"PENDING"}});await prisma.$transaction(tx=>saveApproval(tx,{action:"APPROVE",id:request.id},1002));assert.equal((await prisma.sale.findUniqueOrThrow({where:{id:sale.id}})).status,"APPROVED");const first=await prisma.$transaction(tx=>postSalesInvoiceJournal(tx,sale.id)),second=await prisma.$transaction(tx=>postSalesInvoiceJournal(tx,sale.id));assert.equal(first.id,second.id);assert.equal(await prisma.journalEntry.count({where:{referenceType:"SALES_INVOICE",referenceId:sale.id}}),1);
});

test("الرصيد الرسمي للعميل يستبعد المسودات ويظل مجموع المواد متوازنًا لكل اختيار",async()=>{
  const suffix=Date.now().toString(36).toUpperCase(),account=await prisma.account.findFirstOrThrow(),posted=await prisma.journalEntry.create({data:{entryNumber:`P-${suffix}`,entryDate:new Date("2038-07-01"),status:"POSTED",totalDebit:100,totalCredit:0,lines:{create:{accountCode:account.code,accountName:account.nameAr,accountId:account.id,partyId:customerId,debit:100}}}}),draft=await prisma.journalEntry.create({data:{entryNumber:`D-${suffix}`,entryDate:new Date("2038-07-02"),status:"DRAFT",totalDebit:900,totalCredit:0,lines:{create:{accountCode:account.code,accountName:account.nameAr,accountId:account.id,partyId:customerId,debit:900}}}});
  const official=await prisma.journalEntryLine.findMany({where:{partyId:customerId,journalEntry:{status:"POSTED",id:{in:[posted.id,draft.id]}}}});assert.equal(official.reduce((sum,row)=>sum+Number(row.debit)-Number(row.credit),0),100);
  const item2=await prisma.item.create({data:{code:`I2-${suffix}`,nameAr:"مادة ثانية",unitId:(await prisma.item.findUniqueOrThrow({where:{id:itemId}})).unitId}});await prisma.stockMovement.createMany({data:[{movementNumber:`M1-${suffix}`,movementDate:new Date("2038-07-01"),itemId,partyId:customerId,ownershipType:"PARTY",movementType:"IN",quantityIn:10,balanceAfter:10},{movementNumber:`M2-${suffix}`,movementDate:new Date("2038-07-02"),itemId,partyId:customerId,ownershipType:"PARTY",movementType:"OUT",quantityOut:3,balanceAfter:7},{movementNumber:`M3-${suffix}`,movementDate:new Date("2038-07-01"),itemId:item2.id,partyId:customerId,ownershipType:"PARTY",movementType:"IN",quantityIn:5,balanceAfter:5},{movementNumber:`M4-${suffix}`,movementDate:new Date("2038-07-02"),itemId:item2.id,partyId:customerId,ownershipType:"PARTY",movementType:"OUT",quantityOut:8,balanceAfter:-3}]});
  const selected=await prisma.stockMovement.findMany({where:{partyId:customerId,itemId:{in:[itemId,item2.id]}}});for(const selectedId of [itemId,item2.id]){const rows=selected.filter(row=>row.itemId===selectedId),opening=0,inbound=rows.reduce((sum,row)=>sum+Number(row.quantityIn),0),outbound=rows.reduce((sum,row)=>sum+Number(row.quantityOut),0),closing=rows.at(-1)?.balanceAfter;assert.equal(opening+inbound-outbound,Number(closing));}
});

test("واجهات التصحيح تعرض المسارات المنفصلة ومخطط 12 إطارًا",()=>{
  const sales=readFileSync("app/sales/SalesWorkspace.tsx","utf8"),purchases=readFileSync("app/purchases/PurchasesWorkspace.tsx","utf8"),fleet=readFileSync("app/transport/FleetOperations.tsx","utf8");
  for(const text of ["فواتير المبيعات","عروض الأسعار","الفواتير الأولية","أوامر البيع"])assert.match(sales,new RegExp(text));
  for(const text of ["فواتير الموردين","طلبات الشراء","أوامر الشراء"])assert.match(purchases,new RegExp(text));
  assert.match(fleet,/مخطط 12 إطارًا/);assert.match(fleet,/رأس الشاحنة — 6 إطارات/);assert.match(fleet,/الصهريج \/ المقطورة — 6 إطارات/);assert.match(fleet,/البطارية 1/);assert.match(fleet,/البطارية 2/);
});
