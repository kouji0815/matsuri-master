"use client";

import { useEffect } from "react";
import Dashboard from "@/components/Dashboard";
import ModeSwitcher from "@/components/ModeSwitcher";
import ProductManager from "@/components/ProductManager";
import CostManager from "@/components/CostManager";
import SessionManager from "@/components/SessionManager";
import ReviewDashboard from "@/components/ReviewDashboard";
import DataManager from "@/components/DataManager";
import SettingsPanel from "@/components/SettingsPanel";
import { useAppStore } from "@/store/useAppStore";

export default function Home() {
  const { mode, hydrate } = useAppStore();

  useEffect(() => {
    hydrate();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, [hydrate]);

  return (
    <main className="min-h-screen bg-ink text-slate-950">
      <div className="mx-auto flex min-h-screen max-w-[1366px] flex-col gap-4 px-4 py-4 md:px-6">
        <header className="no-print flex items-center justify-between gap-3">
          <ModeSwitcher />
          <div className="text-right">
            <h1 className="text-xl font-black tracking-normal md:text-3xl">Matsuri Master</h1>
            <p className="text-xs text-slate-600 md:text-sm">祭典・屋台営業管理</p>
          </div>
        </header>

        {mode === "today" && <Dashboard />}
        {mode === "menu" && <ProductManager />}
        {mode === "cost" && <CostManager />}
        {mode === "review" && <ReviewDashboard />}
        {mode === "data" && <DataManager />}
        {mode === "settings" && (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <SessionManager />
            <SettingsPanel />
          </div>
        )}
      </div>
    </main>
  );
}
