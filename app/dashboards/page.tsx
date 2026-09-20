import DashboardWorkspace from "./DashboardWorkspace";

export const dynamic = "force-dynamic";
export default async function DashboardsPage({searchParams}:{searchParams:Promise<{view?:string}>}) { const query=await searchParams; return <DashboardWorkspace chartsOnly={query.view==="indicators"}/>; }
