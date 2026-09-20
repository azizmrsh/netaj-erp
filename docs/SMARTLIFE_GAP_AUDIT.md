# SMARTLIFE / SMARTERP functional gap matrix

Audit date: 2026-09-20. This matrix treats the supplied legacy screens as functional
references only. A row is COMPLETE only when the current database, domain service,
API, permissions, UI and tests are connected.

| Legacy capability | NETAJ equivalent | Status | Gap / implementation decision |
|---|---|---|---|
| Statistical reports and VAT reports | `lib/reports.ts`, finance reports and exports | COMPLETE | Approved datasets, tenant scope, filters, PDF/XLSX and tests already exist. |
| Report designer | `CustomReportDefinition`, `lib/custom-reports.ts`, Report Builder | COMPLETE | No raw SQL; approved source catalog, fields, filters, grouping, calculations, export and audit are used. |
| Graphical overview / profit / sales / purchases | Dashboard and Phase E analytics | COMPLETE | Real transactional sources; no legacy duplicate screens. |
| Inventory receipt / issue / transfer / adjustment / count | Inventory service, notes and controls | COMPLETE | Ownership rules and posted movement invariants are tested. |
| Inventory replenishment orders | `/api/inventory/replenishment` and Inventory → إعادة التوريد | PARTIAL | Company-owned minimum-stock signals and suggested quantities are now real and scoped; creating an approved supply order remains future work. |
| Users and profile configuration | Auth, users, sessions, MFA, company context | PARTIAL | Core status, locale, MFA, sessions and audit exist; optional gender/default warehouse preferences need UX completion. |
| Groups and granular permissions | RBAC, module entitlements, approvals | COMPLETE | Backend permission checks and tenant isolation are tested; UI is generated from scope. |
| Cashier / salesperson commissions | `BusinessDocument.salesperson` only | MISSING | Requires a separate commission domain (never mixed with driver wages). |
| Receipt / payment / transfer / journal vouchers | Finance vouchers, transfers and journals | COMPLETE | Draft, approval, posting, reversal, balanced journals, print/export and audit are implemented. |
| Sales/purchase returns | Credit/debit notes and workflow reversal | COMPLETE | Subledgers, VAT, inventory and source linkage are tested. |
| Bank/cash transfers | Finance transfers | COMPLETE | All four directions, FX, reconciliation and no-P&L invariant are implemented. |
| Customer/company stock separation | CompanyStock, PartyStockAccount, StockMovement | COMPLETE | Negative customer stock is allowed; company shortage is rejected. |
| Custom invoice fields | Custom fields framework | COMPLETE | Types, visibility, printable/reportable flags, roles and references are supported. |
| Document templates / HTML menu duplicates | Document & Print Designer / immutable snapshots | COMPLETE | One versioned designer replaces duplicate legacy menu items. |
| Email/WhatsApp/SMS notifications | Notification center and integration adapters | PARTIAL | Code and delivery state exist; external provider activation remains pending. |
| Discount coupons | Sales workflow pricing | MISSING | Optional capability; must be added without changing NETAJ core pricing until rules are approved. |
| Services / AI credits / extra seats | SaaS plans, entitlements and usage limits | COMPLETE | Entitlements remain separate from RBAC; limits are tested. |
| Central settings | Configuration, design, organization, security, integrations | COMPLETE | Settings are split by workspace rather than one legacy page. |
| Global search / quick actions | Global search, command/navigation and quick create | COMPLETE | Permission-aware and tenant-scoped. |
| AI reports / smart reports | NETAJ ONE | PARTIAL | Safe tool registry and approval path exist. Live LLM provider and tool-calling activation are external requirements. |
| Voice workflow | NETAJ ONE speech + preview/approve | PARTIAL | Preview/approval is implemented; live LLM provider is required for general language understanding. |
| Factory/customer raw workflows | Factory, inventory ownership and profitability | COMPLETE | No BOM/waste forced into the NETAJ-specific path. |
| Transport and driver wages | Transport / HR payroll | COMPLETE | Driver wages remain separate from salesperson commission. |
| Projects / contracting | Projects, BOQ, certificates and job costing | COMPLETE | Actual/committed/forecast and accounting links are tested. |
| Migration/import profiles | Generic Migration Center | COMPLETE | XLSX/XLS/CSV preview, dry-run, reconciliation, metadata and safe rollback exist. |
| Legacy blue/desktop visual design | Premium NETAJ UX | REPLACED BY BETTER NETAJ DESIGN | Keep cream/white surfaces, dark sidebar, gold accents, RTL/LTR and responsive layouts. |

## Priority work

1. P0: keep accounting, RBAC, tenant isolation and dashboard runtime green.
2. P1: implement salesperson/commission domain and optional replenishment workflow.
3. P2: finish user preference/default warehouse UX and notification provider activation.
4. P3: optional coupons/add-ons only after business rules are approved.

No schema or production-data changes were made by this audit. Missing rows must not be
marked complete by adding a menu item or placeholder; each future change requires a
database/service/API/RBAC/UI/test path.
