import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { audit } from "@/lib/audit";

export const documentTypes = ["INVOICE", "QUOTATION", "PROFORMA_INVOICE", "SALES_ORDER", "PURCHASE_ORDER", "RECEIPT_NOTE", "DELIVERY_NOTE", "RECEIPT_VOUCHER", "PAYMENT_VOUCHER", "PROGRESS_CERTIFICATE", "ACCOUNT_STATEMENT", "FINANCIAL_REPORT", "PAYROLL"] as const;
export const widgetTypes = ["KPI", "CHART", "TABLE", "ALERT", "LIST", "COMPARISON"] as const;
export const dashboardDataSources = ["kpis.sales", "kpis.purchases", "kpis.netProfit", "kpis.liquidity", "kpis.inventory", "kpis.ar", "kpis.ap", "kpis.cashFlow", "monthly", "materials", "customerActivity", "alerts", "factory", "transport"] as const;

export class DesignError extends Error {
  constructor(message: string, public readonly status = 400, public readonly code = "DESIGN_VALIDATION") { super(message); }
}

const text = (value: unknown) => String(value ?? "").trim();
const parseJson = <T>(value: string, fallback: T) => { try { return JSON.parse(value) as T; } catch { return fallback; } };
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const positive = (value: unknown, fallback: number, max = 12) => { const parsed = Number(value); return Number.isInteger(parsed) && parsed > 0 && parsed <= max ? parsed : fallback; };

export type DocumentDesign = {
  page: { size: string; orientation: string; widthMm?: number; heightMm?: number; marginMm: number };
  language: string;
  colors: { primary: string; accent: string };
  fonts: { ar: string; en: string };
  header: { showLogo: boolean; showCompany: boolean; fields: string[]; customText?: string };
  body: { fieldOrder: string[]; hiddenFields: string[]; showCustomFields: boolean };
  footer: { showTerms: boolean; showBank: boolean; showIban: boolean; showPageNumber: boolean; customText?: string };
  features: { signatures: boolean; stamp: boolean; qr: boolean; barcode: boolean };
  terms: string;
};

export function normalizeDesign(input: unknown): DocumentDesign {
  const root = object(input), page = object(root.page), colors = object(root.colors), fonts = object(root.fonts), header = object(root.header), body = object(root.body), footer = object(root.footer), features = object(root.features);
  const size = ["A4", "LETTER", "CUSTOM"].includes(text(page.size).toUpperCase()) ? text(page.size).toUpperCase() : "A4";
  const hex = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback;
  const strings = (value: unknown, fallback: string[]) => Array.isArray(value) ? value.map(text).filter(Boolean).slice(0, 50) : fallback;
  const bool = (value: unknown, fallback: boolean) => typeof value === "boolean" ? value : fallback;
  return {
    page: { size, orientation: text(page.orientation).toLowerCase() === "landscape" ? "landscape" : "portrait", widthMm: size === "CUSTOM" ? Number(page.widthMm) || 210 : undefined, heightMm: size === "CUSTOM" ? Number(page.heightMm) || 297 : undefined, marginMm: Math.min(30, Math.max(5, Number(page.marginMm) || 12)) },
    language: ["AR", "EN", "BILINGUAL"].includes(text(root.language).toUpperCase()) ? text(root.language).toUpperCase() : "BILINGUAL",
    colors: { primary: hex(colors.primary, "#0f172a"), accent: hex(colors.accent, "#1d4ed8") },
    fonts: { ar: text(fonts.ar) || "Arial", en: text(fonts.en) || "Arial" },
    header: { showLogo: bool(header.showLogo, true), showCompany: bool(header.showCompany, true), fields: strings(header.fields, ["companyName", "vatNumber", "address"]), customText: text(header.customText) || undefined },
    body: { fieldOrder: strings(body.fieldOrder, ["documentNumber", "date", "party", "reference", "items", "totals", "notes"]), hiddenFields: strings(body.hiddenFields, []), showCustomFields: bool(body.showCustomFields, true) },
    footer: { showTerms: bool(footer.showTerms, true), showBank: bool(footer.showBank, true), showIban: bool(footer.showIban, true), showPageNumber: bool(footer.showPageNumber, true), customText: text(footer.customText) || undefined },
    features: { signatures: bool(features.signatures, true), stamp: bool(features.stamp, true), qr: bool(features.qr, true), barcode: bool(features.barcode, true) },
    terms: text(root.terms),
  };
}

