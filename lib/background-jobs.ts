import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";
import { nextDocumentNumber } from "@/lib/document-numbering";
import { scanControlAlerts } from "@/lib/controls";

type Tx = Prisma.TransactionClient;
const supportedTypes = new Set(["CONTROL_SCAN", "DATABASE_INTEGRITY"]);
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
