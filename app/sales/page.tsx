import SalesWorkspace from "./SalesWorkspace";
export default async function SalesPage({searchParams}:{searchParams:Promise<{type?:string;new?:string}>}){const query=await searchParams;return <SalesWorkspace initialType={query.type} initialNew={query.new==="1"}/>}
