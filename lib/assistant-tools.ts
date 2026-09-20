export type AssistantTool = {
  name: string;
  intent: "SEARCH" | "READ" | "ANALYZE" | "NAVIGATE" | "EXPORT" | "CREATE_DRAFT" | "POST" | "APPROVE" | "DELETE" | "REVERSE";
  module: string;
  description: string;
  approvalRequired: boolean;
};

/**
 * Capability registry consumed by NETAJ ONE's deterministic router and by an
 * optional external planner. Read tools never become write proposals.
 */
export const assistantToolRegistry: AssistantTool[] = [
  { name: "global_search", intent: "SEARCH", module: "CORE", description: "Search parties, items, documents, projects, vehicles, drivers and trips", approvalRequired: false },
  { name: "party_overview", intent: "READ", module: "CORE", description: "Read a party's cross-module activity and current balances", approvalRequired: false },
  { name: "sales_summary", intent: "ANALYZE", module: "SALES", description: "Analyze posted sales by date and party", approvalRequired: false },
  { name: "purchase_summary", intent: "ANALYZE", module: "PURCHASES", description: "Analyze posted purchases by date and supplier", approvalRequired: false },
  { name: "party_statement", intent: "READ", module: "ACCOUNTING", description: "Read the authoritative posted party ledger", approvalRequired: false },
  { name: "party_inventory", intent: "READ", module: "INVENTORY", description: "Read customer-owned balances and movements", approvalRequired: false },
  { name: "transport_activity", intent: "READ", module: "TRANSPORT", description: "Read trips, vehicles, drivers and expiring documents", approvalRequired: false },
  { name: "report_export", intent: "EXPORT", module: "CORE", description: "Generate a scoped PDF or Excel report", approvalRequired: false },
  { name: "create_draft", intent: "CREATE_DRAFT", module: "CORE", description: "Prepare a validated draft without posting", approvalRequired: true },
  { name: "post_document", intent: "POST", module: "CORE", description: "Post a draft document and its accounting effects", approvalRequired: true },
  { name: "approve_document", intent: "APPROVE", module: "CORE", description: "Approve a pending workflow", approvalRequired: true },
  { name: "reverse_document", intent: "REVERSE", module: "CORE", description: "Reverse a posted document with audit trail", approvalRequired: true },
];

export function toolsForPrompt() {
  return assistantToolRegistry.map(({ name, intent, module, description, approvalRequired }) => ({ name, intent, module, description, approvalRequired }));
}
