import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { accountDirectory, deleteAccount, filterAccountDirectory, saveAccount } from '../lib/account-directory.ts';
import { createBalancedJournal } from '../lib/accounting.ts';

const dir=mkdtempSync(join(tmpdir(),'netaj-account-directory-')),db=join(dir,'test.db');
copyFileSync('prisma/netaj.db',db);
const prisma=new PrismaClient({adapter:new PrismaBetterSqlite3({url:`file:${db}`})});
const prefix=`AD${Date.now()}`;
after(async()=>{await prisma.$disconnect();rmSync(dir,{recursive:true,force:true});});
test('Account editing persists hierarchy, status and metadata with audit; cycle and used account deletion are blocked',async()=>{
 const root=await prisma.$transaction(tx=>saveAccount(tx,{code:prefix,nameAr:'جذر اختبار',accountType:'ASSET',allowPosting:false},'account-test'));
 const child=await prisma.$transaction(tx=>saveAccount(tx,{code:prefix+'1',nameAr:'حركة اختبار',nameEn:'Test ledger',accountType:'ASSET',parentId:root.id,description:'محفوظ',normalBalance:'DEBIT'},'account-test'));
 const contra=await prisma.$transaction(tx=>saveAccount(tx,{code:prefix+'2',nameAr:'مقابل اختبار',accountType:'EQUITY'},'account-test'));
 await assert.rejects(prisma.$transaction(tx=>saveAccount(tx,{parentId:root.id},'account-test',root.id)),/نفسه|فروعه/);
 await assert.rejects(prisma.$transaction(tx=>saveAccount(tx,{code:prefix+'3',nameAr:'خطأ',accountType:'ASSET',parentId:child.id},'account-test')),/رئيسيًا/);
 await prisma.$transaction(tx=>createBalancedJournal(tx,{entryDate:new Date('2026-09-20'),description:'Directory balance test',referenceType:'ACCOUNT_DIRECTORY_TEST',referenceId:child.id,referenceNumber:prefix,lines:[{accountId:child.id,debit:123.45},{accountId:contra.id,credit:123.45}]}));
 const report=await prisma.$transaction(tx=>accountDirectory(tx)),row=report.rows.find(r=>r.id===child.id);
 assert.equal(row.balance,123.45);assert.equal(row.description,'محفوظ');assert.equal(row.level,2);assert.equal(report.rows.find(r=>r.id===root.id).balance,123.45);assert.equal(report.rows.find(r=>r.id===contra.id).balance,123.45);
 await assert.rejects(prisma.$transaction(tx=>deleteAccount(tx,child.id,'account-test')),/لا يمكن حذف/);
 await assert.rejects(prisma.$transaction(tx=>saveAccount(tx,{accountType:'EXPENSE'},'account-test',child.id)),/تصنيف|حركات/);
 await prisma.$transaction(tx=>saveAccount(tx,{nameAr:'اسم معدل',isActive:false},'account-test',child.id));
 const updated=await prisma.$transaction(tx=>accountDirectory(tx));
 assert.equal(updated.rows.find(r=>r.id===child.id).isActive,false);assert.equal(updated.rows.find(r=>r.id===child.id).nameAr,'اسم معدل');
 assert.equal(filterAccountDirectory(updated.rows,new URLSearchParams({ids:String(child.id),status:'INACTIVE'})).length,1);
 assert.equal(await prisma.auditLog.count({where:{entityType:'ACCOUNT',entityId:child.id}}),2);
 await assert.rejects(prisma.$transaction(tx=>createBalancedJournal(tx,{entryDate:new Date(),description:'bad',referenceType:'BAD',referenceId:child.id,referenceNumber:'BAD',lines:[{accountId:contra.id,debit:1,credit:1},{accountId:contra.id,debit:1,credit:1}]})),/غير صحيحة/);
});
test('Only unused accounts can be deleted and the audit survives deletion',async()=>{
 const account=await prisma.$transaction(tx=>saveAccount(tx,{code:prefix+'unused',nameAr:'غير مستخدم',accountType:'EXPENSE'},'account-test'));
 await prisma.$transaction(tx=>deleteAccount(tx,account.id,'account-test'));
 assert.equal(await prisma.account.findUnique({where:{id:account.id}}),null);
 assert.equal(await prisma.auditLog.count({where:{entityType:'ACCOUNT',entityId:account.id,action:'ACCOUNT_DELETE'}}),1);
});
