import DashboardWorkspace from "./DashboardWorkspace";
import IndicatorWorkspace from "./IndicatorWorkspace";
import SupplementaryMetrics from "./SupplementaryMetrics";

export const dynamic = "force-dynamic";
export default async function DashboardsPage({searchParams}:{searchParams:Promise<{view?:string}>}) { const query=await searchParams; return query.view==="indicators" ? <div className="indicators-page"><SupplementaryMetrics/><IndicatorWorkspace/></div> : <DashboardWorkspace chartsOnly={false}/>; }
