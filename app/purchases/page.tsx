import PurchasesWorkspace from "./PurchasesWorkspace";
export default async function PurchasesPage({searchParams}:{searchParams:Promise<{type?:string;new?:string}>}){const query=await searchParams;return <PurchasesWorkspace initialType={query.type??"PURCHASE_INVOICE"} initialNew={query.new==="1"}/>}
