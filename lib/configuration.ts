import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

const ENTITY_TYPES = new Set(["PARTY", "ITEM", "SALE", "PURCHASE", "PROJECT", "EMPLOYEE", "TRANSPORT_TRIP", "DELIVERY_RECEIPT_NOTE"]);
const FIELD_TYPES = new Set(["TEXT", "LONG_TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTISELECT"]);
const CONFIG_CATEGORIES = new Set(["LABELS", "VISIBILITY", "STATUSES", "DOCUMENT_TYPES", "NUMBERING", "CATEGORIES", "COST_CENTERS", "UNITS", "TAXES", "PAYMENT_METHODS", "EXPENSE_TYPES", "REVENUE_TYPES", "MENU", "GENERAL"]);

export class ConfigurationError extends Error {
  constructor(message: string, public readonly code = "CONFIG_VALIDATION", public readonly status = 400) { super(message); }
}
const text = (value: unknown) => String(value ?? "").trim();
const parseJson = <T>(value: string, fallback: T): T => { try { return JSON.parse(value) as T; } catch { return fallback; } };

export async function listConfiguration(tx: Prisma.TransactionClient, entityType?: string | null) {
  const normalized = text(entityType).toUpperCase();
  const [fields, configurations, approvalRules, templates, profile] = await Promise.all([
    tx.customFieldDefinition.findMany({ where: normalized ? { entityType: normalized } : {}, orderBy: [{ entityType: "asc" }, { sortOrder: "asc" }] }),
    tx.companyConfiguration.findMany({ orderBy: [{ category: "asc" }, { configKey: "asc" }] }),
    tx.approvalRule.findMany({ orderBy: [{ entityType: "asc" }, { priority: "asc" }] }),
    tx.industryTemplateDefinition.findMany({ where: { isActive: true }, orderBy: { code: "asc" } }),
    tx.companyIndustryProfile.findFirst({ include: { template: true } }),
  ]);
  return {
    entityTypes: [...ENTITY_TYPES], fieldTypes: [...FIELD_TYPES], categories: [...CONFIG_CATEGORIES], templates, profile,
    fields: fields.map((field) => ({ ...field, options: parseJson(field.optionsJson, []), validation: parseJson(field.validationJson, {}), condition: parseJson(field.conditionJson, {}) })),
    configurations: configurations.map((row) => ({ ...row, value: parseJson(row.valueJson, null) })),
    approvalRules: approvalRules.map((rule) => ({ ...rule, condition: parseJson(rule.conditionJson, {}), steps: parseJson(rule.stepsJson, []) })),
  };
}

export async function upsertCustomField(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId?: string | null) {
  const entityType = text(input.entityType).toUpperCase(), fieldKey = text(input.fieldKey).toLowerCase().replace(/[^a-z0-9_]/g, "_"), fieldType = text(input.fieldType).toUpperCase();
  if (!ENTITY_TYPES.has(entityType) || !fieldKey || !text(input.labelAr) || !FIELD_TYPES.has(fieldType)) throw new ConfigurationError("بيانات الحقل المخصص غير صالحة");
  const options = Array.isArray(input.options) ? input.options.map(text).filter(Boolean) : [];
  if (["SELECT", "MULTISELECT"].includes(fieldType) && !options.length) throw new ConfigurationError("حقل الاختيار يحتاج خيارًا واحدًا على الأقل");
  const validation = input.validation && typeof input.validation === "object" && !Array.isArray(input.validation) ? input.validation : {};
  const condition = input.condition && typeof input.condition === "object" && !Array.isArray(input.condition) ? input.condition : {};
  const data = { labelAr: text(input.labelAr), labelEn: text(input.labelEn) || null, fieldType, required: Boolean(input.required), visible: input.visible !== false, optionsJson: JSON.stringify(options), defaultValue: text(input.defaultValue) || null, validationJson: JSON.stringify(validation), conditionJson: JSON.stringify(condition), sortOrder: Number(input.sortOrder ?? 0), isActive: input.isActive !== false };
  const record = await tx.customFieldDefinition.upsert({ where: { tenantId_companyId_entityType_fieldKey: { tenantId: Number(input.tenantId ?? 1), companyId: Number(input.companyId ?? 1), entityType, fieldKey } }, create: { entityType, fieldKey, ...data }, update: data });
  await audit(tx, { action: "CONFIG_CUSTOM_FIELD_UPSERT", entityType: "CUSTOM_FIELD_DEFINITION", entityId: record.id, userId, metadata: { entityType, fieldKey, fieldType } });
  return record;
}

