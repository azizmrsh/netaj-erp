-- Keep the shared industry packs aware of the presentation module without forking core code.
UPDATE "IndustryTemplateDefinition" SET "configJson"='{"modules":["CORE","SALES","PURCHASES","INVENTORY","NOTES","TRANSPORT","ACCOUNTING","FACTORY","HR","EXTERNAL","PROJECTS","IMPORT","CONFIG","DESIGN"]}', "updatedAt"=CURRENT_TIMESTAMP WHERE "code"='NETAJ';
UPDATE "IndustryTemplateDefinition" SET "configJson"='{"modules":["CORE","SALES","PURCHASES","INVENTORY","ACCOUNTING","IMPORT","CONFIG","DESIGN"]}', "updatedAt"=CURRENT_TIMESTAMP WHERE "code"='TRADING';
UPDATE "IndustryTemplateDefinition" SET "configJson"='{"modules":["CORE","SALES","PURCHASES","TRANSPORT","ACCOUNTING","HR","IMPORT","CONFIG","DESIGN"]}', "updatedAt"=CURRENT_TIMESTAMP WHERE "code"='TRANSPORT';
UPDATE "IndustryTemplateDefinition" SET "configJson"='{"modules":["CORE","SALES","PURCHASES","INVENTORY","ACCOUNTING","PROJECTS","HR","IMPORT","CONFIG","DESIGN"]}', "updatedAt"=CURRENT_TIMESTAMP WHERE "code"='CONTRACTING';
UPDATE "IndustryTemplateDefinition" SET "configJson"='{"modules":["CORE","SALES","PURCHASES","INVENTORY","NOTES","FACTORY","ACCOUNTING","HR","IMPORT","CONFIG","DESIGN"]}', "updatedAt"=CURRENT_TIMESTAMP WHERE "code"='FACTORY';

-- Preserve the original transport section in the seeded legacy receipt/delivery layouts.
UPDATE "DocumentTemplateVersion" SET "designJson"=replace("designJson", '"reference","items"', '"reference","transport","items"')
WHERE "version"=1 AND "templateId" IN (SELECT "id" FROM "DocumentTemplate" WHERE "documentType" IN ('RECEIPT_NOTE','DELIVERY_NOTE'));
