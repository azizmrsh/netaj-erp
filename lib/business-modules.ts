import{createCipheriv,createHash,randomBytes}from"node:crypto";import type{Prisma}from"@prisma/client";import{audit}from"@/lib/audit";import{nextDocumentNumber}from"@/lib/document-numbering";
export class BusinessModuleError extends Error{constructor(message:string,public readonly status=400){super(message)}}const text=(v:unknown)=>String(v??"").trim();const parse=<T>(v:string,f:T)=>{try{return JSON.parse(v)as T}catch{return f}};
export async function dmsWorkspace(tx:Prisma.TransactionClient){const[categories,documents]=await Promise.all([tx.documentCategory.findMany({where:{isActive:true},orderBy:{code:"asc"}}),tx.managedDocument.findMany({include:{category:true,versions:{orderBy:{version:"desc"}},permissions:true},orderBy:{updatedAt:"desc"}})]);return{categories,documents,expiryAlerts:documents.filter(d=>d.expiryDate&&d.expiryDate<=new Date(Date.now()+30*86400000)&&d.status==="ACTIVE")}}
export async function saveDms(tx:Prisma.TransactionClient,input:Record<string,unknown>,userId:number){const action=text(input.action).toUpperCase();if(action==="CATEGORY"){const code=text(input.code).toUpperCase();return tx.documentCategory.upsert({where:{tenantId_companyId_code:{tenantId:Number(input.tenantId),companyId:Number(input.companyId),code}},create:{code,name:text(input.name),defaultRetentionDays:Number(input.defaultRetentionDays)||null},update:{name:text(input.name),defaultRetentionDays:Number(input.defaultRetentionDays)||null}})}if(action==="DOCUMENT"){const category=await tx.documentCategory.findUnique({where:{id:Number(input.categoryId)}});if(!category)throw new BusinessModuleError("تصنيف المستند غير موجود");const row=await tx.managedDocument.create({data:{documentNumber:await nextDocumentNumber(tx,"DMS",new Date()),title:text(input.title),categoryId:category.id,ownerType:text(input.ownerType)||null,ownerId:Number(input.ownerId)||null,effectiveDate:input.effectiveDate?new Date(String(input.effectiveDate)):null,expiryDate:input.expiryDate?new Date(String(input.expiryDate)):null,confidentiality:text(input.confidentiality).toUpperCase()||"INTERNAL",createdBy:userId}});await audit(tx,{action:"DMS_DOCUMENT_CREATE",entityType:"MANAGED_DOCUMENT",entityId:row.id,userId:String(userId)});return row}if(action==="VERSION"){const documentId=Number(input.documentId),attachmentId=Number(input.attachmentId),document=await tx.managedDocument.findUnique({where:{id:documentId}}),attachment=await tx.attachment.findUnique({where:{id:attachmentId}});if(!document||!attachment||attachment.entityType!=="MANAGED_DOCUMENT"||attachment.entityId!==documentId)throw new BusinessModuleError("المستند أو المرفق غير صالح");const latest=await tx.managedDocumentVersion.findFirst({where:{documentId},orderBy:{version:"desc"}});return tx.managedDocumentVersion.create({data:{documentId,attachmentId,version:(latest?.version??0)+1,changeNotes:text(input.changeNotes)||null,uploadedBy:userId}})}if(action==="PERMISSION")return tx.managedDocumentPermission.upsert({where:{documentId_subjectType_subjectId:{documentId:Number(input.documentId),subjectType:text(input.subjectType).toUpperCase(),subjectId:text(input.subjectId)}},create:{documentId:Number(input.documentId),subjectType:text(input.subjectType).toUpperCase(),subjectId:text(input.subjectId),canRead:input.canRead!==false,canUpdate:Boolean(input.canUpdate)},update:{canRead:input.canRead!==false,canUpdate:Boolean(input.canUpdate)}});throw new BusinessModuleError("إجراء المستندات غير مدعوم")}
export async function approvalsWorkspace(tx:Prisma.TransactionClient){return{requests:await tx.unifiedApprovalRequest.findMany({include:{actions:{orderBy:{createdAt:"desc"}}},orderBy:[{status:"asc"},{createdAt:"desc"}]})}}
async function sourceDecision(tx:Prisma.TransactionClient,row:{entityType:string;entityId:number},action:string){const status=action==="APPROVE"?"APPROVED":action==="REJECT"?"REJECTED":"DRAFT";if(row.entityType==="SALE")await tx.sale.updateMany({where:{id:row.entityId},data:{status}});else if(row.entityType==="PURCHASE")await tx.purchase.updateMany({where:{id:row.entityId},data:{status}});else if(row.entityType==="EXPENSE")await tx.expense.updateMany({where:{id:row.entityId},data:{status}});else if(row.entityType==="PROJECT_CERTIFICATE")await tx.progressCertificate.updateMany({where:{id:row.entityId},data:{status}});else if(row.entityType==="PAYROLL")await tx.payrollRun.updateMany({where:{id:row.entityId},data:{status}})}
export async function saveApproval(tx:Prisma.TransactionClient,input:Record<string,unknown>,userId:number){const action=text(input.action).toUpperCase();if(action==="REQUEST"){const entityType=text(input.entityType).toUpperCase(),entityId=Number(input.entityId),moduleKey=text(input.moduleKey).toUpperCase();return tx.unifiedApprovalRequest.upsert({where:{tenantId_companyId_moduleKey_entityType_entityId:{tenantId:Number(input.tenantId),companyId:Number(input.companyId),moduleKey,entityType,entityId}},create:{requestNumber:await nextDocumentNumber(tx,"APR",new Date()),moduleKey,entityType,entityId,entityNumber:text(input.entityNumber)||null,title:text(input.title),requestedBy:userId,amount:Number(input.amount)||null,dueAt:input.dueAt?new Date(String(input.dueAt)):null},update:{title:text(input.title),status:"PENDING"}})}if(["APPROVE","REJECT","RETURN"].includes(action)){const row=await tx.unifiedApprovalRequest.findUnique({where:{id:Number(input.id)}});if(!row)throw new BusinessModuleError("طلب الموافقة غير موجود",404);if(row.status!=="PENDING")throw new BusinessModuleError("تم اتخاذ قرار على الطلب مسبقًا",409);await sourceDecision(tx,row,action);const status=action==="APPROVE"?"APPROVED":action==="REJECT"?"REJECTED":"RETURNED";await tx.unifiedApprovalAction.create({data:{requestId:row.id,action,comment:text(input.comment)||null,actorUserId:userId}});const updated=await tx.unifiedApprovalRequest.update({where:{id:row.id},data:{status}});await audit(tx,{action:`APPROVAL_${action}`,entityType:row.entityType,entityId:row.entityId,userId:String(userId),metadata:{requestId:row.id,comment:text(input.comment)}});return updated}throw new BusinessModuleError("إجراء الموافقات غير مدعوم")}
export async function portalWorkspace(tx:Prisma.TransactionClient){return{identities:(await tx.portalIdentity.findMany({include:{requests:true},orderBy:{createdAt:"desc"}})).map(x=>({...x,permissions:parse(x.permissionsJson,[])})),requests:await tx.portalRequest.findMany({include:{identity:true},orderBy:{createdAt:"desc"}})}}
export async function portalPartyWorkspace(tx: Prisma.TransactionClient, identityId: number) {
  const identity = await tx.portalIdentity.findUnique({ where: { id: identityId } });
  if (!identity || identity.status === "DISABLED") throw new BusinessModuleError("هوية البوابة غير متاحة", 403);
  const permissions = parse<string[]>(identity.permissionsJson, []);
  const party = await tx.party.findUnique({ where: { id: identity.partyId }, select: { id: true, nameAr: true, nameEn: true } });
  if (!party) throw new BusinessModuleError("الطرف المرتبط بالبوابة غير موجود", 404);
  const [sales, purchases, orders, documents, requests] = await Promise.all([
    permissions.includes("INVOICES")
      ? tx.sale.findMany({ where: { partyId: identity.partyId }, orderBy: { invoiceDate: "desc" }, take: 100 })
      : [],
    permissions.includes("INVOICES")
      ? tx.purchase.findMany({ where: { partyId: identity.partyId }, orderBy: { purchaseDate: "desc" }, take: 100 })
      : [],
    permissions.includes("ORDERS")
      ? tx.businessDocument.findMany({ where: { partyId: identity.partyId }, orderBy: { documentDate: "desc" }, take: 100 })
      : [],
    permissions.includes("DOCUMENTS")
      ? tx.managedDocument.findMany({
          where: { ownerType: "PARTY", ownerId: identity.partyId, status: "ACTIVE" },
          include: { versions: { orderBy: { version: "desc" }, take: 1 } },
          orderBy: { updatedAt: "desc" },
          take: 100,
        })
      : [],
    tx.portalRequest.findMany({ where: { portalIdentityId: identity.id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return { identity: { id: identity.id, status: identity.status, permissions }, party, sales, purchases, orders, documents, requests };
}
export async function savePortal(tx:Prisma.TransactionClient,input:Record<string,unknown>){const action=text(input.action).toUpperCase();if(action==="IDENTITY"){const partyId=Number(input.partyId);if(!await tx.party.findUnique({where:{id:partyId}}) )throw new BusinessModuleError("الطرف غير موجود");return tx.portalIdentity.create({data:{partyId,email:text(input.email).toLowerCase(),permissionsJson:JSON.stringify(Array.isArray(input.permissions)?input.permissions:[])}})}if(action==="REQUEST"){const identity=await tx.portalIdentity.findUnique({where:{id:Number(input.portalIdentityId)}});if(!identity)throw new BusinessModuleError("هوية البوابة غير موجودة");return tx.portalRequest.create({data:{portalIdentityId:identity.id,requestNumber:await nextDocumentNumber(tx,"PRQ",new Date()),requestType:text(input.requestType).toUpperCase(),subject:text(input.subject),details:text(input.details)||null}})}throw new BusinessModuleError("إجراء البوابة غير مدعوم")}
export async function treasuryWorkspace(tx: Prisma.TransactionClient) {
  const now = new Date();
  const end90 = new Date(now.getTime() + 90 * 86_400_000);
  const [banks, sales, purchases, adjustments] = await Promise.all([
    tx.bankAccount.findMany({ where: { isActive: true } }),
    tx.sale.findMany({
      where: { status: { notIn: ["CANCELLED"] }, dueDate: { lte: end90 } },
      select: {
        id: true,
        invoiceNumber: true,
        dueDate: true,
        totalAmount: true,
        party: { select: { nameAr: true } },
        allocations: { select: { amount: true } },
      },
    }),
    tx.purchase.findMany({
      where: { status: { notIn: ["CANCELLED"] }, dueDate: { lte: end90 } },
      select: {
        id: true,
        purchaseNumber: true,
        dueDate: true,
        totalAmount: true,
        party: { select: { nameAr: true } },
        allocations: { select: { amount: true } },
      },
    }),
    tx.treasuryForecastAdjustment.findMany({
      where: { forecastDate: { lte: end90 } },
      orderBy: { forecastDate: "asc" },
    }),
  ]);

  const opening = banks.reduce((total, bank) => total + Number(bank.currentBalance), 0);
  const events = [
    ...sales.map((sale) => ({
      date: sale.dueDate ?? now,
      direction: "IN",
      description: `${sale.invoiceNumber} · ${sale.party.nameAr}`,
      amount: Math.max(0, Number(sale.totalAmount) - sale.allocations.reduce((total, allocation) => total + Number(allocation.amount), 0)),
      sourceType: "SALE",
      sourceId: sale.id,
    })),
    ...purchases.map((purchase) => ({
      date: purchase.dueDate ?? now,
      direction: "OUT",
      description: `${purchase.purchaseNumber} · ${purchase.party.nameAr}`,
      amount: Math.max(0, Number(purchase.totalAmount) - purchase.allocations.reduce((total, allocation) => total + Number(allocation.amount), 0)),
      sourceType: "PURCHASE",
      sourceId: purchase.id,
    })),
    ...adjustments.map((adjustment) => ({
      date: adjustment.forecastDate,
      direction: adjustment.direction,
      description: adjustment.description,
      amount: (Number(adjustment.amount) * adjustment.probability) / 100,
      sourceType: adjustment.sourceType,
      sourceId: adjustment.sourceId,
    })),
  ].filter((event) => event.amount > 0);
  const forecast = (days: number) =>
    opening +
    events
      .filter((event) => event.date <= new Date(now.getTime() + days * 86_400_000))
      .reduce((total, event) => total + (event.direction === "IN" ? event.amount : -event.amount), 0);

  return {
    cashPosition: opening,
    banks,
    upcomingCollections: events.filter((event) => event.direction === "IN"),
    upcomingObligations: events.filter((event) => event.direction === "OUT"),
    forecasts: { days7: forecast(7), days30: forecast(30), days90: forecast(90) },
    events,
  };
}
export async function saveTreasuryAdjustment(tx:Prisma.TransactionClient,input:Record<string,unknown>){return tx.treasuryForecastAdjustment.create({data:{forecastDate:new Date(String(input.forecastDate)),direction:text(input.direction).toUpperCase()==="OUT"?"OUT":"IN",description:text(input.description),amount:Number(input.amount),probability:Math.min(100,Math.max(0,Number(input.probability)||100)),sourceType:"MANUAL_FORECAST"}})}
function encryptCredentials(value:unknown){const configured=process.env.INTEGRATION_ENCRYPTION_KEY;if(!configured)throw new BusinessModuleError("يجب ضبط INTEGRATION_ENCRYPTION_KEY قبل حفظ أي بيانات اعتماد",409);const key=createHash("sha256").update(configured).digest(),iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,iv),encrypted=Buffer.concat([cipher.update(JSON.stringify(value)),cipher.final()]);return`${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`}
export async function integrationWorkspace(tx:Prisma.TransactionClient){const[connections,endpoints,deliveries]=await Promise.all([tx.integrationConnection.findMany({orderBy:{code:"asc"}}),tx.webhookEndpoint.findMany({orderBy:{code:"asc"}}),tx.webhookDelivery.findMany({orderBy:{createdAt:"desc"},take:200})]);return{connections:connections.map(({encryptedCredentials,...safe})=>({...safe,credentialsConfigured:Boolean(encryptedCredentials),config:parse(safe.configJson,{})})),endpoints:endpoints.map(x=>({...x,secretHash:"[REDACTED]",eventTypes:parse(x.eventTypesJson,[])})),deliveries}}
export async function saveIntegration(tx:Prisma.TransactionClient,input:Record<string,unknown>,userId:string){const action=text(input.action).toUpperCase();if(action==="CONNECTION"){const code=text(input.code).toUpperCase();const status=input.credentials?"CONFIGURED":"DISABLED";const row=await tx.integrationConnection.upsert({where:{tenantId_companyId_code:{tenantId:Number(input.tenantId),companyId:Number(input.companyId),code}},create:{code,providerType:text(input.providerType).toUpperCase(),name:text(input.name),baseUrl:text(input.baseUrl)||null,status,encryptedCredentials:input.credentials?encryptCredentials(input.credentials):null,configJson:JSON.stringify(input.config??{})},update:{name:text(input.name),baseUrl:text(input.baseUrl)||null,status,encryptedCredentials:input.credentials?encryptCredentials(input.credentials):undefined,configJson:JSON.stringify(input.config??{})}});await audit(tx,{action:"INTEGRATION_CONNECTION_SAVE",entityType:"INTEGRATION_CONNECTION",entityId:row.id,userId,metadata:{providerType:row.providerType,status:row.status}});return row}if(action==="WEBHOOK"){const code=text(input.code).toUpperCase(),url=text(input.url);if(!/^https:\/\//i.test(url))throw new BusinessModuleError("Webhook يجب أن يستخدم HTTPS");const secret=randomBytes(32).toString("base64url"),secretHash=createHash("sha256").update(secret).digest("hex"),row=await tx.webhookEndpoint.upsert({where:{tenantId_companyId_code:{tenantId:Number(input.tenantId),companyId:Number(input.companyId),code}},create:{code,url,secretHash,eventTypesJson:JSON.stringify(Array.isArray(input.eventTypes)?input.eventTypes:[])},update:{url,secretHash,eventTypesJson:JSON.stringify(Array.isArray(input.eventTypes)?input.eventTypes:[])}});return{...row,secret}}if(action==="QUEUE_EVENT"){const eventId=text(input.eventId)||crypto.randomUUID();return tx.webhookDelivery.create({data:{endpointId:Number(input.endpointId)||null,eventType:text(input.eventType),eventId,payloadJson:JSON.stringify(input.payload??{}),nextAttemptAt:new Date()}})}throw new BusinessModuleError("إجراء التكامل غير مدعوم")}
