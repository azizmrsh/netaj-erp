"use client";

import { useEffect } from "react";

type Theme = { mode: string; primaryColor: string; secondaryColor: string; accentColor: string; backgroundColor?: string; sidebarColor?: string; fontArabic: string; fontEnglish: string; sidebarStyle: string; cardStyle: string; tableStyle: string; chartStyle?: string };

export default function ThemeRuntime() {
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/design/runtime", { cache: "no-store", signal: controller.signal }).then((response) => response.ok ? response.json() : null).then((payload) => {
      if (!payload?.theme) return;
      const theme = payload.theme as Theme, root = document.documentElement, language = payload.company?.defaultLanguageCode === "en" ? "en" : "ar";
      root.lang = language; root.dir = language === "ar" ? "rtl" : "ltr";
      const dark = theme.mode === "DARK" || (theme.mode === "SYSTEM" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      const override = window.localStorage.getItem("netaj-color-mode");
      root.dataset.theme = override === "dark" || override === "light" ? override : dark ? "dark" : "light"; root.dataset.sidebar = theme.sidebarStyle.toLowerCase(); root.dataset.cards = theme.cardStyle.toLowerCase(); root.dataset.tables = theme.tableStyle.toLowerCase(); root.dataset.charts = (theme.chartStyle ?? "DIMENSIONAL").toLowerCase();
      root.style.setProperty("--brand-primary", theme.primaryColor); root.style.setProperty("--brand-secondary", theme.secondaryColor); root.style.setProperty("--brand-accent", theme.accentColor);
      root.style.setProperty("--background", theme.backgroundColor ?? "#f8f5ee"); root.style.setProperty("--sidebar", theme.sidebarColor ?? "#fffdf8");
      root.style.setProperty("--company-font", language === "ar" ? theme.fontArabic : theme.fontEnglish);
    }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return null;
}
