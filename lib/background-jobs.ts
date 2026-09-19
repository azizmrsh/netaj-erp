import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { scanControlAlerts } from "@/lib/controls";
import { createDecipheriv, createHash, createHmac } from "node:crypto";
import { executeImportBatch } from "@/lib/data-import";

type Tx = Prisma.TransactionClient;
const supportedTypes = new Set(["CONTROL_SCAN", "DATABASE_INTEGRITY", "WEBHOOK_DELIVERY", "IMPORT_EXECUTE"]);
export class BackgroundJobError extends Error { constructor(message:string,public readonly status=400){super(message)} }

function parseJson(value:string){try{return JSON.parse(value) as unknown}catch{return null}}

export async function enqueueBackgroundJob(tx:Tx,input:{jobType:string;payload?:unknown;idempotencyKey?:string;priority?:number;scheduledAt?:Date;maxAttempts?:number},userId?:string){
  const jobType=String(input.jobType??"").trim().toUpperCase();
  if(!supportedTypes.has(jobType))throw new BackgroundJobError("نوع المهمة الخلفية غير مدعوم");
  const idempotencyKey=String(input.idempotencyKey??"").trim()||null;
  if(idempotencyKey){const existing=await tx.backgroundJob.findFirst({where:{jobType,idempotencyKey}});if(existing)return{job:existing,created:false}}
  const job=await tx.backgroundJob.create({data:{jobNumber:await nextDocumentNumber(tx,"JOB",new Date()),jobType,payloadJson:JSON.stringify(input.payload??{}),idempotencyKey,priority:Math.max(1,Math.min(999,Number(input.priority)||100)),scheduledAt:input.scheduledAt??new Date(),maxAttempts:Math.max(1,Math.min(10,Number(input.maxAttempts)||3)),createdBy:userId}});
  await audit(tx,{action:"BACKGROUND_JOB_ENQUEUE",entityType:"BACKGROUND_JOB",entityId:job.id,userId,metadata:{jobType,idempotencyKey}});
  return{job,created:true};
}

async function executeJob(tx:Tx,job:{id:number;jobType:string;payloadJson:string},userId?:string){
  if(job.jobType==="CONTROL_SCAN")return scanControlAlerts(tx,userId);
  if(job.jobType==="DATABASE_INTEGRITY"){
    const integrity=await tx.$queryRawUnsafe<Array<Record<string,string>>>("PRAGMA integrity_check");
    const foreignKeys=await tx.$queryRawUnsafe<Array<Record<string,unknown>>>("PRAGMA foreign_key_check");
    return{integrity,foreignKeys,valid:integrity.every(row=>Object.values(row).includes("ok"))&&foreignKeys.length===0};
  }
  if(job.jobType==="IMPORT_EXECUTE"){const payload=parseJson(job.payloadJson) as {batchId?:number}|null,batchId=Number(payload?.batchId);if(!Number.isInteger(batchId)||batchId<1)throw new BackgroundJobError("دفعة الاستيراد غير صحيحة");return executeImportBatch(tx,batchId,userId)}
  if(job.jobType==="WEBHOOK_DELIVERY"){
    const payload=parseJson(job.payloadJson) as {deliveryId?:number}|null,deliveryId=Number(payload?.deliveryId),delivery=await tx.webhookDelivery.findUnique({where:{id:deliveryId},include:{endpoint:true}});
    if(!delivery?.endpoint||delivery.endpoint.status!=="ACTIVE")throw new BackgroundJobError("Webhook delivery أو endpoint غير متاح",404);
    if(delivery.status==="DELIVERED")return{deliveryId,status:"DELIVERED",duplicate:true};
    if(!delivery.endpoint.encryptedSecret)throw new BackgroundJobError("يجب تدوير سر Webhook القديم قبل الإرسال",409);
    const configured=process.env.INTEGRATION_ENCRYPTION_KEY;if(!configured)throw new BackgroundJobError("INTEGRATION_ENCRYPTION_KEY غير مضبوط",503);
    const[ivText,tagText,dataText]=delivery.endpoint.encryptedSecret.split("."),key=createHash("sha256").update(configured).digest(),decipher=createDecipheriv("aes-256-gcm",key,Buffer.from(ivText,"base64"));decipher.setAuthTag(Buffer.from(tagText,"base64"));const secret=JSON.parse(Buffer.concat([decipher.update(Buffer.from(dataText,"base64")),decipher.final()]).toString("utf8")) as string,timestamp=new Date().toISOString(),signature=createHmac("sha256",secret).update(`${timestamp}.${delivery.payloadJson}`).digest("hex"),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20_000);
    try{const response=await fetch(delivery.endpoint.url,{method:"POST",headers:{"content-type":"application/json","user-agent":"NETAj-ERP-Webhook/1.0","x-netaj-event":delivery.eventType,"x-netaj-event-id":delivery.eventId,"x-netaj-timestamp":timestamp,"x-netaj-signature":`sha256=${signature}`},body:delivery.payloadJson,signal:controller.signal}),responseBody=(await response.text()).slice(0,2000);await tx.webhookDelivery.update({where:{id:delivery.id},data:{attemptCount:{increment:1},responseStatus:response.status,responseBody,status:response.ok?"DELIVERED":"RETRY",nextAttemptAt:response.ok?null:new Date(Date.now()+60_000),lastError:response.ok?null:`HTTP ${response.status}`}});if(!response.ok)throw new Error(`Webhook HTTP ${response.status}`);return{deliveryId,status:"DELIVERED",responseStatus:response.status}}catch(error){if(!(error instanceof Error&&error.message.startsWith("Webhook HTTP")))await tx.webhookDelivery.update({where:{id:delivery.id},data:{attemptCount:{increment:1},status:"RETRY",nextAttemptAt:new Date(Date.now()+60_000),lastError:error instanceof Error?error.message:"Webhook failure"}});throw error}finally{clearTimeout(timeout)}
  }
  throw new BackgroundJobError("لا يوجد منفذ آمن لهذا النوع");
}

