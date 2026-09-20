import {NextResponse} from "next/server";
import {authorizeRequest} from "@/lib/api-auth";
import {audit} from "@/lib/audit";
import {runWithDataScope} from "@/lib/data-scope";
import {prisma} from "@/lib/prisma";

export async function PATCH(request:Request,{params}:{params:Promise<{ownerType:string;id:string}>}){
  try{
    const context=await authorizeRequest(request,{moduleKey:"TRANSPORT",action:"UPDATE"});
    const{ownerType,id:idText}=await params,id=Number(idText),body=await request.json() as Record<string,unknown>,action=String(body.action??"").toUpperCase();
    if(!Number.isInteger(id))throw new Error("الوثيقة غير صحيحة");
    if(!["ARCHIVE","ATTACH"].includes(action))throw new Error("الإجراء غير مدعوم");
    const attachmentUrl=String(body.attachmentUrl??"").trim();
    if(action==="ATTACH"&&!/^\/api\/attachments\/\d+$/.test(attachmentUrl))throw new Error("مرجع المرفق غير صحيح");
    const type=ownerType.toUpperCase(),result=await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.$transaction(async tx=>{
      const data=action==="ATTACH"?{attachmentUrl}:{status:"ARCHIVED",archivedAt:new Date(),archivedBy:String(context.userId)};
      if(type==="TRUCK"){
        if(!await tx.truckDocument.findFirst({where:{id}}))throw new Error("الوثيقة غير موجودة");
        const row=await tx.truckDocument.update({where:{id},data});
        await audit(tx,{action:`TRUCK_DOCUMENT_${action}`,entityType:"TRUCK_DOCUMENT",entityId:id,userId:String(context.userId),metadata:{reason:String(body.reason??""),attachmentUrl:action==="ATTACH"?attachmentUrl:undefined}});return row;
      }
      if(type==="DRIVER"){
        if(!await tx.driverDocument.findFirst({where:{id}}))throw new Error("الوثيقة غير موجودة");
        const row=await tx.driverDocument.update({where:{id},data});
        await audit(tx,{action:`DRIVER_DOCUMENT_${action}`,entityType:"DRIVER_DOCUMENT",entityId:id,userId:String(context.userId),metadata:{reason:String(body.reason??""),attachmentUrl:action==="ATTACH"?attachmentUrl:undefined}});return row;
      }
      throw new Error("نوع الوثيقة غير صحيح");
    }));
    return NextResponse.json(result);
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحديث الوثيقة"},{status:400})}
}
