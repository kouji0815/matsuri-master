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
  CostRecord,
  Product,
  ProductCategory,
  SaleRecord,
  Session,
  StockAdjustment
} from "@/types";

type DataSnapshot = {
  categories: ProductCategory[];
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
  const header = ["時間", "商品名", "数量", "単価", "単価原価", "売上小計", "原価小計", "利益小計", "営業回"];
  return [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

function isBackupPayload(value: unknown): value is BackupPayload {
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
  const refreshStore = useAppStore((state) => state.refresh);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [snapshot, setSnapshot] = useState<DataSnapshot>(emptySnapshot);
  const [selectedSessionId, setSelectedSessionId] = useState("");
  const [filters, setFilters] = useState({ sessionId: "", date: "", productId: "", categoryId: "" });
  const [deleteText, setDeleteText] = useState("");
  const [message, setMessage] = useState("");

  const loadSnapshot = async () => {
    const [categories, products, bundles, sessions, sales, costs, stockAdjustments, settings] = await Promise.all([
      db.categories.toArray(),
      db.products.toArray(),
      db.bundles.toArray(),
      db.sessions.toArray(),
      db.sales.toArray(),
      db.costs.toArray(),
      db.stockAdjustments.toArray(),
      db.settings.toArray()
    ]);
    const sortedSessions = sessions.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
    setSnapshot({
      categories: categories.sort((a, b) => a.sortOrder - b.sortOrder),
      products: products.sort((a, b) => a.name.localeCompare(b.name, "ja")),
      bundles,
      sessions: sortedSessions,
      sales: sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      costs,
      stockAdjustments,
      settings
    });
    setSelectedSessionId((current) => current || sortedSessions[0]?.id || "");
  };

  useEffect(() => {
    void loadSnapshot();
  }, []);

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
    const nextSettings = snapshot.settings.map((setting) =>
      setting.id === "main" ? { ...setting, latestBackupAt: new Date().toISOString() } : setting
    );
    if (!nextSettings.some((setting) => setting.id === "main")) {
      nextSettings.push({ id: "main", highTrafficMode: false, soundEnabled: true, defaultTargetSales: 100000, latestBackupAt: new Date().toISOString() });
    }
    await db.settings.bulkPut(nextSettings);
    await loadSnapshot();
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      categories: await db.categories.toArray(),
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
    setMessage("完全バックアップ JSON を書き出しました。");
  };

  const exportCurrentSessionJson = () => {
    if (!selectedSession) return;
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      session: selectedSession,
      sales: selectedSessionSales,
      costs: snapshot.costs.filter((cost) => cost.sessionId === selectedSession.id)
    };
    downloadTextFile(`matsuri-session-${safeFileName(selectedSession.name)}-${today()}.json`, JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
    setMessage("選択中の営業回 JSON を書き出しました。");
  };

  const exportAllSalesCsv = () => {
    downloadTextFile(`matsuri-sales-all-${today()}.csv`, salesCsv(snapshot.sales, snapshot.sessions));
    setMessage("全販売 CSV を書き出しました。");
  };

  const exportCurrentSessionCsv = () => {
    if (!selectedSession) return;
    downloadTextFile(`matsuri-sales-${safeFileName(selectedSession.name)}-${today()}.csv`, salesCsv(selectedSessionSales, snapshot.sessions));
    setMessage("選択中の営業回 CSV を書き出しました。");
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!confirm("読み込みを行うと現在のローカルデータは上書きされます。続行しますか？")) return;

    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (!isBackupPayload(parsed)) {
        setMessage("JSON の形式が正しくありません。読み込みは行われませんでした。");
        return;
      }
      await db.transaction("rw", [db.categories, db.products, db.bundles, db.sessions, db.sales, db.costs, db.stockAdjustments, db.settings], async () => {
        await Promise.all([
          db.categories.clear(),
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
          db.products.bulkPut(parsed.products),
          db.bundles.bulkPut(parsed.bundles),
          db.sessions.bulkPut(parsed.sessions),
          db.sales.bulkPut(parsed.sales),
          db.costs.bulkPut(parsed.costs),
          db.stockAdjustments.bulkPut(parsed.stockAdjustments),
          db.settings.bulkPut(parsed.settings)
        ]);
      });
      await ensureSeedData();
      await refreshStore();
      await loadSnapshot();
      setMessage("バックアップを読み込み、データを復元しました。");
    } catch {
      setMessage("読み込みに失敗しました。Matsuri Master のバックアップ JSON か確認してください。");
    }
  };

  const clearAllData = async () => {
    if (deleteText !== "DELETE") return;
    if (!confirm("消去前に必ず完全バックアップ JSON を書き出してください。続行しますか？")) return;
    if (!confirm("最終確認です。現在のローカルデータをすべて消去します。")) return;

    await db.transaction("rw", [db.categories, db.products, db.bundles, db.sessions, db.sales, db.costs, db.stockAdjustments, db.settings], async () => {
      await Promise.all([
        db.categories.clear(),
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
    await refreshStore();
    await loadSnapshot();
    setDeleteText("");
    setMessage("ローカルデータを消去し、初期データを復元しました。");
  };

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-line bg-panel p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-black">データ管理</h2>
            <p className="text-sm text-slate-600">本端末の IndexedDB データを確認、絞り込み、バックアップ、復元できます。</p>
          </div>
          {message && <div className="rounded-md border border-mint bg-mint/15 px-3 py-2 font-bold text-emerald-700">{message}</div>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="営業回数" value={`${snapshot.sessions.length}`} />
          <Metric label="商品数" value={`${snapshot.products.length}`} />
          <Metric label="販売記録数" value={`${snapshot.sales.length}`} />
          <Metric label="コスト記録数" value={`${snapshot.costs.length}`} />
          <Metric label="在庫調整数" value={`${snapshot.stockAdjustments.length}`} />
          <Metric label="最新バックアップ" value={latestBackupAt ? new Date(latestBackupAt).toLocaleString("ja-JP") : "未作成"} />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black">営業履歴一覧</h3>
          <div className="mt-4 max-h-[620px] space-y-3 overflow-auto">
            {sessionSummaries.map(({ session, summary }) => (
              <button
                key={session.id}
                onClick={() => {
                  setSelectedSessionId(session.id);
                  setFilters((current) => ({ ...current, sessionId: session.id }));
                }}
                className={`w-full rounded-lg border p-4 text-left ${
                  selectedSessionId === session.id ? "border-mint bg-mint/15" : "border-line bg-white"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-black">{session.name}</div>
                    <div className="text-sm text-slate-600">{session.date}</div>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{sessionStatusLabel[session.status]}</span>
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
              <h3 className="text-xl font-black">販売記録</h3>
              <p className="text-sm text-slate-600">{selectedSession ? `選択中の営業回：${selectedSession.name}` : "営業回を選択してください"}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={exportFullBackup} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
                完全バックアップ JSON
              </button>
              <button onClick={exportCurrentSessionJson} disabled={!selectedSession} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white disabled:bg-slate-300">
                選択中の営業回 JSON
              </button>
              <button onClick={exportAllSalesCsv} className="rounded-md bg-mint px-4 py-3 font-black text-slate-950">
                全販売 CSV
              </button>
              <button onClick={exportCurrentSessionCsv} disabled={!selectedSession} className="rounded-md bg-mint px-4 py-3 font-black text-slate-950 disabled:bg-slate-300">
                選択中の営業回 CSV
              </button>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <label className="text-sm font-bold text-slate-600">
              営業回
              <select value={filters.sessionId} onChange={(event) => setFilters({ ...filters, sessionId: event.target.value })} className="mt-1 w-full rounded-md border border-line bg-white p-3">
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
              <input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} className="mt-1 w-full rounded-md border border-line bg-white p-3" />
            </label>
            <label className="text-sm font-bold text-slate-600">
              商品
              <select value={filters.productId} onChange={(event) => setFilters({ ...filters, productId: event.target.value })} className="mt-1 w-full rounded-md border border-line bg-white p-3">
                <option value="">すべて</option>
                {snapshot.products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-bold text-slate-600">
              カテゴリ
              <select value={filters.categoryId} onChange={(event) => setFilters({ ...filters, categoryId: event.target.value })} className="mt-1 w-full rounded-md border border-line bg-white p-3">
                <option value="">すべて</option>
                {snapshot.categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 max-h-[560px] overflow-auto rounded-lg border border-line bg-white">
            <table className="w-full min-w-[920px] border-collapse text-sm">
              <thead className="sticky top-0 bg-slate-100 text-left">
                <tr>
                  {["時間", "商品名", "数量", "単価", "小計", "原価", "利益", "営業回", "カテゴリ"].map((item) => (
                    <th key={item} className="border-b border-line p-3">
                      {item}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSales.flatMap((sale) =>
                  sale.items.map((item) => (
                    <tr key={`${sale.id}-${item.productId}-${item.productName}`} className="border-b border-line">
                      <td className="p-3">{new Date(sale.createdAt).toLocaleString("ja-JP")}</td>
                      <td className="p-3 font-bold">{item.productName}</td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">{yen(item.unitPrice)}</td>
                      <td className="p-3">{yen(item.subtotal)}</td>
                      <td className="p-3">{yen(item.subtotalCost)}</td>
                      <td className="p-3">{yen(item.subtotalProfit)}</td>
                      <td className="p-3">{sessionMap.get(sale.sessionId)?.name ?? ""}</td>
                      <td className="p-3">{categoryMap.get(item.category)?.name ?? productMap.get(item.productId)?.category ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {filteredSales.length === 0 && <div className="p-6 text-center text-slate-600">条件に合う販売記録がありません。</div>}
          </div>
        </section>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black">データ読み込み</h3>
          <p className="mt-1 text-sm text-slate-600">完全バックアップ JSON を読み込めます。読み込みを行うと現在のローカルデータは上書きされます。</p>
          <input ref={fileInputRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="mt-4 rounded-md bg-slate-700 px-5 py-3 font-bold text-white">
            バックアップ JSON を選択
          </button>
        </div>

        <div className="rounded-lg border border-danger bg-danger/10 p-4">
          <h3 className="text-xl font-black text-danger">データ消去</h3>
          <p className="mt-1 text-sm text-slate-700">消去前に完全バックアップ JSON を書き出してください。DELETE と入力した場合のみ消去できます。</p>
          <input value={deleteText} onChange={(event) => setDeleteText(event.target.value)} placeholder="DELETE" className="mt-3 w-full rounded-md border border-line bg-white p-3" />
          <button disabled={deleteText !== "DELETE"} onClick={clearAllData} className="mt-3 w-full rounded-md bg-danger py-3 font-black text-white disabled:bg-slate-300">
            ローカルデータをすべて消去
          </button>
        </div>
      </section>

      <section className="rounded-lg border border-line bg-panel p-4">
        <h3 className="text-lg font-black">iPad 利用時の注意</h3>
        <p className="mt-1 text-slate-700">
          本アプリのデータは、現在使用している iPad のブラウザ内に保存されます。端末を変更する前、またはブラウザデータを消去する前に、必ずバックアップ JSON を書き出してください。
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-white p-3">
      <div className="text-sm font-bold text-slate-600">{label}</div>
      <div className="mt-1 text-lg font-black">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-slate-100 p-2">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="font-black">{value}</div>
    </div>
  );
}