export async function upsertCompanyConfiguration(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId?: string | null) {
  const category = text(input.category).toUpperCase(), configKey = text(input.configKey).toUpperCase().replace(/[^A-Z0-9_.-]/g, "_");
  if (!CONFIG_CATEGORIES.has(category) || !configKey || input.value === undefined) throw new ConfigurationError("بيانات الإعداد غير صالحة");
  const record = await tx.companyConfiguration.upsert({ where: { tenantId_companyId_category_configKey: { tenantId: Number(input.tenantId ?? 1), companyId: Number(input.companyId ?? 1), category, configKey } }, create: { category, configKey, labelAr: text(input.labelAr) || null, labelEn: text(input.labelEn) || null, valueType: text(input.valueType).toUpperCase() || "JSON", valueJson: JSON.stringify(input.value), updatedBy: userId ?? null }, update: { labelAr: text(input.labelAr) || null, labelEn: text(input.labelEn) || null, valueType: text(input.valueType).toUpperCase() || "JSON", valueJson: JSON.stringify(input.value), isActive: input.isActive !== false, updatedBy: userId ?? null } });
  await audit(tx, { action: "CONFIG_UPSERT", entityType: "COMPANY_CONFIGURATION", entityId: record.id, userId, metadata: { category, configKey } });
  return record;
}

