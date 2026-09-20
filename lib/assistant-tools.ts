export type AssistantTool = {
  name: string;
  intent: "SEARCH" | "READ" | "ANALYZE" | "NAVIGATE" | "EXPORT" | "CREATE_DRAFT" | "POST" | "APPROVE" | "DELETE" | "REVERSE";
  module: string;
  description: string;
  approvalRequired: boolean;
  permission: string;
  readOnly: boolean;
};

/**
 * Capability registry consumed by NETAJ ONE's deterministic router and by an
 * optional external planner. Read tools never become write proposals.
 */
export const assistantToolRegistry: AssistantTool[] = [
  ...[
    ["global_search", "SEARCH", "CORE", "Search parties, items, documents, projects, vehicles, drivers and trips"], ["resolve_entity", "READ", "CORE", "Resolve a party, item, document or vehicle with confidence"], ["search_documents", "SEARCH", "CORE", "Search scoped ERP documents"],
    ["get_latest_journal_entry", "READ", "ACCOUNTING", "Read the latest posted journal entry"], ["get_journal_entry", "READ", "ACCOUNTING", "Read one posted journal entry"], ["get_general_ledger", "READ", "ACCOUNTING", "Read posted general ledger movements"], ["get_trial_balance", "READ", "ACCOUNTING", "Read trial balance"], ["get_customer_balance", "READ", "ACCOUNTING", "Read posted customer balance"], ["get_supplier_balance", "READ", "ACCOUNTING", "Read posted supplier balance"], ["get_customer_statement", "READ", "ACCOUNTING", "Read posted customer statement"], ["get_supplier_statement", "READ", "ACCOUNTING", "Read posted supplier statement"], ["get_receipts", "READ", "ACCOUNTING", "Read posted receipts"], ["get_payments", "READ", "ACCOUNTING", "Read posted payments"], ["get_bank_summary", "READ", "ACCOUNTING", "Read bank balances"], ["get_cash_summary", "READ", "ACCOUNTING", "Read cash balances"], ["get_receivables", "READ", "ACCOUNTING", "Read receivables"], ["get_payables", "READ", "ACCOUNTING", "Read payables"],
    ["get_latest_sales_invoice", "READ", "SALES", "Read latest posted sales invoice"], ["get_sales_invoice", "READ", "SALES", "Read one posted sales invoice"], ["search_sales_invoices", "SEARCH", "SALES", "Search posted sales invoices"], ["get_sales_summary", "ANALYZE", "SALES", "Analyze posted sales"], ["get_customer_sales", "ANALYZE", "SALES", "Analyze posted customer sales"],
    ["get_latest_purchase_invoice", "READ", "PURCHASES", "Read latest posted purchase invoice"], ["get_purchase_invoice", "READ", "PURCHASES", "Read one posted purchase invoice"], ["search_purchase_invoices", "SEARCH", "PURCHASES", "Search posted purchase invoices"], ["get_purchase_summary", "ANALYZE", "PURCHASES", "Analyze posted purchases"],
    ["get_customer_inventory", "READ", "INVENTORY", "Read customer-owned inventory"], ["get_inventory_balance", "READ", "INVENTORY", "Read inventory balance"], ["get_inventory_movements", "READ", "INVENTORY", "Read inventory movements"], ["get_material_summary", "ANALYZE", "INVENTORY", "Analyze material activity"],
    ["get_latest_trip", "READ", "TRANSPORT", "Read latest posted trip"], ["get_vehicle_summary", "READ", "TRANSPORT", "Read vehicle summary"], ["get_vehicle_costs", "ANALYZE", "TRANSPORT", "Analyze vehicle costs"], ["get_driver_summary", "ANALYZE", "TRANSPORT", "Analyze driver activity"], ["get_expiring_vehicle_documents", "READ", "TRANSPORT", "Read expiring vehicle documents"],
    ["get_factory_summary", "ANALYZE", "FACTORY", "Analyze factory summary"], ["get_production", "READ", "FACTORY", "Read production records"], ["get_factory_profitability", "ANALYZE", "FACTORY", "Analyze factory profitability"],
    ["export_pdf", "EXPORT", "CORE", "Export a scoped report as PDF"], ["export_excel", "EXPORT", "CORE", "Export a scoped report as Excel"], ["print_report", "EXPORT", "CORE", "Prepare a scoped printable report"],
    ["create_sales_invoice_draft", "CREATE_DRAFT", "SALES", "Prepare a sales invoice draft"], ["create_purchase_invoice_draft", "CREATE_DRAFT", "PURCHASES", "Prepare a purchase invoice draft"], ["create_quotation_draft", "CREATE_DRAFT", "SALES", "Prepare a quotation draft"], ["create_proforma_draft", "CREATE_DRAFT", "SALES", "Prepare a proforma draft"], ["create_receipt_voucher_draft", "CREATE_DRAFT", "ACCOUNTING", "Prepare a receipt voucher draft"], ["create_payment_voucher_draft", "CREATE_DRAFT", "ACCOUNTING", "Prepare a payment voucher draft"], ["create_journal_entry_draft", "CREATE_DRAFT", "ACCOUNTING", "Prepare a journal entry draft"], ["create_delivery_note_draft", "CREATE_DRAFT", "SALES", "Prepare a delivery note draft"], ["create_trip_draft", "CREATE_DRAFT", "TRANSPORT", "Prepare a transport trip draft"],
  ].map(([name, intent, module, description]) => ({ name, intent, module, description, approvalRequired: intent === "CREATE_DRAFT", permission: `${module}.READ`, readOnly: intent !== "CREATE_DRAFT" })) as AssistantTool[],
];

export function toolsForPrompt() {
  return assistantToolRegistry.map(({ name, intent, module, description, approvalRequired, permission, readOnly }) => ({ name, intent, module, description, approvalRequired, permission, readOnly }));
}
