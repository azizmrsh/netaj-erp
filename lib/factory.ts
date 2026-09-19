import { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { assertOpenAccountingPeriod, createBalancedJournal, postSalesInvoiceJournal } from "@/lib/accounting";
import { createAndPostExpense, ensureFinanceFoundation } from "@/lib/finance";
import { applyStockMovement } from "@/lib/inventory";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { getVerifiedDataScope } from "@/lib/data-scope";

type Tx = Prisma.TransactionClient;
export class FactoryError extends Error { constructor(public code: "INVALID_INPUT"|"NOT_FOUND"|"INVALID_STATUS", message:string){super(message);this.name="FactoryError";} }
const amount = (value:unknown,label:string,allowZero=false) => { let row:Prisma.Decimal; try{row=new Prisma.Decimal(String(value??0)).toDecimalPlaces(2);}catch{throw new FactoryError("INVALID_INPUT",`${label} غير صحيح`);} if(row.lt(0)||(!allowZero&&row.eq(0)))throw new FactoryError("INVALID_INPUT",`${label} غير صحيح`);return row; };
const date = (value:unknown) => {const row=value?new Date(String(value)):new Date();if(Number.isNaN(row.getTime()))throw new FactoryError("INVALID_INPUT","التاريخ غير صحيح");return row;};
const clean=(value:unknown)=>String(value??"").trim()||null;

export async function ensureFactoryFoundation(tx:Tx){await ensureFinanceFoundation(tx);}

export async function upsertFactoryFeeRate(tx:Tx,input:Record<string,unknown>){
  const partyId=Number(input.partyId),itemId=Number(input.itemId),feePerTon=amount(input.feePerTon,"رسوم الطن",true);
  const [party,item]=await Promise.all([tx.party.findUnique({where:{id:partyId}}),tx.item.findUnique({where:{id:itemId}})]);
  if(!party?.isCustomer||!item?.isActive)throw new FactoryError("NOT_FOUND","العميل أو المادة غير موجود");
  const row=await tx.factoryFeeRate.upsert({where:{partyId_itemId:{partyId,itemId}},create:{partyId,itemId,feePerTon,notes:clean(input.notes)},update:{feePerTon,isActive:true,notes:clean(input.notes)},include:{party:true,item:true}});
  await audit(tx,{action:"UPSERT",entityType:"FACTORY_FEE_RATE",entityId:row.id,metadata:{partyId,itemId,feePerTon:String(feePerTon)}});return row;
}

export async function upsertFactoryProductSetting(tx:Tx,input:Record<string,unknown>){
  const productItemId=Number(input.productItemId),rawItemId=Number(input.rawItemId),fuelItemId=input.fuelItemId?Number(input.fuelItemId):null;
  const defaultFuelPercentage=amount(input.defaultFuelPercentage??0,"نسبة الوقود",true);
  if(defaultFuelPercentage.gt(100)||productItemId===rawItemId)throw new FactoryError("INVALID_INPUT","إعداد مكونات المنتج غير صحيح");
  const ids=[productItemId,rawItemId,...(fuelItemId?[fuelItemId]:[])],items=await tx.item.count({where:{id:{in:ids},isActive:true}});
  if(items!==new Set(ids).size)throw new FactoryError("NOT_FOUND","إحدى مواد إعداد المنتج غير موجودة");
  const {companyId}=await getVerifiedDataScope();
  const row=await tx.factoryProductSetting.upsert({where:{companyId_productItemId:{companyId,productItemId}},create:{productItemId,rawItemId,fuelItemId,defaultFuelPercentage},update:{rawItemId,fuelItemId,defaultFuelPercentage,isActive:true}});
  await audit(tx,{action:"UPSERT",entityType:"FACTORY_PRODUCT_SETTING",entityId:row.id,metadata:{productItemId,rawItemId,fuelItemId,defaultFuelPercentage:String(defaultFuelPercentage)}});
  return row;
}

export async function createBlendedFactoryProduction(tx:Tx,input:Record<string,unknown>){
  await ensureFactoryFoundation(tx);
  const transactionDate=date(input.transactionDate),productItemId=Number(input.productItemId),quantity=amount(input.quantity,"كمية المنتج");
  const partyId=input.partyId?Number(input.partyId):null,ownershipType=String(input.ownershipType??(partyId?"PARTY":"COMPANY")).toUpperCase();
  if(!["COMPANY","PARTY"].includes(ownershipType)||(ownershipType==="PARTY"&&!partyId))throw new FactoryError("INVALID_INPUT","ملكية عملية الإنتاج غير صحيحة");
  const scope=await getVerifiedDataScope();
  const setting=await tx.factoryProductSetting.findUnique({where:{companyId_productItemId:{companyId:scope.companyId,productItemId}}});
  if(!setting?.isActive)throw new FactoryError("NOT_FOUND","إعداد مكونات المنتج غير موجود");
  const fuelPercentage=input.fuelPercentage===undefined?new Prisma.Decimal(setting.defaultFuelPercentage):amount(input.fuelPercentage,"نسبة الوقود",true);
  if(fuelPercentage.gt(100)||(fuelPercentage.gt(0)&&!setting.fuelItemId))throw new FactoryError("INVALID_INPUT","نسبة الوقود أو مادة الوقود غير مهيأة");
  const fuelQuantity=quantity.mul(fuelPercentage).div(100).toDecimalPlaces(4),rawQuantity=quantity.minus(fuelQuantity).toDecimalPlaces(4);
  const transactionNumber=await nextDocumentNumber(tx,"FT",transactionDate);
  const rawMovement=rawQuantity.gt(0)?await applyStockMovement(tx,{movementDate:transactionDate,itemId:setting.rawItemId,partyId,ownershipType:ownershipType as "COMPANY"|"PARTY",movementType:"PRODUCTION_CONSUMPTION",quantityOut:Number(rawQuantity),referenceType:"FACTORY_PRODUCTION",referenceNumber:transactionNumber,notes:clean(input.notes)}):null;
  let fuelMovement=null;
  if(fuelQuantity.gt(0)&&setting.fuelItemId)fuelMovement=await createFactoryFuelMovement(tx,{movementDate:transactionDate,itemId:setting.fuelItemId,movementType:"PRODUCTION_CONSUMPTION",quantity:fuelQuantity,productionItemId:productItemId,referenceType:"FACTORY_PRODUCTION",referenceNumber:transactionNumber,notes:input.notes});
  const outputMovement=await applyStockMovement(tx,{movementDate:transactionDate,itemId:productItemId,partyId,ownershipType:ownershipType as "COMPANY"|"PARTY",movementType:"PRODUCTION_OUTPUT",quantityIn:Number(quantity),referenceType:"FACTORY_PRODUCTION",referenceNumber:transactionNumber,notes:clean(input.notes)});
  const transaction=await tx.factoryTransaction.create({data:{transactionNumber,transactionDate,partyId,itemId:productItemId,transactionType:"BLENDED_PRODUCTION",quantity,rawItemId:setting.rawItemId,productItemId,fuelItemId:setting.fuelItemId,fuelPercentage,rawQuantity,fuelQuantity,referenceType:"FACTORY_PRODUCTION",referenceNumber:transactionNumber,description:clean(input.description),notes:clean(input.notes),postedAt:new Date()}});
  await audit(tx,{action:"POST",entityType:"FACTORY_TRANSACTION",entityId:transaction.id,metadata:{transactionNumber,ownershipType,rawMovementId:rawMovement?.movement.id??null,fuelMovementId:fuelMovement?.id??null,outputMovementId:outputMovement.movement.id,fuelPercentage:String(fuelPercentage)}});
  return {transaction,rawMovement,fuelMovement,outputMovement};
}

export async function createFactoryProduction(tx:Tx,input:Record<string,unknown>){
  await ensureFactoryFoundation(tx);
  const transactionDate=date(input.transactionDate),partyId=Number(input.partyId),itemId=Number(input.itemId),quantity=amount(input.quantity,"الكمية");
  const [party,item,configuredRate]=await Promise.all([tx.party.findUnique({where:{id:partyId}}),tx.item.findUnique({where:{id:itemId}}),tx.factoryFeeRate.findUnique({where:{partyId_itemId:{partyId,itemId}}})]);
  if(!party?.isCustomer||!item?.isActive)throw new FactoryError("NOT_FOUND","العميل أو المادة غير موجود");
  const feePerTon=input.manufacturingFeePerTon!==undefined?amount(input.manufacturingFeePerTon,"رسوم الطن",true):new Prisma.Decimal(configuredRate?.feePerTon??0);
  const feeTotal=quantity.mul(feePerTon).toDecimalPlaces(2),vatRate=amount(input.vatRate??15,"نسبة الضريبة",true),vatAmount=feeTotal.mul(vatRate).div(100).toDecimalPlaces(2),totalAmount=feeTotal.plus(vatAmount);
  await assertOpenAccountingPeriod(tx,transactionDate);
  const transactionNumber=await nextDocumentNumber(tx,"FT",transactionDate);
  const transaction=await tx.factoryTransaction.create({data:{transactionNumber,transactionDate,partyId,itemId,transactionType:"PRODUCTION",quantity,
    manufacturingFeePerTon:feePerTon,manufacturingFeeTotal:feeTotal,vatRate,vatAmount,totalAmount,description:clean(input.description),notes:clean(input.notes),
    referenceType:clean(input.referenceType),referenceId:input.referenceId?Number(input.referenceId):null,referenceNumber:clean(input.referenceNumber),postedAt:new Date()}});
  let journal=null;
  if(totalAmount.gt(0)){
    const invoiceNumber=await nextDocumentNumber(tx,"INV",transactionDate);
    const sale=await tx.sale.create({data:{invoiceNumber,invoiceDate:transactionDate,partyId,factoryTransactionId:transaction.id,referenceNumber:transactionNumber,
      subtotal:feeTotal,vatAmount,totalAmount,status:"COMPLETED",notes:`رسوم تصنيع مرتبطة بعملية ${transactionNumber}`,
      items:{create:{itemId,description:`رسوم تصنيع ${item.nameAr}`,quantity,unitPrice:feePerTon,vatRate,vatAmount,totalAmount}}}});
    journal=await postSalesInvoiceJournal(tx,sale.id);
    await tx.factoryTransaction.update({where:{id:transaction.id},data:{journalEntryId:journal.id}});
  }
  await audit(tx,{action:"POST",entityType:"FACTORY_TRANSACTION",entityId:transaction.id,metadata:{transactionNumber,quantity:String(quantity),feeTotal:String(feeTotal)}});
  return tx.factoryTransaction.findUniqueOrThrow({where:{id:transaction.id},include:{party:true,item:{include:{unit:true}},journalEntry:{include:{lines:true}},sale:true}});
}

export async function createFactoryFuelMovement(tx:Tx,input:Record<string,unknown>){
  await ensureFactoryFoundation(tx);
  const movementDate=date(input.movementDate),itemId=Number(input.itemId),movementType=String(input.movementType??"").toUpperCase();
  const additions=["ADDITION","PURCHASE","OPENING"],consumptions=["OPERATING_CONSUMPTION","PRODUCTION_CONSUMPTION","SALES_CONSUMPTION"];
  if(![...additions,...consumptions].includes(movementType))throw new FactoryError("INVALID_INPUT","نوع حركة الوقود غير صحيح");
  const quantity=amount(input.quantity,"الكمية"),unitCost=amount(input.unitCost,"سعر الوحدة",true),movementNumber=await nextDocumentNumber(tx,"FF",movementDate);
  const stock=await applyStockMovement(tx,{movementDate,itemId,ownershipType:"COMPANY",movementType:additions.includes(movementType)?"RECEIPT":"DELIVERY",
    ...(additions.includes(movementType)?{quantityIn:Number(quantity),unitCost:Number(unitCost)}:{quantityOut:Number(quantity)}),referenceType:"FACTORY_FUEL",referenceNumber:movementNumber,notes:clean(input.notes)});
  const effectiveCost=new Prisma.Decimal(stock.movement.unitCost),totalValue=quantity.mul(effectiveCost).toDecimalPlaces(2);
  const fuel=await tx.factoryFuelMovement.create({data:{movementNumber,movementDate,itemId,movementType,
    quantityIn:additions.includes(movementType)?quantity:0,quantityOut:consumptions.includes(movementType)?quantity:0,unitCost:effectiveCost,totalValue,
    balanceAfter:stock.newQuantity,balanceValue:new Prisma.Decimal(stock.newQuantity).mul(stock.averageValue).toDecimalPlaces(2),stockMovementId:stock.movement.id,
    productionItemId:input.productionItemId?Number(input.productionItemId):null,referenceType:clean(input.referenceType),referenceId:input.referenceId?Number(input.referenceId):null,
    referenceNumber:clean(input.referenceNumber),notes:clean(input.notes)}});
  if(consumptions.includes(movementType)&&totalValue.gt(0)){
    await assertOpenAccountingPeriod(tx,movementDate);
    const journal=await createBalancedJournal(tx,{entryDate:movementDate,description:`استهلاك وقود المصنع ${movementNumber}`,referenceType:"FACTORY_FUEL_CONSUMPTION",referenceId:fuel.id,referenceNumber:movementNumber,
      lines:[{mappingKey:"FACTORY_FUEL_EXPENSE",debit:totalValue},{mappingKey:"INVENTORY_ASSET",credit:totalValue}]});
    await tx.factoryFuelMovement.update({where:{id:fuel.id},data:{journalEntryId:journal.id}});
  }
  await audit(tx,{action:"POST",entityType:"FACTORY_FUEL_MOVEMENT",entityId:fuel.id,metadata:{movementType,quantity:String(quantity)}});
  return tx.factoryFuelMovement.findUniqueOrThrow({where:{id:fuel.id},include:{item:{include:{unit:true}},journalEntry:{include:{lines:true}}}});
}

export async function createFactoryMaintenance(tx:Tx,input:Record<string,unknown>){
  await ensureFactoryFoundation(tx);const maintenanceDate=date(input.maintenanceDate),value=amount(input.amount,"قيمة الصيانة",true),equipment=clean(input.equipment),maintenanceType=clean(input.maintenanceType);
  if(!equipment||!maintenanceType)throw new FactoryError("INVALID_INPUT","المعدة ونوع الصيانة مطلوبان");
  const maintenanceNumber=await nextDocumentNumber(tx,"FM",maintenanceDate);let expenseId:null|number=null;
  if(value.gt(0)){
    const category=await tx.expenseCategory.findUnique({where:{code:"MAINTENANCE"}});if(!category)throw new FactoryError("NOT_FOUND","تصنيف الصيانة غير مهيأ");
    const expense=await createAndPostExpense(tx,{expenseDate:maintenanceDate,categoryId:category.id,bankAccountId:input.bankAccountId,amountBeforeVat:value,vatAmount:input.vatAmount??0,
      description:`صيانة ${equipment} - ${maintenanceNumber}`,beneficiary:input.vendor,costCenter:"FACTORY",referenceNumber:maintenanceNumber,notes:input.notes});expenseId=expense.id;
  }
  const row=await tx.factoryMaintenance.create({data:{maintenanceNumber,maintenanceDate,equipment,maintenanceType,spareParts:clean(input.spareParts),laborDescription:clean(input.laborDescription),vendor:clean(input.vendor),description:clean(input.description),amount:value,expenseId,notes:clean(input.notes)}});
  await audit(tx,{action:"POST",entityType:"FACTORY_MAINTENANCE",entityId:row.id,metadata:{maintenanceNumber,expenseId}});return row;
}

export function factoryErrorResponse(error:unknown){if(error instanceof FactoryError)return{status:error.code==="NOT_FOUND"?404:400,message:error.message};if(error instanceof Error)return{status:400,message:error.message};return{status:500,message:"تعذر تنفيذ عملية المصنع"};}
