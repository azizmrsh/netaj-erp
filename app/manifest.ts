import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "NETAJ ERP",
    short_name: "NETAJ",
    description: "نظام نتاج المتكامل لإدارة الأعمال والعمليات الميدانية",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f5ee",
    theme_color: "#b78a3d",
    lang: "ar",
    dir: "rtl",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
