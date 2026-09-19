import Link from "next/link";
import AssistantClient from "./AssistantClient";

export default function AssistantPage() { return <main dir="rtl" className="min-h-screen bg-slate-100 p-5 md:p-8"><div className="mx-auto max-w-5xl"><Link href="/" className="text-blue-700">الرئيسية</Link><h1 className="mt-2 text-3xl font-black">مساعد NETAj ERP</h1><p className="mb-6 text-slate-600">استعلامات آمنة من بيانات شركتك فقط، مع الجداول والمقارنات والانتقال للمصدر.</p><AssistantClient /></div></main>; }
