"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { getSupabasePublicEnvStatus } from "@/lib/supabaseClient";
import { useAppStore } from "@/store/useAppStore";

export default function SettingsPanel() {
  const { settings, syncOverview, updateSettings, resetAllData } = useAppStore();
  const [confirmText, setConfirmText] = useState("");
  const [defaultTargetSalesText, setDefaultTargetSalesText] = useState(settings.defaultTargetSales === 0 ? "" : String(settings.defaultTargetSales));
  const [workspaceIdText, setWorkspaceIdText] = useState(settings.workspaceId);
  const [meatUnitPriceBaseGramsText, setMeatUnitPriceBaseGramsText] = useState(String(settings.meatUnitPriceBaseGrams ?? 20));

  useEffect(() => {
    setDefaultTargetSalesText(settings.defaultTargetSales === 0 ? "" : String(settings.defaultTargetSales));
    setWorkspaceIdText(settings.workspaceId);
    setMeatUnitPriceBaseGramsText(String(settings.meatUnitPriceBaseGrams ?? 20));
  }, [settings.defaultTargetSales, settings.workspaceId, settings.meatUnitPriceBaseGrams]);

  const supabaseEnvStatus = useMemo(() => getSupabasePublicEnvStatus(), []);
  const [pairingQrDataUrl, setPairingQrDataUrl] = useState("");

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(settings.workspaceId, { margin: 1, width: 240 })
      .then((dataUrl) => {
        if (!cancelled) setPairingQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setPairingQrDataUrl("");
      });
    return () => {
      cancelled = true;
    };
  }, [settings.workspaceId]);

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-2xl font-black text-slate-950">設定</h2>
      <div className="mt-4 space-y-4">
        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 font-bold text-gray-900 shadow-sm">
          ピークモード
          <input
            type="checkbox"
            checked={settings.highTrafficMode}
            onChange={(event) => void updateSettings({ ...settings, highTrafficMode: event.target.checked })}
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4 font-bold text-gray-900 shadow-sm">
          効果音
          <input type="checkbox" checked={settings.soundEnabled} onChange={(event) => void updateSettings({ ...settings, soundEnabled: event.target.checked })} />
        </label>

        <label className="block rounded-lg border border-gray-200 bg-white p-4 text-sm font-bold text-gray-900 shadow-sm">
          既定の売上目標
          <input
            type="number"
            value={defaultTargetSalesText}
            placeholder="金額"
            onChange={(event) => {
              const next = event.target.value.replace(/^0+(?=\d)/, "");
              setDefaultTargetSalesText(next);
              void updateSettings({ ...settings, defaultTargetSales: Number(next || 0) });
            }}
            className="mt-2 w-full rounded-md border border-line bg-white p-3 text-slate-950"
          />
        </label>

        <label className="block rounded-lg border border-gray-200 bg-white p-4 text-sm font-bold text-gray-900 shadow-sm">
          肉の単価表示基準（g）
          <p className="mt-1 text-xs font-normal text-gray-500">コスト管理ページで「肉」分類の記録に、この重量あたりの単価を表示します（例：20gなら「20gあたりいくら」）。</p>
          <input
            type="number"
            value={meatUnitPriceBaseGramsText}
            placeholder="20"
            onChange={(event) => {
              const next = event.target.value.replace(/^0+(?=\d)/, "");
              setMeatUnitPriceBaseGramsText(next);
              const parsed = Number(next);
              if (next && parsed > 0) void updateSettings({ ...settings, meatUnitPriceBaseGrams: parsed });
            }}
            className="mt-2 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </label>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-black text-gray-900">クラウド同期設定</h3>
          <p className="mt-1 text-sm text-gray-500">Supabase は匿名キーのみ使用します。service role key は使いません。</p>

          <div className="mt-3 grid gap-3">
            <label className="text-sm font-bold text-gray-600">
              workspaceId
              <input
                value={workspaceIdText}
                onChange={(event) => setWorkspaceIdText(event.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950"
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void updateSettings({ ...settings, workspaceId: workspaceIdText.trim() || settings.workspaceId, cloudSyncEnabled: true })}
                className="rounded-md bg-mint px-4 py-3 font-black text-slate-950"
              >
                workspaceId を保存
              </button>
              <button
                onClick={() => {
                  const next = `workspace-${crypto.randomUUID()}`;
                  setWorkspaceIdText(next);
                  void updateSettings({ ...settings, workspaceId: next, cloudSyncEnabled: true });
                }}
                className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white"
              >
                新しい workspaceId を生成
              </button>
            </div>

            <div className="grid gap-2 md:grid-cols-2">
              <Info label="Supabase 設定" value={supabaseEnvStatus.configured ? "設定済み" : "未設定"} />
              <Info label="Env 判定" value={supabaseEnvStatus.configured ? "URL / KEY 読み込み済み" : `不足: ${supabaseEnvStatus.missingKeys.join(", ")}`} />
              <Info label="同期状態" value={syncOverview.status === "syncing" ? "同期中" : syncOverview.status === "error" ? "エラー" : syncOverview.status === "offline" ? "オフライン" : "待機中"} />
              <Info label="deviceId" value={settings.deviceId} />
              <Info label="最終同期" value={settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString("ja-JP") : "未同期"} />
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <h3 className="text-lg font-black text-gray-900">顧客ディスプレイ</h3>
          <p className="mt-1 text-sm text-gray-500">客用 iPad でこのQRコードをスキャンしてください。</p>
          <div className="mt-3 flex flex-col items-center gap-3 rounded-lg border border-gray-200 bg-panel p-4">
            {pairingQrDataUrl ? (
              <img src={pairingQrDataUrl} alt="顧客ディスプレイ ペアリング用QRコード" className="h-48 w-48 rounded-md bg-white p-2" />
            ) : (
              <div className="grid h-48 w-48 place-items-center rounded-md bg-white text-sm text-slate-500">QRコード生成中...</div>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-danger bg-danger/10 p-4">
          <h3 className="text-lg font-black text-danger">データ初期化</h3>
          <p className="mt-1 text-sm text-slate-600">すべての販売、商品、コスト、営業場次を削除し、初期データに戻します。</p>
          <input
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            placeholder="初期化"
            className="mt-3 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <button
            disabled={confirmText !== "初期化"}
            onClick={() => {
              if (confirm("本当にすべてのデータを初期化しますか？")) void resetAllData();
            }}
            className="mt-3 w-full rounded-md bg-danger py-3 font-black text-white disabled:bg-slate-700 disabled:text-slate-400"
          >
            すべて初期化
          </button>
        </div>
      </div>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 break-all font-black text-slate-950">{value}</div>
    </div>
  );
}
