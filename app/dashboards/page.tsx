import DashboardWorkspace from "./DashboardWorkspace";
import IndicatorWorkspace from "./IndicatorWorkspace";
import SupplementaryMetrics from "./SupplementaryMetrics";
import MonthlySalesReport from "./MonthlySalesReport";
import MonthlyUnavailableReport from "./MonthlyUnavailableReport";

export const dynamic = "force-dynamic";
export default async function DashboardsPage({searchParams}:{searchParams:Promise<{view?:string}>}) { const query=await searchParams; return query.view==="indicators" ? <div className="indicators-page"><IndicatorWorkspace/><SupplementaryMetrics/><MonthlySalesReport metric="sales"/><MonthlySalesReport metric="purchases"/><MonthlySalesReport metric="expenses"/><MonthlySalesReport metric="netProfit"/><MonthlySalesReport metric="tax"/><MonthlyUnavailableReport title="كشف السيولة البنكية الشهري"/><MonthlyUnavailableReport title="كشف قيمة المخزون الشهري"/><MonthlyUnavailableReport title="كشف ذمم العملاء الشهري"/><MonthlyUnavailableReport title="كشف ذمم الموردين الشهري"/><MonthlyUnavailableReport title="كشف صافي التدفقات النقدية الشهري"/><MonthlyUnavailableReport title="كشف هامش الربح الشهري"/><MonthlyUnavailableReport title="كشف رأس المال العامل الشهري"/></div> : <DashboardWorkspace chartsOnly={false}/>; }
