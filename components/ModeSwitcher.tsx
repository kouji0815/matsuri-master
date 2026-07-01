"use client";

import type { AppMode } from "@/types";
import { useAppStore } from "@/store/useAppStore";

const modes: { id: AppMode; label: string }[] = [
  { id: "today", label: "当天经营" },
  { id: "menu", label: "菜单・库存" },
  { id: "cost", label: "成本管理" },
  { id: "review", label: "复盘" },
  { id: "data", label: "数据管理" },
  { id: "settings", label: "设置" }
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
