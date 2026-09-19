import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { applyStockMovement } from "../lib/inventory.ts";
import { changeWorkflowStatus, convertBusinessDocument, createBusinessDocument, createFinalInvoiceFromNote, parseWorkflowInput, updateBusinessDocument } from "../lib/workflows.ts";
import { cancelPostedNote, createNote, postNote } from "../lib/notes.ts";

const directory=mkdtempSync(join(tmpdir(),"netaj-workflow-test-"));const databasePath=join(directory,"workflow.db");copyFileSync("prisma/netaj.db",databasePath);
const prisma=new PrismaClient({adapter:new PrismaBetterSqlite3({url:`file:${databasePath}`})});
let partyId,itemId,truckId,driverId;
before(async()=>{const suffix=Date.now().toString(36).toUpperCase();await prisma.currency.upsert({where:{code:"EUR"},update:{isActive:true},create:{code:"EUR",nameAr:"اليورو",nameEn:"Euro",symbol:"€",isActive:true}});const unit=await prisma.unit.create({data:{code:`W${suffix}`,nameAr:"وحدة تدفق",nameEn:"Workflow"}});itemId=(await prisma.item.create({data:{code:`WF-${suffix}`,nameAr:"مادة تدفق متكامل",unitId:unit.id}})).id;partyId=(await prisma.party.create({data:{nameAr:"جهة تدفق متكامل",isCustomer:true,isSupplier:true}})).id;truckId=(await prisma.truck.create({data:{plateNumber:`WF-${suffix}`}})).id;driverId=(await prisma.driver.create({data:{name:"سائق التدفق",idNumber:`WF-${suffix}`}})).id;await prisma.$transaction(tx=>applyStockMovement(tx,{itemId,ownershipType:"COMPANY",movementType:"OPENING",quantityIn:100,unitCost:20}))});
after(async()=>{await prisma.$disconnect();rmSync(directory,{recursive:true,force:true})});
const body=(documentType)=>({documentType,documentDate:"2026-09-19",partyId,currency:"SAR",referenceNumber:"E2E-REF",paymentTerms:"30 days",items:[{itemId,quantity:5,unitPrice:100,discount:25,vatRate:15,description:"بند متكامل",materialGrade:"A"}]});
async function approve(id){return prisma.$transaction(tx=>changeWorkflowStatus(tx,id,"APPROVE"))}

test("تحرير المسودة يدعم العملات المهيأة ويعيد حساب البنود ويحفظ التدقيق",async()=>{
  const draft=await prisma.$transaction(tx=>createBusinessDocument(tx,parseWorkflowInput({...body("QUOTATION"),currency:"EUR"})));
  const updated=await prisma.$transaction(tx=>updateBusinessDocument(tx,draft.id,parseWorkflowInput({...body("QUOTATION"),currency:"EUR",referenceNumber:"EDITED",items:[{itemId,quantity:2,unitPrice:200,discount:10,vatRate:15,description:"بند معدل"}]})));
  assert.equal(updated.currency,"EUR");assert.equal(updated.referenceNumber,"EDITED");assert.equal(updated.lines.length,1);assert.equal(updated.totalAmount.toString(),"448.5");
  assert.equal(await prisma.auditLog.count({where:{action:"UPDATE",entityType:"QUOTATION",entityId:draft.id}}),1);
  await approve(draft.id);
  await assert.rejects(()=>prisma.$transaction(tx=>updateBusinessDocument(tx,draft.id,parseWorkflowInput({...body("QUOTATION"),currency:"EUR"}))),/مسودة فقط/);
});

test("Scenario A: QT -> PI -> SO -> DN -> Stock -> Trip -> Invoice -> Journal دون تكرار",async()=>{
  const quote=await prisma.$transaction(tx=>createBusinessDocument(tx,parseWorkflowInput(body("QUOTATION"))));assert.match(quote.documentNumber,/^QT-2026-\d{6}$/);await approve(quote.id);
  const piResult=await prisma.$transaction(tx=>convertBusinessDocument(tx,quote.id,"PROFORMA_INVOICE"));assert.equal(piResult.created,true);await approve(piResult.document.id);
  const orderResult=await prisma.$transaction(tx=>convertBusinessDocument(tx,piResult.document.id,"SALES_ORDER"));await approve(orderResult.document.id);
  const noteResult=await prisma.$transaction(tx=>convertBusinessDocument(tx,orderResult.document.id,"DELIVERY_NOTE",{transportMethod:"COMPANY",truckId,driverId}));assert.equal(noteResult.created,true);
  const posted=await prisma.$transaction(tx=>postNote(tx,noteResult.note.id));assert.ok(posted.trip);assert.equal((await prisma.companyStock.findUnique({where:{itemId}})).quantity.toString(),"95");
  const final=await prisma.$transaction(tx=>createFinalInvoiceFromNote(tx,noteResult.note.id));assert.equal(final.created,true);assert.equal(final.journal.totalDebit.toString(),final.journal.totalCredit.toString());assert.equal(final.journal.lines.length,3);
  const again=await prisma.$transaction(tx=>createFinalInvoiceFromNote(tx,noteResult.note.id));assert.equal(again.created,false);
  await prisma.$transaction(tx=>postNote(tx,noteResult.note.id));
  assert.equal(await prisma.stockMovement.count({where:{referenceType:"DELIVERY_RECEIPT_NOTE",referenceId:noteResult.note.id}}),1);
  assert.equal(await prisma.transportTrip.count({where:{noteId:noteResult.note.id}}),1);
  assert.equal(await prisma.sale.count({where:{deliveryNoteId:noteResult.note.id}}),1);
  assert.equal(await prisma.journalEntry.count({where:{referenceType:"SALES_INVOICE",referenceId:final.invoice.id}}),1);
  assert.equal(await prisma.journalEntry.count({where:{referenceType:"COGS_DELIVERY_NOTE",referenceId:noteResult.note.id}}),1);
});

