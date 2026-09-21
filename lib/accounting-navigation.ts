// Shared by the sidebar and the workspace: one destination per accounting screen.
export const accountingPages = [
  ["شجرة الحسابات", "chart"], ["الحسابات", "accounts"], ["القيود اليومية", "journals"], ["القيود الدورية", "recurring"],
  ["سندات الصرف", "payment"], ["كل السندات", "allVouchers"], ["سندات القبض", "receipt"], ["سندات التحويل", "transfer"],
  ["أرصدة الأصناف", "inventoryBalances"], ["ميزان المراجعة", "reports", "trial-balance"], ["قائمة الدخل", "reports", "profit-and-loss"], ["المركز المالي", "reports", "balance-sheet"],
  ["الميزانيات", "budgets"], ["قائمة التدفقات النقدية", "reports", "cash-flow"], ["توزيع الأرباح والخسائر", "distributions"], ["إهلاكات الأصول", "depreciation"],
  ["مراكز التكلفة", "costCenters"], ["مركز التكلفة التفصيلي", "costCenterDetail"], ["جاري الشركاء", "partners"], ["إدارة دفاتر الشيكات", "chequebooks"],
  ["الشيكات المدفوعة", "paidCheques"], ["الشيكات المستلمة", "receivedCheques"], ["طرق الدفع", "paymentMethods"], ["العملات", "currencies"],
].map(([label, tab, report]) => ({ label, tab, report, href: `/accounting?tab=${tab}${report ? `&report=${report}` : ""}` }));
