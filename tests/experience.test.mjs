import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { loadNotificationCenter } from "../lib/notification-center.ts";
import { loadOperationsTwin } from "../lib/operations-twin.ts";

const directory = mkdtempSync(join(tmpdir(), "netaj-experience-test-")), database = join(directory, "experience.db"), suffix = Date.now().toString(36).toUpperCase();
copyFileSync("prisma/netaj.db", database);
const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: `file:${database}` }) });
before(async()=>{const now=new Date(),expiry=new Date(now.getTime()+7*86_400_000);await prisma.controlAlert.create({data:{alertType:"TEST",severity:"CRITICAL",title:"تنبيه اختباري",description:"مصدر فعلي",fingerprint:`EXP-${suffix}`}});await prisma.employee.create({data:{employeeNumber:`EXP-${suffix}`,nameAr:"موظف اختبار",idExpiry:expiry}})});
after(async()=>{await prisma.$disconnect();rmSync(directory,{recursive:true,force:true})});

test("مركز الإشعارات يدمج الرقابة والاستحقاقات ويصنف الحرج",async()=>{const data=await prisma.$transaction(tx=>loadNotificationCenter(tx,new Set(["CORE","HR","APPROVALS"])));assert.ok(data.counts.critical>=2);assert.ok(data.notifications.some(row=>row.category==="CONTROL"&&row.title==="تنبيه اختباري"));assert.ok(data.notifications.some(row=>row.category==="EXPIRY"&&row.description.includes(`EXP-${suffix}`)))});

test("التوأم التشغيلي يبني سلسلة مستند فعلية وإجراء تالٍ دون سجل مكرر",async()=>{const party=await prisma.party.create({data:{nameAr:`عميل توأم ${suffix}`,unifiedNumber:`TWIN-${suffix}`,isCustomer:true}}),document=await prisma.businessDocument.create({data:{documentNumber:`SO-TWIN-${suffix}`,documentType:"SALES_ORDER",direction:"SALE",partyId:party.id,totalAmount:500,status:"APPROVED"}});const countBefore=await prisma.businessDocument.count(),twin=await prisma.$transaction(loadOperationsTwin);const node=twin.nodes.find(row=>row.id===document.id);assert.equal(node?.nextAction,"إنشاء مستند النقل/الاستلام");assert.equal(node?.amount,500);assert.equal(await prisma.businessDocument.count(),countBefore)});