export async function upsertApprovalRule(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId?: string | null) {
  const code = text(input.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_"), entityType = text(input.entityType).toUpperCase();
  const condition = input.condition && typeof input.condition === "object" && !Array.isArray(input.condition) ? input.condition : {};
  const steps = Array.isArray(input.steps) ? input.steps : [];
  if (!code || !ENTITY_TYPES.has(entityType) || !text(input.name) || !steps.length) throw new ConfigurationError("قاعدة الاعتماد تحتاج كودًا وكيانًا وخطوة واحدة على الأقل");
  for (const step of steps) if (!step || typeof step !== "object" || !text((step as Record<string, unknown>).roleCode)) throw new ConfigurationError("كل خطوة اعتماد تحتاج دورًا");
  const record = await tx.approvalRule.upsert({ where: { tenantId_companyId_code: { tenantId: Number(input.tenantId ?? 1), companyId: Number(input.companyId ?? 1), code } }, create: { code, name: text(input.name), entityType, conditionJson: JSON.stringify(condition), stepsJson: JSON.stringify(steps), priority: Number(input.priority ?? 100), createdBy: userId ?? null }, update: { name: text(input.name), entityType, conditionJson: JSON.stringify(condition), stepsJson: JSON.stringify(steps), priority: Number(input.priority ?? 100), isActive: input.isActive !== false } });
  await audit(tx, { action: "CONFIG_APPROVAL_RULE_UPSERT", entityType: "APPROVAL_RULE", entityId: record.id, userId, metadata: { code, entityType } });
  return record;
}

export async function applyIndustryTemplate(tx: Prisma.TransactionClient, companyId: number, templateCode: string, userId?: string | null) {
  const template = await tx.industryTemplateDefinition.findUnique({ where: { code: templateCode } });
  if (!template?.isActive) throw new ConfigurationError("قالب القطاع غير موجود", "TEMPLATE_NOT_FOUND", 404);
  const config = parseJson<{ modules?: string[] }>(template.configJson, {}), modules = new Set(config.modules ?? []);
  for (const moduleKey of modules) {
    const definition = await tx.moduleDefinition.findUnique({ where: { key: moduleKey } });
    if (definition) await tx.companyModule.upsert({ where: { companyId_moduleKey: { companyId, moduleKey } }, create: { companyId, moduleKey, enabled: true }, update: { enabled: true } });
  }
  const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
  const profile = await tx.companyIndustryProfile.upsert({ where: { companyId }, create: { tenantId: company.tenantId, companyId, templateCode }, update: { templateCode, appliedAt: new Date() } });
  await audit(tx, { action: "CONFIG_INDUSTRY_TEMPLATE_APPLY", entityType: "COMPANY", entityId: companyId, userId, metadata: { templateCode, enabledModules: [...modules] } });
  return profile;
}

export async function customFieldsForEntity(tx: Prisma.TransactionClient, entityType: string, entityId?: number) {
  const definitions = await tx.customFieldDefinition.findMany({ where: { entityType, isActive: true, visible: true }, orderBy: { sortOrder: "asc" } });
  const values = entityId ? await tx.customFieldValue.findMany({ where: { entityType, entityId } }) : [];
  const byField = new Map(values.map((row) => [row.fieldId, parseJson(row.valueJson, null)]));
  return definitions.map((definition) => ({ ...definition, options: parseJson(definition.optionsJson, []), validation: parseJson(definition.validationJson, {}), condition: parseJson(definition.conditionJson, {}), value: byField.get(definition.id) ?? definition.defaultValue }));
}

export async function saveCustomFieldValues(tx: Prisma.TransactionClient, entityType: string, entityId: number, input: unknown) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return;
  const values = input as Record<string, unknown>, definitions = await tx.customFieldDefinition.findMany({ where: { entityType, isActive: true } });
  for (const definition of definitions) {
    const value = values[definition.fieldKey] ?? definition.defaultValue;
    if (definition.required && (value === null || value === undefined || value === "")) throw new ConfigurationError(`${definition.labelAr} مطلوب`);
    if (value === null || value === undefined || value === "") { await tx.customFieldValue.deleteMany({ where: { fieldId: definition.id, entityType, entityId } }); continue; }
    const options = parseJson<string[]>(definition.optionsJson, []), validation = parseJson<{ min?: number; max?: number; pattern?: string }>(definition.validationJson, {});
    if (definition.fieldType === "NUMBER") { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new ConfigurationError(`${definition.labelAr} يجب أن يكون رقمًا`); if (validation.min !== undefined && parsed < validation.min) throw new ConfigurationError(`${definition.labelAr} أقل من الحد الأدنى`); if (validation.max !== undefined && parsed > validation.max) throw new ConfigurationError(`${definition.labelAr} أكبر من الحد الأعلى`); }
    if (definition.fieldType === "DATE" && Number.isNaN(new Date(String(value)).getTime())) throw new ConfigurationError(`${definition.labelAr} ليس تاريخًا صالحًا`);
    if (definition.fieldType === "SELECT" && !options.includes(String(value))) throw new ConfigurationError(`${definition.labelAr} يحتوي خيارًا غير مسموح`);
    if (definition.fieldType === "MULTISELECT" && (!Array.isArray(value) || value.some((entry) => !options.includes(String(entry))))) throw new ConfigurationError(`${definition.labelAr} يحتوي خيارات غير مسموحة`);
    if (validation.pattern && !(new RegExp(validation.pattern).test(String(value)))) throw new ConfigurationError(`${definition.labelAr} لا يطابق الصيغة المطلوبة`);
    await tx.customFieldValue.upsert({ where: { fieldId_entityType_entityId: { fieldId: definition.id, entityType, entityId } }, create: { fieldId: definition.id, entityType, entityId, valueJson: JSON.stringify(value) }, update: { valueJson: JSON.stringify(value) } });
  }
}

export function evaluateApprovalRules(rules: { conditionJson: string; stepsJson: string; code: string; priority: number }[], document: Record<string, unknown>) {
  const matches = rules.filter((rule) => {
    const condition = parseJson<Record<string, { eq?: unknown; gte?: number; lte?: number }>>(rule.conditionJson, {});
    return Object.entries(condition).every(([field, test]) => (test.eq === undefined || document[field] === test.eq) && (test.gte === undefined || Number(document[field]) >= test.gte) && (test.lte === undefined || Number(document[field]) <= test.lte));
  }).sort((a, b) => a.priority - b.priority);
  return matches.map((rule) => ({ code: rule.code, steps: parseJson(rule.stepsJson, []) }));
}

