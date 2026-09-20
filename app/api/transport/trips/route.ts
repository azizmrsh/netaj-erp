import {Prisma} from "@prisma/client";
import {NextResponse} from "next/server";
import {authorizeRequest} from "@/lib/api-auth";
import {audit} from "@/lib/audit";
import {runWithDataScope} from "@/lib/data-scope";
import {nextDocumentNumber} from "@/lib/document-numbering";
import {prisma} from "@/lib/prisma";

const number=(value:unknown)=>{const parsed=Number(value??0);return Number.isFinite(parsed)&&parsed>=0?new Prisma.Decimal(parsed):new Prisma.Decimal(0)};
const optionalId=(value:unknown)=>{const parsed=Number(value);return Number.isInteger(parsed)&&parsed>0?parsed:null};

export async function POST(request:Request){
  try{const context=await authorizeRequest(request,{moduleKey:"TRANSPORT",action:"CREATE"}),body=await request.json() as Record<string,unknown>,tripDate=new Date(String(body.tripDate??new Date()));if(Number.isNaN(tripDate.getTime()))throw new Error("تاريخ الرحلة غير صحيح");const result=await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.$transaction(async tx=>{
    const partyId=optionalId(body.partyId),itemId=optionalId(body.itemId),truckId=optionalId(body.truckId),driverId=optionalId(body.driverId);
    if(partyId&&!await tx.party.findFirst({where:{id:partyId}}))throw new Error("العميل غير موجود ضمن الشركة الحالية");
    if(itemId&&!await tx.item.findFirst({where:{id:itemId}}))throw new Error("المادة غير موجودة ضمن الشركة الحالية");
    if(truckId&&!await tx.truck.findFirst({where:{id:truckId}}))throw new Error("الشاحنة غير موجودة ضمن الشركة الحالية");
    if(driverId&&!await tx.driver.findFirst({where:{id:driverId}}))throw new Error("السائق غير موجود ضمن الشركة الحالية");
    const fuelLiters=number(body.fuelLiters),fuelPrice=number(body.fuelPricePerLiter),fuelCost=fuelLiters.mul(fuelPrice),driverFee=number(body.driverTripFee),maintenance=number(body.maintenanceCost),administrative=number(body.administrativeCost),road=number(body.roadPermitCost),other=number(body.otherCost),totalCost=fuelCost.add(driverFee).add(maintenance).add(administrative).add(road).add(other),revenue=number(body.transportRevenue);
    const row=await tx.transportTrip.create({data:{tripNumber:await nextDocumentNumber(tx,"TR",tripDate),tripDate,partyId,itemId,truckId,driverId,quantity:number(body.quantity),weight:body.weight?number(body.weight):null,source:String(body.source??"").trim()||"MANUAL",loadingPoint:String(body.loadingPoint??"").trim()||null,unloadingPoint:String(body.unloadingPoint??body.destination??"").trim()||null,estimatedKm:body.estimatedKm?number(body.estimatedKm):null,actualKm:body.actualKm?number(body.actualKm):null,transportRevenue:revenue,transportPricePerTon:body.transportPricePerTon?number(body.transportPricePerTon):null,fuelLiters,fuelPricePerLiter:fuelPrice,fuelCost,driverTripFee:driverFee,maintenanceCost:maintenance,administrativeCost:administrative,roadPermitCost:road,otherCost:other,totalCost,netProfit:revenue.sub(totalCost),notes:String(body.notes??"").trim()||"رحلة يدوية / تاريخية",status:"OPEN"}});await audit(tx,{action:"TRANSPORT_TRIP_MANUAL_CREATE",entityType:"TRANSPORT_TRIP",entityId:row.id,userId:String(context.userId),metadata:{tripNumber:row.tripNumber,source:row.source}});return row;
  }));return NextResponse.json(result,{status:201});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر إنشاء الرحلة"},{status:400})}
}
