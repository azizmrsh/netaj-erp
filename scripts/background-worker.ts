import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { prisma } from "../lib/prisma";
import { runWithDataScope } from "../lib/data-scope";
import { runBackgroundJob } from "../lib/background-jobs";

const discovery=new PrismaClient({adapter:new PrismaBetterSqlite3({url:process.env.DATABASE_URL??"file:./prisma/netaj.db"})});
const once=process.argv.includes("--once"),pollMs=Math.max(250,Number(process.env.BACKGROUND_WORKER_POLL_MS)||2000),leaseMs=Math.max(60_000,Number(process.env.BACKGROUND_WORKER_LEASE_MS)||15*60_000);let stopping=false;
process.on("SIGTERM",()=>{stopping=true});process.on("SIGINT",()=>{stopping=true});

async function recoverExpiredLeases(){const cutoff=new Date(Date.now()-leaseMs);return discovery.backgroundJob.updateMany({where:{status:"RUNNING",startedAt:{lt:cutoff}},data:{status:"RETRY",nextRetryAt:new Date(),lastError:"انتهت مهلة العامل قبل إكمال المهمة"}})}
async function nextJob(){const now=new Date();return discovery.backgroundJob.findFirst({where:{status:{in:["PENDING","RETRY"]},scheduledAt:{lte:now},OR:[{nextRetryAt:null},{nextRetryAt:{lte:now}}]},orderBy:[{priority:"asc"},{scheduledAt:"asc"},{id:"asc"}]})}
async function executeOne(){const job=await nextJob();if(!job)return false;const result=await runWithDataScope({tenantId:job.tenantId,companyId:job.companyId},()=>prisma.$transaction(tx=>runBackgroundJob(tx,job.id,"background-worker")));console.log(JSON.stringify({jobNumber:result.jobNumber,jobType:result.jobType,status:result.status,attempts:result.attempts,tenantId:job.tenantId,companyId:job.companyId}));return true}
async function main(){await recoverExpiredLeases();do{const worked=await executeOne();if(once||stopping)break;if(!worked)await new Promise(resolve=>setTimeout(resolve,pollMs))}while(!stopping)}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(async()=>{await Promise.all([discovery.$disconnect(),prisma.$disconnect()])});
