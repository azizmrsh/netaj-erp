import {Prisma} from "@prisma/client";
import {NextResponse} from "next/server";
import {authorizeRequest} from "@/lib/api-auth";
import {audit} from "@/lib/audit";
import {runWithDataScope} from "@/lib/data-scope";
import {nextDocumentNumber} from "@/lib/document-numbering";
import {assertOdometerProgress,calculateFuelVariance} from "@/lib/fleet";
import {prisma} from "@/lib/prisma";

const text=(value:unknown)=>String(value??"").trim();
const decimal=(value:unknown,fallback="0")=>new Prisma.Decimal(text(value)||fallback);
const date=(value:unknown,fallback=new Date())=>{const parsed=value?new Date(String(value)):fallback;if(Number.isNaN(parsed.getTime()))throw new Error("التاريخ غير صحيح");return parsed};

export async function GET(request:Request){
  try{const context=await authorizeRequest(request,{moduleKey:"TRANSPORT",action:"READ"}),params=new URL(request.url).searchParams,truckId=Number(params.get("truckId"));return NextResponse.json(await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.$transaction(async tx=>({
    odometers:await tx.vehicleOdometerReading.findMany({where:{...(truckId>0?{truckId}: {})},include:{truck:{select:{plateNumber:true}}},orderBy:[{readingDate:"desc"},{id:"desc"}],take:200}),
    tires:await tx.vehicleTireRecord.findMany({where:{...(truckId>0?{truckId}: {})},include:{truck:{select:{plateNumber:true}}},orderBy:[{installedAt:"desc"},{id:"desc"}],take:200}),
    batteries:await tx.vehicleBatteryRecord.findMany({where:{...(truckId>0?{truckId}: {})},include:{truck:{select:{plateNumber:true}}},orderBy:[{installedAt:"desc"},{id:"desc"}],take:200}),
    fuel:await tx.vehicleFuelTransaction.findMany({where:{...(truckId>0?{truckId}: {})},include:{truck:{select:{plateNumber:true}},driver:{select:{name:true}}},orderBy:[{transactionDate:"desc"},{id:"desc"}],take:200}),
    maintenance:await tx.vehicleMaintenanceRecord.findMany({where:{...(truckId>0?{truckId}: {})},include:{truck:{select:{plateNumber:true}}},orderBy:[{maintenanceDate:"desc"},{id:"desc"}],take:200}),
    receipts:await tx.transportReceipt.findMany({where:{...(truckId>0?{truckId}: {})},include:{trip:{select:{tripNumber:true}},truck:{select:{plateNumber:true}},driver:{select:{name:true}}},orderBy:[{receiptDate:"desc"},{id:"desc"}],take:200}),
  }))));}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل سجل تشغيل الأسطول"},{status:403})}
}

