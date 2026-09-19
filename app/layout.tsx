import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ThemeRuntime from "./components/ThemeRuntime";
import ServiceWorkerRegistration from "./components/ServiceWorkerRegistration";
import AppShell from "./components/AppShell";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NETAJ ERP",
  description: "نظام إدارة الأعمال لشركة نتاج المتطورة التجارية",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full"><ThemeRuntime /><ServiceWorkerRegistration /><AppShell>{children}</AppShell></body>
    </html>
  );
}
