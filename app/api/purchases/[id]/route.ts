import {NextResponse} from "next/server";
import {authorizeRequest} from "@/lib/api-auth";
import {postSupplierInvoiceJournal,reverseJournalEntry} from "@/lib/accounting";
import {audit} from "@/lib/audit";
import {runWithDataScope} from "@/lib/data-scope";
import {prisma} from "@/lib/prisma";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const context=await authorizeRequest(request,{moduleKey:"PURCHASES",action:"READ"}),id=Number((await params).id);const row=await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.purchase.findUnique({where:{id},include:{party:{include:{address:true}},items:{include:{item:{include:{unit:true}}}},creditDebitNotes:true}}));return row?NextResponse.json(row):NextResponse.json({error:"فاتورة المورد غير موجودة"},{status:404});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحميل الفاتورة"},{status:403});}
}
export async function PATCH(request:Request,{params}:{params:Promise<{id:string}>}){
  try{const context=await authorizeRequest(request,{moduleKey:"PURCHASES",action:"POST"}),id=Number((await params).id),body=await request.json() as Record<string,unknown>,action=String(body.action??"").toUpperCase();return await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},async()=>{
    const current=await prisma.purchase.findUnique({where:{id}});if(!current)return NextResponse.json({error:"فاتورة المورد غير موجودة"},{status:404});
    if(action==="POST"){if(current.status==="PENDING")return NextResponse.json({error:"يجب اعتماد الفاتورة قبل الترحيل"},{status:409});if(current.status==="CANCELLED")return NextResponse.json({error:"لا يمكن ترحيل فاتورة ملغاة"},{status:409});const result=await prisma.$transaction(async tx=>{const journal=await postSupplierInvoiceJournal(tx,id),purchase=await tx.purchase.update({where:{id},data:{status:"POSTED"}});await audit(tx,{action:"PURCHASE_INVOICE_POST",entityType:"PURCHASE_INVOICE",entityId:id,userId:String(context.userId),metadata:{journalId:journal.id}});return{purchase,journal}});return NextResponse.json(result);}
    if(action==="CANCEL"){const reason=String(body.reason??"").trim();if(reason.length<3)return NextResponse.json({error:"سبب الإلغاء مطلوب"},{status:400});const result=await prisma.$transaction(async tx=>{const journal=await tx.journalEntry.findFirst({where:{referenceType:"SUPPLIER_INVOICE",referenceId:id,status:"POSTED"}}),reversal=journal?await reverseJournalEntry(tx,{originalId:journal.id,description:`عكس فاتورة مورد ${current.purchaseNumber}: ${reason}`,referenceType:"SUPPLIER_INVOICE_REVERSAL",referenceId:id,referenceNumber:current.purchaseNumber}):null,purchase=await tx.purchase.update({where:{id},data:{status:"CANCELLED",notes:[current.notes,`سبب الإلغاء: ${reason}`].filter(Boolean).join("\n")}});await audit(tx,{action:"PURCHASE_INVOICE_CANCEL",entityType:"PURCHASE_INVOICE",entityId:id,userId:String(context.userId),metadata:{reason,reversalId:reversal?.id}});return{purchase,reversal}});return NextResponse.json(result);}
    return NextResponse.json({error:"الإجراء غير مدعوم"},{status:400});
  });}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"تعذر تحديث الفاتورة"},{status:400});}
}
