import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { CommerceValidationError, commerceTotals, optionalDate, optionalText, parseCommerceLines } from "@/lib/commerce";
import { evaluateApprovalRules } from "@/lib/configuration";
import { authorizeRequest, authErrorResponse } from "@/lib/api-auth";
import { AuthError } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { runWithDataScope } from "@/lib/data-scope";
import { nextDocumentNumber } from "@/lib/document-numbering";

export async function GET(request: Request) {
  try {
    const context = await authorizeRequest(request, { moduleKey: "PURCHASES", action: "READ" });
    const params = new URL(request.url).searchParams;
    const from=params.get("from"),to=params.get("to"),partyId=Number(params.get("partyId")),itemId=Number(params.get("itemId")),status=params.get("status"),q=params.get("q")?.trim();
    const purchases=await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.purchase.findMany({where:{...(partyId>0?{partyId}:{}),...(itemId>0?{items:{some:{itemId}}}:{}),...(status?{status}:{}),...(from||to?{purchaseDate:{...(from?{gte:new Date(`${from}T00:00:00.000`)}:{}),...(to?{lte:new Date(`${to}T23:59:59.999`)}:{})}}:{}),...(q?{OR:[{purchaseNumber:{contains:q}},{supplierInvoiceNumber:{contains:q}},{referenceNumber:{contains:q}},{party:{nameAr:{contains:q}}},{party:{nameEn:{contains:q}}}]}:{})},include:{party:true,items:{include:{item:true}}},orderBy:[{purchaseDate:"desc"},{id:"desc"}]}));
    return NextResponse.json(purchases);
  } catch (error) {
    if(error instanceof AuthError){const response=authErrorResponse(error);return NextResponse.json({error:response.message,code:response.code},{status:response.status});}
    console.error(error);return NextResponse.json({error:"تعذر تحميل المشتريات"},{status:500});
  }
}

export async function POST(request: Request) {
  try {
    const context=await authorizeRequest(request,{moduleKey:"PURCHASES",action:"CREATE"});
    const body=(await request.json()) as Record<string,unknown>,purchaseDate=optionalDate(body.purchaseDate)??new Date(),partyId=Number(body.partyId);
    if(!Number.isInteger(partyId)||partyId<=0)throw new CommerceValidationError("المورد غير صحيح");
    const lines=parseCommerceLines(body.items),totals=commerceTotals(lines);
    const purchase=await runWithDataScope({tenantId:context.tenantId,companyId:context.companyId},()=>prisma.$transaction(async tx=>{
      const [party,validItems,approvalRules]=await Promise.all([tx.party.findUnique({where:{id:partyId}}),tx.item.count({where:{id:{in:lines.map(line=>line.itemId)},isActive:true}}),tx.approvalRule.findMany({where:{entityType:"PURCHASE",isActive:true},orderBy:{priority:"asc"}})]);
      if(!party?.isSupplier||!party.isActive)throw new CommerceValidationError("الكيان المحدد ليس موردًا نشطًا للمشتريات");
      if(validItems!==new Set(lines.map(line=>line.itemId)).size)throw new CommerceValidationError("توجد مادة غير موجودة أو غير نشطة");
      const purchaseNumber=optionalText(body.purchaseNumber)??await nextDocumentNumber(tx,"PINV",purchaseDate),requiredApprovals=evaluateApprovalRules(approvalRules,{...body,totalAmount:totals.totalAmount,subtotal:totals.subtotal});
      const created=await tx.purchase.create({data:{purchaseNumber,purchaseDate,partyId,supplierInvoiceNumber:optionalText(body.supplierInvoiceNumber),referenceNumber:optionalText(body.referenceNumber),paymentMethod:optionalText(body.paymentMethod),currency:optionalText(body.currency)?.toUpperCase()??"SAR",dueDate:optionalDate(body.dueDate),...totals,status:requiredApprovals.length?"PENDING":optionalText(body.status)??"DRAFT",notes:optionalText(body.notes),items:{create:lines}},include:{party:true,items:{include:{item:true}}}});
      await audit(tx,{action:"PURCHASE_INVOICE_CREATE",entityType:"PURCHASE_INVOICE",entityId:created.id,userId:String(context.userId),metadata:{purchaseNumber,direct:true}});
      return {...created,requiredApprovals};
    }));
    return NextResponse.json(purchase,{status:201});
  } catch(error) {
    if(error instanceof AuthError){const response=authErrorResponse(error);return NextResponse.json({error:response.message,code:response.code},{status:response.status});}
    if(error instanceof CommerceValidationError)return NextResponse.json({error:error.message},{status:400});
    if(error instanceof Prisma.PrismaClientKnownRequestError&&error.code==="P2002")return NextResponse.json({error:"رقم فاتورة المشتريات مستخدم مسبقًا"},{status:409});
    console.error(error);return NextResponse.json({error:"تعذر إنشاء فاتورة المشتريات"},{status:500});
  }
}
