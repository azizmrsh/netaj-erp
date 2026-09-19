import Link from "next/link";
import SecurityClient from "./SecurityClient";
export default function SecurityPage(){return <main dir="rtl" className="min-h-screen bg-slate-100 p-5 md:p-8"><div className="mx-auto max-w-3xl"><Link href="/" className="text-blue-700">الرئيسية</Link><h1 className="mt-2 text-3xl font-black">أمان الحساب</h1><p className="mb-6 text-slate-600">إدارة المصادقة المتعددة وأجهزة الجلسات.</p><SecurityClient/></div></main>}
