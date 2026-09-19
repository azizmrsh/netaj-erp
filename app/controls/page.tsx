import Link from "next/link";
import ControlsClient from "./ControlsClient";
export default function ControlsPage(){return <main dir="rtl" className="min-h-screen bg-slate-100 p-5 md:p-8"><div className="mx-auto max-w-6xl"><Link href="/" className="text-blue-700">الرئيسية</Link><h1 className="mt-2 text-3xl font-black">الرقابة والتنبيهات</h1><p className="mb-6 text-slate-600">تنبيهات محايدة للمراجعة، ولا تمثل اتهامًا أو حكمًا.</p><ControlsClient/></div></main>}