export async function runBackgroundJob(tx:Tx,id:number,userId?:string){
  const current=await tx.backgroundJob.findUnique({where:{id}});
  if(!current)throw new BackgroundJobError("المهمة غير موجودة",404);
  if(!["PENDING","RETRY"].includes(current.status))throw new BackgroundJobError("حالة المهمة لا تسمح بالتنفيذ",409);
  if(current.scheduledAt>new Date()||(current.nextRetryAt&&current.nextRetryAt>new Date()))throw new BackgroundJobError("موعد تنفيذ المهمة لم يحن بعد",409);
  const running=await tx.backgroundJob.update({where:{id},data:{status:"RUNNING",startedAt:new Date(),attempts:{increment:1},lastError:null}});
  try{
    const result=await executeJob(tx,running,userId);
    const completed=await tx.backgroundJob.update({where:{id},data:{status:"COMPLETED",resultJson:JSON.stringify(result),completedAt:new Date(),nextRetryAt:null}});
    await audit(tx,{action:"BACKGROUND_JOB_COMPLETE",entityType:"BACKGROUND_JOB",entityId:id,userId,metadata:{jobType:running.jobType,attempts:completed.attempts}});
    return completed;
  }catch(error){
    const message=error instanceof Error?error.message:"فشل غير معروف",exhausted=running.attempts>=running.maxAttempts,nextRetryAt=exhausted?null:new Date(Date.now()+Math.min(3600,30*2**Math.max(0,running.attempts-1))*1000);
    const failed=await tx.backgroundJob.update({where:{id},data:{status:exhausted?"FAILED":"RETRY",lastError:message,nextRetryAt,completedAt:exhausted?new Date():null}});
    await audit(tx,{action:"BACKGROUND_JOB_FAIL",entityType:"BACKGROUND_JOB",entityId:id,userId,metadata:{jobType:running.jobType,attempts:failed.attempts,exhausted,error:message}});
    return failed;
  }
}

export async function retryBackgroundJob(tx:Tx,id:number,userId?:string){
  const current=await tx.backgroundJob.findUnique({where:{id}});
  if(!current)throw new BackgroundJobError("المهمة غير موجودة",404);
  if(!["FAILED","RETRY"].includes(current.status))throw new BackgroundJobError("لا يمكن إعادة هذه المهمة",409);
  const job=await tx.backgroundJob.update({where:{id},data:{status:"PENDING",attempts:0,lastError:null,nextRetryAt:null,completedAt:null,scheduledAt:new Date()}});
  await audit(tx,{action:"BACKGROUND_JOB_RETRY",entityType:"BACKGROUND_JOB",entityId:id,userId});return job;
}

export async function backgroundJobWorkspace(tx:Tx){
  const jobs=await tx.backgroundJob.findMany({orderBy:[{createdAt:"desc"}],take:200});
  const counts=await tx.backgroundJob.groupBy({by:["status"],_count:{_all:true}});
  return{jobs:jobs.map(row=>({...row,payload:parseJson(row.payloadJson),result:row.resultJson?parseJson(row.resultJson):null})),counts:Object.fromEntries(counts.map(row=>[row.status,row._count._all])),supportedTypes:[...supportedTypes]};
}
