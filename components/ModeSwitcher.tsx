"use client";

import type { AppMode } from "@/types";
import { useAppStore } from "@/store/useAppStore";

const modes: { id: AppMode; label: string }[] = [
  { id: "today", label: "本日の営業" },
  { id: "menu", label: "メニュー・在庫" },
  { id: "cost", label: "コスト管理" },
  { id: "review", label: "振り返り" },
  { id: "data", label: "データ管理" },
  { id: "settings", label: "設定" }
];

export default function ModeSwitcher() {
  const { mode, setMode } = useAppStore();

  return (
    <nav className="flex max-w-full gap-2 overflow-x-auto rounded-lg border border-line bg-panel p-1 shadow-soft">
      {modes.map((item) => (
        <button
          key={item.id}
          onClick={() => setMode(item.id)}
          className={`min-h-12 whitespace-nowrap rounded-md px-4 text-sm font-bold transition md:text-base ${
            mode === item.id ? "bg-mint text-slate-950" : "text-slate-700 hover:bg-slate-100"
          }`}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