test("Scenario B: PR -> PO -> GRN -> Stock -> Supplier Invoice -> Journal",async()=>{
  const request=await prisma.$transaction(tx=>createBusinessDocument(tx,parseWorkflowInput(body("PURCHASE_REQUEST"))));assert.match(request.documentNumber,/^PR-2026-\d{6}$/);await approve(request.id);
  const orderResult=await prisma.$transaction(tx=>convertBusinessDocument(tx,request.id,"PURCHASE_ORDER"));await approve(orderResult.document.id);
  const noteResult=await prisma.$transaction(tx=>convertBusinessDocument(tx,orderResult.document.id,"RECEIPT_NOTE",{transportMethod:"EXTERNAL"}));await prisma.$transaction(tx=>postNote(tx,noteResult.note.id));
  const final=await prisma.$transaction(tx=>createFinalInvoiceFromNote(tx,noteResult.note.id,{supplierInvoiceNumber:"SUP-E2E"}));assert.equal(final.created,true);assert.equal(final.journal.totalDebit.toString(),final.journal.totalCredit.toString());assert.equal(await prisma.purchase.count({where:{receiptNoteId:noteResult.note.id}}),1);assert.equal(await prisma.stockMovement.count({where:{referenceType:"DELIVERY_RECEIPT_NOTE",referenceId:noteResult.note.id}}),1);
});

test("Scenarios C/D/E: مخزون العميل السالب والنقل الخارجي وسيارة الشركة",async()=>{
  const customerReceipt=await prisma.$transaction(tx=>applyStockMovement(tx,{itemId,partyId,ownershipType:"PARTY",movementType:"RECEIPT",quantityIn:2,referenceType:"E2E_CUSTOMER",referenceId:1}));assert.equal(customerReceipt.newQuantity,2);
  const withdrawal=await prisma.$transaction(tx=>applyStockMovement(tx,{itemId,partyId,ownershipType:"PARTY",movementType:"DELIVERY",quantityOut:5,referenceType:"E2E_CUSTOMER",referenceId:2}));assert.equal(withdrawal.newQuantity,-3);assert.match(withdrawal.warning,/سالب/);
  const external=await prisma.businessDocument.findFirst({where:{documentType:"PURCHASE_ORDER"}});const existingNote=await prisma.deliveryReceiptNote.findFirst({where:{sourceDocumentId:external.id}});assert.equal(existingNote.transportMethod,"EXTERNAL");assert.equal(await prisma.transportTrip.count({where:{noteId:existingNote.id}}),0);
  const companyTrip=await prisma.transportTrip.findFirst({where:{truckId,driverId}});assert.ok(companyTrip);
});

test("الترقيم والتدقيق لا يتكرران، والقيود متوازنة",async()=>{
  const numbers=await prisma.businessDocument.findMany({select:{documentNumber:true}});assert.equal(new Set(numbers.map(x=>x.documentNumber)).size,numbers.length);
  assert.ok(await prisma.auditLog.count({where:{action:"CONVERT"}})>=4);
  const journals=await prisma.journalEntry.findMany();assert.ok(journals.length>=2);for(const journal of journals)assert.equal(journal.totalDebit.toString(),journal.totalCredit.toString());
});

test("إلغاء تسليم مخزون الشركة يعكس المخزون وقيد COGS مع حفظ التاريخ",async()=>{
  const note=await prisma.$transaction(tx=>createNote(tx,{noteType:"DELIVERY",noteDate:new Date("2026-09-19"),partyId,stockOwnership:"COMPANY",transportMethod:"CUSTOMER",items:[{itemId,quantity:1}]}));
  await prisma.$transaction(tx=>postNote(tx,note.id));
  const cogs=await prisma.journalEntry.findFirst({where:{referenceType:"COGS_DELIVERY_NOTE",referenceId:note.id}});assert.ok(cogs);
  await prisma.$transaction(tx=>cancelPostedNote(tx,note.id,"اختبار عكس COGS"));
  const [original,reversal]=await Promise.all([prisma.journalEntry.findUnique({where:{id:cogs.id}}),prisma.journalEntry.findFirst({where:{referenceType:"COGS_REVERSAL",referenceId:note.id}})]);
  assert.equal(original.status,"REVERSED");assert.ok(reversal);assert.equal(reversal.totalDebit.toString(),reversal.totalCredit.toString());
});