export async function listDesignWorkspace(tx: Prisma.TransactionClient) {
  const [templates, theme, dashboards] = await Promise.all([
    tx.documentTemplate.findMany({ where: { isActive: true }, include: { versions: { orderBy: { version: "desc" } } }, orderBy: [{ documentType: "asc" }, { name: "asc" }] }),
    tx.companyThemeProfile.findFirst(),
    tx.dashboardDefinition.findMany({ where: { isActive: true }, include: { widgets: { where: { isActive: true }, orderBy: { position: "asc" } } }, orderBy: { name: "asc" } }),
  ]);
  return { documentTypes, widgetTypes, dashboardDataSources, templates: templates.map((template) => ({ ...template, versions: template.versions.map((version) => ({ ...version, design: parseJson(version.designJson, {}) })) })), theme: theme ? { ...theme, menuOrder: parseJson(theme.menuOrderJson, []), dashboardStyle: parseJson(theme.dashboardStyleJson, {}), loginBranding: parseJson(theme.loginBrandingJson, {}) } : null, dashboards: dashboards.map((dashboard) => ({ ...dashboard, roleCodes: parseJson(dashboard.roleCodesJson, []), widgets: dashboard.widgets.map((widget) => ({ ...widget, config: parseJson(widget.configJson, {}) })) })) };
}

