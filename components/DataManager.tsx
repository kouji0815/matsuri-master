"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { db, ensureSeedData } from "@/lib/db";
import { getSaleSummary, yen } from "@/lib/calculations";
import { downloadTextFile } from "@/lib/csv";
import { useAppStore } from "@/store/useAppStore";
import type {
  AppSettings,
  BackupPayload,
  BundleRule,
  CostCategory,
  CostRecord,
  Product,
  ProductCategory,
  SaleRecord,
  Session,
  StockAdjustment
} from "@/types";

type DataSnapshot = {
  categories: ProductCategory[];
  costCategories: CostCategory[];
  products: Product[];
  bundles: BundleRule[];
  sessions: Session[];
  sales: SaleRecord[];
  costs: CostRecord[];
  stockAdjustments: StockAdjustment[];
  settings: AppSettings[];
};

const emptySnapshot: DataSnapshot = {
  categories: [],
  costCategories: [],
  products: [],
  bundles: [],
  sessions: [],
  sales: [],
  costs: [],
  stockAdjustments: [],
  settings: []
};

const sessionStatusLabel: Record<Session["status"], string> = {
  planned: "未開始",
  open: "営業中",
  closed: "終了"
};

const today = () => new Date().toISOString().slice(0, 10);

const safeFileName = (value: string) =>
  value
    .trim()
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-") || "session";

const csvEscape = (value: string | number) => `"${String(value).replaceAll('"', '""')}"`;

function salesCsv(sales: SaleRecord[], sessions: Session[]) {
  const sessionMap = new Map(sessions.map((session) => [session.id, session.name]));
  const rows = sales.flatMap((sale) =>
    sale.items.map((item) => [
      new Date(sale.createdAt).toLocaleString("ja-JP"),
      item.productName,
      item.quantity,
      item.unitPrice,
      item.unitCost,
      item.subtotal,
      item.subtotalCost,
      item.subtotalProfit,
      sessionMap.get(sale.sessionId) ?? ""
    ])
  );
  const header = ["時間", "商品名", "数量", "単価", "単個原価", "小計売上", "小計原価", "小計利益", "場次名"];
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function isBackupPayload(value: unknown): value is BackupPayload | (Omit<BackupPayload, "costCategories" | "version"> & { version?: number }) {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    Array.isArray(record.categories) &&
    Array.isArray(record.products) &&
    Array.isArray(record.bundles) &&
    Array.isArray(record.sessions) &&
    Array.isArray(record.sales) &&
    Array.isArray(record.costs) &&
    Array.isArray(record.stockAdjustments) &&
    Array.isArray(record.settings)
  );
}

