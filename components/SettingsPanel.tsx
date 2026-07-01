"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/store/useAppStore";

export default function SettingsPanel() {
  const { settings, updateSettings, resetAllData } = useAppStore();
  const [confirmText, setConfirmText] = useState("");
  const [defaultTargetSalesText, setDefaultTargetSalesText] = useState(settings.defaultTargetSales === 0 ? "" : String(settings.defaultTargetSales));

  useEffect(() => {
    setDefaultTargetSalesText(settings.defaultTargetSales === 0 ? "" : String(settings.defaultTargetSales));
  }, [settings.defaultTargetSales]);

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-2xl font-black">設定</h2>
      <div className="mt-4 space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-lg bg-ink p-4 font-bold">
          ピークモード
          <input
            type="checkbox"
            checked={settings.highTrafficMode}
            onChange={(event) => void updateSettings({ ...settings, highTrafficMode: event.target.checked })}
          />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg bg-ink p-4 font-bold">
          効果音
          <input type="checkbox" checked={settings.soundEnabled} onChange={(event) => void updateSettings({ ...settings, soundEnabled: event.target.checked })} />
        </label>
        <label className="block rounded-lg bg-ink p-4 text-sm font-bold text-slate-600">
          既定の売上目標
          <input
            type="number"
            value={defaultTargetSalesText}
            placeholder="0"
            onChange={(event) => {
              const next = event.target.value.replace(/^0+(?=\d)/, "");
              setDefaultTargetSalesText(next);
              void updateSettings({ ...settings, defaultTargetSales: Number(next || 0) });
            }}
            className="mt-2 w-full rounded-md border border-line bg-panel p-3 text-slate-950"
          />
        </label>

        <div className="rounded-lg border border-danger bg-danger/10 p-4">
          <h3 className="text-lg font-black text-danger">データ初期化</h3>
          <p className="mt-1 text-sm text-slate-600">すべての売上、商品、コスト、営業回を削除し、初期データに戻します。</p>
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="初期化 と入力"
            className="mt-3 w-full rounded-md border border-line bg-ink p-3"
          />
          <button
            disabled={confirmText !== "初期化"}
            onClick={() => {
              if (confirm("本当にすべてのデータを初期化しますか？")) void resetAllData();
            }}
            className="mt-3 w-full rounded-md bg-danger py-3 font-black disabled:bg-slate-700 disabled:text-slate-400"
          >
            すべて初期化
          </button>
        </div>
      </div>
    </section>
  );
}