export async function POST(request:Request){
  try{const context=await authorizeRequest(request,{moduleKey:"TRANSPORT",action:"CREATE"}),body=await request.json() as Record<string,unknown>,type=text(body.type).toUpperCase();const result=await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.$transaction(async tx=>{
    const truckId=Number(body.truckId),truck=truckId>0?await tx.truck.findFirst({where:{id:truckId,tenantId:context.tenantId,companyId:context.companyId}}):null;
    if(type!=="RECEIPT"&&!truck)throw new Error("الشاحنة غير موجودة");
    if(type==="ODOMETER"){
      const reading=decimal(body.reading),latest=await tx.vehicleOdometerReading.findFirst({where:{truckId},orderBy:[{readingDate:"desc"},{id:"desc"}]});
      assertOdometerProgress(latest?.reading,reading,text(body.correctionReason));
      const row=await tx.vehicleOdometerReading.create({data:{truckId,reading,readingDate:date(body.readingDate),sourceType:text(body.sourceType).toUpperCase()||"MANUAL",sourceNumber:text(body.sourceNumber)||null,recordedBy:String(context.userId),correctionReason:text(body.correctionReason)||null,notes:text(body.notes)||null}});
      if(reading.gte(truck!.currentOdometer))await tx.truck.update({where:{id:truckId},data:{currentOdometer:reading}});await audit(tx,{action:"FLEET_ODOMETER_CREATE",entityType:"TRUCK",entityId:truckId,userId:String(context.userId),metadata:{reading:String(reading)}});return row;
    }
    if(type==="TIRE"){
      const vehiclePart=text(body.vehiclePart).toUpperCase()||"TRACTOR",axle=Number(body.axle),position=text(body.position).toUpperCase();if(!Number.isInteger(axle)||axle<1||!position)throw new Error("موضع الإطار غير مكتمل");
      const current=await tx.vehicleTireRecord.findFirst({where:{truckId,vehiclePart,axle,position,status:"INSTALLED"},orderBy:{id:"desc"}});if(current)await tx.vehicleTireRecord.update({where:{id:current.id},data:{status:"REPLACED",removedAt:date(body.installedAt),removalOdometer:body.installationOdometer?decimal(body.installationOdometer):truck!.currentOdometer,replacementReason:text(body.replacementReason)||"REPLACED"}});
      const row=await tx.vehicleTireRecord.create({data:{truckId,vehiclePart,axle,position,serialNumber:text(body.serialNumber)||null,brand:text(body.brand)||null,model:text(body.model)||null,size:text(body.size)||null,installedAt:date(body.installedAt),installationOdometer:body.installationOdometer?decimal(body.installationOdometer):truck!.currentOdometer,cost:decimal(body.cost),supplier:text(body.supplier)||null,warrantyStart:body.warrantyStart?date(body.warrantyStart):null,warrantyExpiry:body.warrantyExpiry?date(body.warrantyExpiry):null,notes:text(body.notes)||null}});await audit(tx,{action:"FLEET_TIRE_INSTALL",entityType:"TRUCK",entityId:truckId,userId:String(context.userId),metadata:{recordId:row.id,vehiclePart,axle,position,replacedRecordId:current?.id}});return row;
    }
    if(type==="BATTERY"){
      const position=text(body.position).toUpperCase()||"MAIN",current=await tx.vehicleBatteryRecord.findFirst({where:{truckId,position,status:"INSTALLED"},orderBy:{id:"desc"}});if(current)await tx.vehicleBatteryRecord.update({where:{id:current.id},data:{status:"REPLACED",replacedAt:date(body.installedAt),replacementOdometer:body.installationOdometer?decimal(body.installationOdometer):truck!.currentOdometer,replacementReason:text(body.replacementReason)||"REPLACED"}});
      const row=await tx.vehicleBatteryRecord.create({data:{truckId,position,serialNumber:text(body.serialNumber)||null,brand:text(body.brand)||null,model:text(body.model)||null,specification:text(body.specification)||null,installedAt:date(body.installedAt),installationOdometer:body.installationOdometer?decimal(body.installationOdometer):truck!.currentOdometer,warrantyStart:body.warrantyStart?date(body.warrantyStart):null,warrantyExpiry:body.warrantyExpiry?date(body.warrantyExpiry):null,supplier:text(body.supplier)||null,cost:decimal(body.cost),notes:text(body.notes)||null}});await audit(tx,{action:"FLEET_BATTERY_INSTALL",entityType:"TRUCK",entityId:truckId,userId:String(context.userId),metadata:{recordId:row.id,position,replacedRecordId:current?.id}});return row;
    }
    if(type==="FUEL"){
      const liters=decimal(body.liters),pricePerLiter=decimal(body.pricePerLiter),tripId=Number(body.tripId)||null,trip=tripId?await tx.transportTrip.findFirst({where:{id:tripId,tenantId:context.tenantId,companyId:context.companyId}}):null,km=Number(trip?.actualKm??trip?.estimatedKm??0),fuel=truck!.fuelConsumption&&km>0?calculateFuelVariance({distanceKm:km,litersPer100Km:truck!.fuelConsumption,actualLiters:liters,pricePerLiter}):null,expected=fuel?.expected??null,variance=fuel?.variance??null,variancePercent=fuel?.variancePercent??null;
      const row=await tx.vehicleFuelTransaction.create({data:{truckId,driverId:Number(body.driverId)||trip?.driverId||null,tripId,transactionDate:date(body.transactionDate),odometer:body.odometer?decimal(body.odometer):null,liters,pricePerLiter,totalAmount:liters.mul(pricePerLiter),expectedLiters:expected,varianceLiters:variance,variancePercent,supplier:text(body.supplier)||null,referenceNumber:text(body.referenceNumber)||null,paymentSource:text(body.paymentSource)||null,notes:text(body.notes)||null}});await audit(tx,{action:"FLEET_FUEL_CREATE",entityType:"TRUCK",entityId:truckId,userId:String(context.userId),metadata:{recordId:row.id,liters:String(liters),expected:String(expected??"")}});return row;
    }
    if(type==="MAINTENANCE"){
      const row=await tx.vehicleMaintenanceRecord.create({data:{truckId,maintenanceDate:date(body.maintenanceDate),odometer:body.odometer?decimal(body.odometer):truck!.currentOdometer,maintenanceType:text(body.maintenanceType).toUpperCase(),issue:text(body.issue)||null,workDone:text(body.workDone)||null,workshop:text(body.workshop)||null,partsAndServices:text(body.partsAndServices)||null,cost:decimal(body.cost),downtimeHours:decimal(body.downtimeHours),nextDate:body.nextDate?date(body.nextDate):null,nextOdometer:body.nextOdometer?decimal(body.nextOdometer):null,status:text(body.status).toUpperCase()||"COMPLETED",notes:text(body.notes)||null}});await audit(tx,{action:"FLEET_MAINTENANCE_CREATE",entityType:"TRUCK",entityId:truckId,userId:String(context.userId),metadata:{recordId:row.id,type:row.maintenanceType}});return row;
    }
    if(type==="RECEIPT"){
      const tripId=Number(body.tripId),trip=await tx.transportTrip.findFirst({where:{id:tripId,tenantId:context.tenantId,companyId:context.companyId},include:{item:true}});if(!trip)throw new Error("الرحلة غير موجودة");const existing=await tx.transportReceipt.findUnique({where:{tripId}});if(existing)return existing;const rate=decimal(body.rate),quantity=decimal(body.quantity??trip.weight??trip.quantity),amount=body.amount?decimal(body.amount):quantity.mul(rate),vatRate=decimal(body.vatRate,"15"),vatAmount=amount.mul(vatRate).div(100),row=await tx.transportReceipt.create({data:{receiptNumber:await nextDocumentNumber(tx,"TRC",date(body.receiptDate)),tripId,receiptDate:date(body.receiptDate),truckId:trip.truckId,driverId:trip.driverId,source:text(body.source)||trip.loadingPoint||trip.source,destination:text(body.destination)||trip.unloadingPoint,material:text(body.material)||trip.item?.nameAr,quantity,rate,calculationBasis:text(body.calculationBasis)||"QUANTITY",amount,vatRate,vatAmount,totalAmount:amount.add(vatAmount),referenceNumber:text(body.referenceNumber)||trip.tripNumber,notes:text(body.notes)||null}});await audit(tx,{action:"TRANSPORT_RECEIPT_CREATE",entityType:"TRANSPORT_RECEIPT",entityId:row.id,userId:String(context.userId),metadata:{tripId}});return row;
    }
    throw new Error("نوع عملية الأسطول غير مدعوم");
  }));return NextResponse.json(result,{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر حفظ عملية الأسطول"},{status:400})}
}