export async function saveTemplateVersion(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId: string) {
  const documentType = text(input.documentType).toUpperCase(), code = text(input.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_");
  if (!documentTypes.includes(documentType as typeof documentTypes[number]) || !code || !text(input.name)) throw new DesignError("بيانات قالب المستند غير صالحة");
  const tenantId = Number(input.tenantId), companyId = Number(input.companyId), language = ["AR", "EN", "BILINGUAL"].includes(text(input.language).toUpperCase()) ? text(input.language).toUpperCase() : "BILINGUAL";
  const design = normalizeDesign(input.design);
  const template = await tx.documentTemplate.upsert({ where: { tenantId_companyId_code: { tenantId, companyId, code } }, create: { tenantId, companyId, code, name: text(input.name), documentType, language, isDefault: Boolean(input.isDefault) }, update: { name: text(input.name), language, isActive: true } });
  if (input.isDefault) { await tx.documentTemplate.updateMany({ where: { documentType, id: { not: template.id } }, data: { isDefault: false } }); await tx.documentTemplate.update({ where: { id: template.id }, data: { isDefault: true } }); }
  const latest = await tx.documentTemplateVersion.findFirst({ where: { templateId: template.id }, orderBy: { version: "desc" } });
  const version = await tx.documentTemplateVersion.create({ data: { templateId: template.id, version: (latest?.version ?? 0) + 1, status: "DRAFT", designJson: JSON.stringify(design), changeNotes: text(input.changeNotes) || null, createdBy: userId } });
  await audit(tx, { action: "DOCUMENT_TEMPLATE_VERSION_CREATE", entityType: "DOCUMENT_TEMPLATE", entityId: template.id, userId, metadata: { code, version: version.version, documentType } });
  return { template, version: { ...version, design } };
}

export async function publishTemplateVersion(tx: Prisma.TransactionClient, versionId: number, companyId: number, userId: string) {
  const version = await tx.documentTemplateVersion.findFirst({ where: { id: versionId, template: { companyId } }, include: { template: true } });
  if (!version) throw new DesignError("إصدار القالب غير موجود", 404, "NOT_FOUND");
  if (version.status === "PUBLISHED") return version;
  const published = await tx.documentTemplateVersion.update({ where: { id: version.id }, data: { status: "PUBLISHED", publishedAt: new Date() } });
  await audit(tx, { action: "DOCUMENT_TEMPLATE_PUBLISH", entityType: "DOCUMENT_TEMPLATE_VERSION", entityId: version.id, userId, metadata: { templateId: version.templateId, version: version.version } });
  return published;
}

export async function issueDocumentPresentation(tx: Prisma.TransactionClient, input: { entityType: string; entityId: number; documentType: string; documentNumber?: string | null; data: unknown }, userId?: string | null) {
  const existing = await tx.issuedDocumentPresentation.findFirst({ where: { entityType: input.entityType, entityId: input.entityId }, include: { templateVersion: { include: { template: true } } } });
  if (existing) return existing;
  const template = await tx.documentTemplate.findFirst({ where: { documentType: input.documentType, isActive: true }, include: { versions: { where: { status: "PUBLISHED" }, orderBy: { version: "desc" }, take: 1 } }, orderBy: [{ isDefault: "desc" }, { id: "asc" }] });
  const version = template?.versions[0];
  if (!template || !version) throw new DesignError("لا يوجد إصدار منشور لهذا المستند", 409, "NO_PUBLISHED_TEMPLATE");
  const dataSnapshotJson = JSON.stringify(input.data), checksum = createHash("sha256").update(dataSnapshotJson).digest("hex");
  const issued = await tx.issuedDocumentPresentation.create({ data: { entityType: input.entityType, entityId: input.entityId, documentNumber: input.documentNumber ?? null, templateVersionId: version.id, dataSnapshotJson, checksum, createdBy: userId ?? null } });
  await audit(tx, { action: "DOCUMENT_PRESENTATION_ISSUE", entityType: input.entityType, entityId: input.entityId, userId, metadata: { templateId: template.id, versionId: version.id, checksum } });
  return { ...issued, templateVersion: { ...version, template } };
}

export async function saveTheme(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId: string) {
  const presets = ["CORPORATE", "MODERN", "MINIMAL"], modes = ["LIGHT", "DARK", "SYSTEM"], styles = ["SOLID", "SOFT", "COMPACT"], cards = ["ROUNDED", "SQUARE", "ELEVATED"], tables = ["STRIPED", "BORDERED", "MINIMAL"];
  const color = (value: unknown, fallback: string) => /^#[0-9a-f]{6}$/i.test(text(value)) ? text(value) : fallback;
  const safeUrl = (value: unknown) => { const url = text(value); return !url || url.startsWith("/") || /^https:\/\//i.test(url) ? url || null : null; };
  const companyId = Number(input.companyId), tenantId = Number(input.tenantId);
  const data = { themePreset: presets.includes(text(input.themePreset).toUpperCase()) ? text(input.themePreset).toUpperCase() : "CORPORATE", mode: modes.includes(text(input.mode).toUpperCase()) ? text(input.mode).toUpperCase() : "LIGHT", logoUrl: safeUrl(input.logoUrl), loginLogoUrl: safeUrl(input.loginLogoUrl), primaryColor: color(input.primaryColor, "#1d4ed8"), secondaryColor: color(input.secondaryColor, "#0f172a"), accentColor: color(input.accentColor, "#059669"), fontArabic: text(input.fontArabic) || "Arial", fontEnglish: text(input.fontEnglish) || "Arial", sidebarStyle: styles.includes(text(input.sidebarStyle).toUpperCase()) ? text(input.sidebarStyle).toUpperCase() : "SOLID", cardStyle: cards.includes(text(input.cardStyle).toUpperCase()) ? text(input.cardStyle).toUpperCase() : "ROUNDED", tableStyle: tables.includes(text(input.tableStyle).toUpperCase()) ? text(input.tableStyle).toUpperCase() : "STRIPED", menuOrderJson: JSON.stringify(Array.isArray(input.menuOrder) ? input.menuOrder.map(text).filter(Boolean) : []), dashboardStyleJson: JSON.stringify(object(input.dashboardStyle)), loginBrandingJson: JSON.stringify(object(input.loginBranding)), updatedBy: userId };
  const profile = await tx.companyThemeProfile.upsert({ where: { companyId }, create: { tenantId, companyId, ...data }, update: data });
  await audit(tx, { action: "COMPANY_THEME_UPDATE", entityType: "COMPANY_THEME", entityId: profile.id, userId, metadata: { preset: profile.themePreset, mode: profile.mode } });
  return profile;
}

export async function saveDashboard(tx: Prisma.TransactionClient, input: Record<string, unknown>, userId: string) {
  const code = text(input.code).toUpperCase().replace(/[^A-Z0-9_-]/g, "_"), name = text(input.name), widgets = Array.isArray(input.widgets) ? input.widgets.map(object) : [];
  if (!code || !name) throw new DesignError("اسم وكود لوحة المعلومات مطلوبان");
  if (widgets.length > 40) throw new DesignError("الحد الأقصى 40 عنصرًا في اللوحة");
  const tenantId = Number(input.tenantId), companyId = Number(input.companyId), roles = Array.isArray(input.roleCodes) ? input.roleCodes.map(text).filter(Boolean) : [];
  for (const widget of widgets) if (!widgetTypes.includes(text(widget.widgetType).toUpperCase() as typeof widgetTypes[number]) || !dashboardDataSources.includes(text(widget.dataSource) as typeof dashboardDataSources[number])) throw new DesignError("نوع أو مصدر أحد عناصر اللوحة غير مدعوم");
  const dashboard = await tx.dashboardDefinition.upsert({ where: { tenantId_companyId_code: { tenantId, companyId, code } }, create: { tenantId, companyId, code, name, roleCodesJson: JSON.stringify(roles), isDefault: Boolean(input.isDefault), createdBy: userId }, update: { name, roleCodesJson: JSON.stringify(roles), isDefault: Boolean(input.isDefault), isActive: true } });
  if (input.isDefault) await tx.dashboardDefinition.updateMany({ where: { id: { not: dashboard.id } }, data: { isDefault: false } });
  await tx.dashboardWidget.deleteMany({ where: { dashboardId: dashboard.id } });
  for (let index = 0; index < widgets.length; index += 1) { const widget = widgets[index]; await tx.dashboardWidget.create({ data: { tenantId, companyId, dashboardId: dashboard.id, widgetType: text(widget.widgetType).toUpperCase(), title: text(widget.title) || `Widget ${index + 1}`, dataSource: text(widget.dataSource), configJson: JSON.stringify(object(widget.config)), position: index + 1, width: positive(widget.width, 1, 3), height: positive(widget.height, 1, 4) } }); }
  await audit(tx, { action: "DASHBOARD_SAVE", entityType: "DASHBOARD", entityId: dashboard.id, userId, metadata: { code, widgets: widgets.length, roles } });
  return tx.dashboardDefinition.findFirstOrThrow({ where: { id: dashboard.id }, include: { widgets: { orderBy: { position: "asc" } } } });
}