export default function DataManager() {
  const {
    refresh,
    setMode,
    settings,
    syncOverview,
    refreshSyncOverview,
    runSyncAll,
    runPullSync,
    runPushSync,
    disconnectCloudSync
  } = useAppStore();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [snapshot, setSnapshot] = useState<DataSnapshot>(emptySnapshot);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [filters, setFilters] = useState({ sessionId: "", date: "", productId: "", categoryId: "" });
  const [deleteText, setDeleteText] = useState("");
  const [message, setMessage] = useState("");

  const loadSnapshot = async () => {
    const [categories, costCategories, products, bundles, sessions, sales, costs, stockAdjustments, settingsRows] = await Promise.all([
      db.categories.toArray(),
      db.costCategories.toArray(),
      db.products.toArray(),
      db.bundles.toArray(),
      db.sessions.toArray(),
      db.sales.toArray(),
      db.costs.toArray(),
      db.stockAdjustments.toArray(),
      db.settings.toArray()
    ]);
    const sortedSessions = sessions.filter((item) => !item.deletedAt).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    setSnapshot({
      categories: categories.filter((item) => !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
      costCategories: costCategories.filter((item) => !item.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
      products: products.filter((item) => !item.deletedAt).sort((a, b) => a.name.localeCompare(b.name, "ja")),
      bundles: bundles.filter((item) => !item.deletedAt),
      sessions: sortedSessions,
      sales: sales.filter((item) => !item.deletedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      costs: costs.filter((item) => !item.deletedAt),
      stockAdjustments: stockAdjustments.filter((item) => !item.deletedAt),
      settings: settingsRows
    });
    setSelectedSessionId((current) => current || sortedSessions[0]?.id || "");
  };

  useEffect(() => {
    void loadSnapshot();
    void refreshSyncOverview();
  }, [refreshSyncOverview]);

  const sessionMap = useMemo(() => new Map(snapshot.sessions.map((session) => [session.id, session])), [snapshot.sessions]);
  const productMap = useMemo(() => new Map(snapshot.products.map((product) => [product.id, product])), [snapshot.products]);
  const categoryMap = useMemo(() => new Map(snapshot.categories.map((category) => [category.id, category])), [snapshot.categories]);
  const latestBackupAt = snapshot.settings.find((setting) => setting.id === "main")?.latestBackupAt;
  const selectedSession = snapshot.sessions.find((session) => session.id === selectedSessionId);

  const sessionSummaries = useMemo(
    () =>
      snapshot.sessions.map((session) => {
        const sessionSales = snapshot.sales.filter((sale) => sale.sessionId === session.id);
        const sessionCosts = snapshot.costs.filter((cost) => cost.sessionId === session.id);
        return { session, summary: getSaleSummary(sessionSales, sessionCosts) };
      }),
    [snapshot.costs, snapshot.sales, snapshot.sessions]
  );

  const filteredSales = useMemo(() => {
    return snapshot.sales.filter((sale) => {
      if (filters.sessionId && sale.sessionId !== filters.sessionId) return false;
      if (filters.date && !sale.createdAt.startsWith(filters.date)) return false;
      if (filters.productId && !sale.items.some((item) => item.productId === filters.productId)) return false;
      if (filters.categoryId && !sale.items.some((item) => item.category === filters.categoryId)) return false;
      return true;
    });
  }, [filters, snapshot.sales]);

  const selectedSessionSales = snapshot.sales.filter((sale) => sale.sessionId === selectedSessionId);

  const buildBackup = async () => {
    const backupAt = new Date().toISOString();
    const nextSettings: AppSettings[] = snapshot.settings.map((setting) =>
      setting.id === "main" ? { ...setting, latestBackupAt: backupAt, updatedAt: backupAt, syncStatus: "pending" } : setting
    );
    await db.settings.bulkPut(nextSettings);
    await loadSnapshot();
    return {
      version: 2,
      exportedAt: backupAt,
      categories: await db.categories.toArray(),
      costCategories: await db.costCategories.toArray(),
      products: await db.products.toArray(),
      bundles: await db.bundles.toArray(),
      sessions: await db.sessions.toArray(),
      sales: await db.sales.toArray(),
      costs: await db.costs.toArray(),
      stockAdjustments: await db.stockAdjustments.toArray(),
      settings: await db.settings.toArray()
    } satisfies BackupPayload;
  };

  const exportFullBackup = async () => {
    const backup = await buildBackup();
    downloadTextFile(`matsuri-master-backup-${today()}.json`, JSON.stringify(backup, null, 2), "application/json;charset=utf-8");
    setMessage("完全バックアップ JSON を出力しました。");
  };

  const exportCurrentSessionJson = () => {
    if (!selectedSession) return;
    const payload = {
      version: 2,
      exportedAt: new Date().toISOString(),
      session: selectedSession,
      sales: selectedSessionSales,
      costs: snapshot.costs.filter((cost) => cost.sessionId === selectedSession.id)
    };
    downloadTextFile(
      `matsuri-session-${safeFileName(selectedSession.name)}-${today()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
    setMessage("現在の場次 JSON を出力しました。");
  };

  const exportAllSalesCsv = () => {
    downloadTextFile(`matsuri-sales-all-${today()}.csv`, salesCsv(snapshot.sales, snapshot.sessions));
    setMessage("全販売 CSV を出力しました。");
  };

  const exportCurrentSessionCsv = () => {
    if (!selectedSession) return;
    downloadTextFile(`matsuri-sales-${safeFileName(selectedSession.name)}-${today()}.csv`, salesCsv(selectedSessionSales, snapshot.sessions));
    setMessage("現在の場次 CSV を出力しました。");
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!confirm("インポートすると現在のローカルデータを上書きします。続行しますか？")) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackupPayload(parsed)) {
        setMessage("JSON 形式が正しくありません。");
        return;
      }
      const normalizedCostCategories = "costCategories" in parsed && Array.isArray(parsed.costCategories) ? parsed.costCategories : [];
      const normalizedCosts = parsed.costs.map((cost) => ({ ...cost, costCategoryId: (cost as CostRecord).costCategoryId ?? "cost-other" }));
      await db.transaction("rw", [db.categories, db.costCategories, db.products, db.bundles, db.sessions, db.sales, db.costs, db.stockAdjustments, db.settings], async () => {
        await Promise.all([
          db.categories.clear(),
          db.costCategories.clear(),
          db.products.clear(),
          db.bundles.clear(),
          db.sessions.clear(),
          db.sales.clear(),
          db.costs.clear(),
          db.stockAdjustments.clear(),
          db.settings.clear()
        ]);
        await Promise.all([
          db.categories.bulkPut(parsed.categories),
          db.costCategories.bulkPut(normalizedCostCategories),
          db.products.bulkPut(parsed.products),
          db.bundles.bulkPut(parsed.bundles),
          db.sessions.bulkPut(parsed.sessions),
          db.sales.bulkPut(parsed.sales),
          db.costs.bulkPut(normalizedCosts),
          db.stockAdjustments.bulkPut(parsed.stockAdjustments),
          db.settings.bulkPut(parsed.settings)
        ]);
      });
      await ensureSeedData();
      await refresh();
      await loadSnapshot();
      await refreshSyncOverview();
      setMessage("バックアップを読み込みました。");
    } catch {
      setMessage("読み込みに失敗しました。Matsuri Master の JSON バックアップを確認してください。");
    }
  };

  const clearAllData = async () => {
    if (deleteText !== "DELETE") return;
    if (!confirm("削除前にバックアップ JSON を出力しましたか？")) return;
    if (!confirm("本当にすべてのローカルデータを削除しますか？")) return;

    await db.transaction("rw", [db.categories, db.costCategories, db.products, db.bundles, db.sessions, db.sales, db.costs, db.stockAdjustments, db.settings], async () => {
      await Promise.all([
        db.categories.clear(),
        db.costCategories.clear(),
        db.products.clear(),
        db.bundles.clear(),
        db.sessions.clear(),
        db.sales.clear(),
        db.costs.clear(),
        db.stockAdjustments.clear(),
        db.settings.clear()
      ]);
    });
    await ensureSeedData();
    await refresh();
    await loadSnapshot();
    await refreshSyncOverview();
    setDeleteText("");
    setMessage("ローカルデータを初期化しました。");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black text-slate-950">データ管理</h2>
            <p className="text-sm text-slate-600">
              本アプリはオフライン優先です。営業中のデータはまずこの端末に保存され、ネット接続時にクラウドへ同期されます。
            </p>
          </div>
          {message && <div className="rounded-md border border-mint bg-mint/15 px-3 py-2 font-bold text-emerald-700">{message}</div>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="場次数" value={`${snapshot.sessions.length}`} />
          <Metric label="商品数" value={`${snapshot.products.length}`} />
          <Metric label="販売記録数" value={`${snapshot.sales.length}`} />
          <Metric label="コスト記録数" value={`${snapshot.costs.length}`} />
          <Metric label="在庫調整数" value={`${snapshot.stockAdjustments.length}`} />
          <Metric label="最新バックアップ" value={latestBackupAt ? new Date(latestBackupAt).toLocaleString("ja-JP") : "未作成"} />
        </div>
      </section>

      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-black text-slate-950">クラウド同期</h3>
            <p className="text-sm text-slate-600">Supabase はバックアップと複数端末共有用です。営業データの本体はこの端末の IndexedDB に残ります。</p>
          </div>
          <button onClick={() => setMode("settings")} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
            クラウド同期設定
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Metric label="同期状態" value={syncOverview.status === "syncing" ? "同期中" : syncOverview.status === "error" ? "エラー" : syncOverview.status === "offline" ? "オフライン" : "待機中"} />
          <Metric label="Supabase 接続" value={syncOverview.connected ? "有効" : "未設定"} />
          <Metric label="オンライン" value={syncOverview.online ? "はい" : "いいえ"} />
          <Metric label="未同期件数" value={`${syncOverview.pendingCount}`} />
          <Metric label="失敗件数" value={`${syncOverview.failedCount}`} />
          <Metric label="最終同期" value={syncOverview.lastSyncedAt ? new Date(syncOverview.lastSyncedAt).toLocaleString("ja-JP") : "未同期"} />
          <Metric label="deviceId" value={syncOverview.deviceId || settings.deviceId} />
          <Metric label="workspaceId" value={syncOverview.workspaceId || settings.workspaceId} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => void runSyncAll()} className="rounded-md bg-mint px-4 py-3 font-black text-slate-950">
            今すぐ同期
          </button>
          <button onClick={() => void runPullSync()} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
            クラウドから取得
          </button>
          <button onClick={() => void runPushSync()} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
            ローカルをアップロード
          </button>
          <button onClick={() => void disconnectCloudSync()} className="rounded-md bg-danger px-4 py-3 font-bold text-white">
            クラウド同期を解除
          </button>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black text-slate-950">営業記録一覧</h3>
          <div className="mt-4 max-h-[620px] space-y-3 overflow-auto">
            {sessionSummaries.map(({ session, summary }) => (
              <button
                key={session.id}
                onClick={() => {
                  setSelectedSessionId(session.id);
                  setFilters((current) => ({ ...current, sessionId: session.id }));
                }}
                className={`w-full rounded-lg border p-4 text-left shadow-sm ${
                  selectedSessionId === session.id ? "border-mint bg-mint/15 text-slate-950" : "border-gray-200 bg-white text-gray-900"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black">{session.name}</div>
                    <div className={`text-sm ${selectedSessionId === session.id ? "text-slate-600" : "text-gray-500"}`}>{session.date}</div>
                  </div>
                  <span className="rounded-md bg-slate-700 px-2 py-1 text-xs font-black text-white">{sessionStatusLabel[session.status]}</span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
                  <Mini label="売上" value={yen(summary.revenue)} />
                  <Mini label="販売数" value={`${summary.quantity}`} />
                  <Mini label="純利益" value={yen(summary.netProfit)} />
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">販売記録</h3>
              <p className="text-sm text-slate-600">{selectedSession ? `選択中: ${selectedSession.name}` : "場次を選択してください"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportFullBackup} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
                完全バックアップ JSON
              </button>
              <button onClick={exportCurrentSessionJson} disabled={!selectedSession} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white disabled:bg-slate-500">
                現在の場次 JSON
              </button>
              <button onClick={exportAllSalesCsv} className="rounded-md bg-mint px-4 py-3 font-black text-slate-950">
                全販売 CSV
              </button>
              <button onClick={exportCurrentSessionCsv} disabled={!selectedSession} className="rounded-md bg-mint px-4 py-3 font-black text-slate-950 disabled:bg-slate-500">
                現在の場次 CSV
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="text-sm font-bold text-slate-600">
              場次
              <select
                value={filters.sessionId}
                onChange={(event) => setFilters({ ...filters, sessionId: event.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">すべて</option>
                {snapshot.sessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-600">
              日付
              <input
                value={filters.date}
                onChange={(event) => setFilters({ ...filters, date: event.target.value })}
                type="date"
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
              />
            </label>
            <label className="text-sm font-bold text-slate-600">
              商品
              <select
                value={filters.productId}
                onChange={(event) => setFilters({ ...filters, productId: event.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">すべて</option>
                {snapshot.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-600">
              分類
              <select
                value={filters.categoryId}
                onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                <option value="">すべて</option>
                {snapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 max-h-[540px] space-y-3 overflow-auto">
            {filteredSales.map((sale) => (
              <article key={sale.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-black text-gray-900">{sale.orderId}</h4>
                    <p className="text-sm text-gray-500">
                      {new Date(sale.createdAt).toLocaleString("ja-JP")} / {sessionMap.get(sale.sessionId)?.name ?? ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-amber-600">{yen(sale.finalTotal)}</div>
                    <div className="text-sm text-gray-500">利益 {yen(sale.grossProfit)}</div>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {sale.items.map((item, index) => (
                    <div key={`${sale.id}-${item.productId}-${index}`} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-900">
                      <span>
                        {item.productName} / {categoryMap.get(item.category)?.name ?? ""} / {item.quantity}点
                      </span>
                      <span>
                        {yen(item.subtotal)} / 原価 {yen(item.subtotalCost)} / 利益 {yen(item.subtotalProfit)}
                      </span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {filteredSales.length === 0 && <p className="text-gray-500">条件に一致する販売記録はありません。</p>}
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-line bg-panel p-4">
        <h3 className="text-xl font-black text-slate-950">バックアップ / 復元</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => fileInputRef.current?.click()} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
            完全バックアップ JSON を読み込む
          </button>
          <input ref={fileInputRef} type="file" accept="application/json" className="hidden" onChange={importBackup} />
        </div>
        <div className="mt-4 rounded-lg border border-danger bg-danger/10 p-4">
          <h4 className="font-black text-danger">ローカルデータ削除</h4>
          <p className="mt-1 text-sm text-slate-600">
            本 App のデータは現在の iPad のブラウザに保存されます。端末変更やブラウザデータ削除の前に、必ずバックアップ JSON を出力してください。
          </p>
          <input
            value={deleteText}
            onChange={(event) => setDeleteText(event.target.value)}
            placeholder="DELETE"
            className="mt-3 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
          />
          <button
            disabled={deleteText !== "DELETE"}
            onClick={() => void clearAllData()}
            className="mt-3 w-full rounded-md bg-danger py-3 font-black text-white disabled:bg-slate-700 disabled:text-slate-400"
          >
            ローカルデータを削除
          </button>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="mt-1 break-all text-lg font-black text-gray-900">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-black text-gray-900">{value}</div>
    </div>
  );
}
