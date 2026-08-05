"use client";

import { useMemo, useState } from "react";
import { getProductDailyStats, getProductSalesStats, getSessionSalesStats, yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";
import type { Product, SaleRecord, Session } from "@/types";

type Tab = "ranking" | "daily" | "detail";
type SortKey = "revenue" | "quantity";

function isDiscontinued(product: Product | undefined): boolean {
  return !product || !product.enabled || Boolean(product.deletedAt);
}

export default function ProductSalesInsights({ sales, sessions, allProducts }: { sales: SaleRecord[]; sessions: Session[]; allProducts: Product[] }) {
  const { setMode, selectSession } = useAppStore();
  const [tab, setTab] = useState<Tab>("ranking");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [selectedProductId, setSelectedProductId] = useState("");

  const productMap = useMemo(() => new Map(allProducts.map((product) => [product.id, product])), [allProducts]);

  const rankingStats = useMemo(() => {
    const stats = getProductSalesStats(sales);
    return stats.sort((a, b) => (sortKey === "revenue" ? b.revenue - a.revenue : b.quantity - a.quantity));
  }, [sales, sortKey]);

  const dailyStats = useMemo(() => getSessionSalesStats(sales, sessions), [sales, sessions]);
  const maxDailyRevenue = Math.max(1, ...dailyStats.map((stat) => stat.revenue));

  const detailStats = useMemo(
    () => (selectedProductId ? getProductDailyStats(sales, sessions, selectedProductId) : []),
    [sales, sessions, selectedProductId]
  );

  const goToSession = (sessionId: string) => {
    void selectSession(sessionId);
    setMode("review");
  };

  const viewProductDetail = (productId: string) => {
    setSelectedProductId(productId);
    setTab("detail");
  };

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h3 className="text-xl font-black text-slate-950">商品別実績（全期間）</h3>

      <div className="mt-3 flex flex-wrap gap-2 border-b border-gray-200 pb-3">
        <TabButton active={tab === "ranking"} onClick={() => setTab("ranking")}>
          商品別ランキング
        </TabButton>
        <TabButton active={tab === "daily"} onClick={() => setTab("daily")}>
          日別売上推移
        </TabButton>
        <TabButton active={tab === "detail"} onClick={() => setTab("detail")}>
          商品×日別詳細
        </TabButton>
      </div>

      {tab === "ranking" && (
        <div className="mt-4">
          <div className="flex gap-2">
            <SortButton active={sortKey === "revenue"} onClick={() => setSortKey("revenue")}>
              売上金額順
            </SortButton>
            <SortButton active={sortKey === "quantity"} onClick={() => setSortKey("quantity")}>
              販売数順
            </SortButton>
          </div>
          <div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto">
            {rankingStats.map((stat, index) => {
              const product = productMap.get(stat.productId);
              const discontinued = isDiscontinued(product);
              return (
                <div key={stat.productId} className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="w-6 text-sm font-black text-gray-400">{index + 1}</span>
                    <div>
                      <div className="flex items-center gap-2 font-black text-gray-900">
                        {product?.icon} {stat.productName}
                        {discontinued && <span className="rounded bg-gray-200 px-2 py-0.5 text-xs font-bold text-gray-600">販売終了</span>}
                      </div>
                      <div className="text-sm text-gray-500">{stat.quantity}点</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-black text-emerald-600">{yen(stat.revenue)}</div>
                    <button onClick={() => viewProductDetail(stat.productId)} className="text-xs font-bold text-slate-600 underline decoration-dotted">
                      詳細を見る
                    </button>
                  </div>
                </div>
              );
            })}
            {rankingStats.length === 0 && <p className="text-slate-500">売上データがありません。</p>}
          </div>
        </div>
      )}

      {tab === "daily" && (
        <div className="mt-4 max-h-[480px] space-y-2 overflow-y-auto">
          {dailyStats.map((stat) => (
            <div key={stat.sessionId} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-3 text-sm text-gray-900">
                <button onClick={() => goToSession(stat.sessionId)} className="text-left font-bold hover:underline">
                  {stat.date} / {stat.name}
                </button>
                <strong>{yen(stat.revenue)}</strong>
              </div>
              <div className="mt-1.5 h-2.5 rounded-full bg-gray-200">
                <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${(stat.revenue / maxDailyRevenue) * 100}%` }} />
              </div>
            </div>
          ))}
          {dailyStats.length === 0 && <p className="text-slate-500">売上データがありません。</p>}
        </div>
      )}

      {tab === "detail" && (
        <div className="mt-4">
          <label className="block text-sm font-bold text-slate-600">
            商品を選択
            <select
              value={selectedProductId}
              onChange={(event) => setSelectedProductId(event.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950"
            >
              <option value="">商品を選択してください</option>
              {rankingStats.map((stat) => {
                const product = productMap.get(stat.productId);
                const discontinued = isDiscontinued(product);
                return (
                  <option key={stat.productId} value={stat.productId}>
                    {stat.productName}
                    {discontinued ? "（販売終了）" : ""}
                  </option>
                );
              })}
            </select>
          </label>

          {selectedProductId && (
            <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 px-3 text-xs font-bold text-slate-500">
                <span>日付</span>
                <span className="text-right">販売数</span>
                <span className="text-right">売上金額</span>
              </div>
              {detailStats.map((row) => (
                <button
                  key={row.sessionId}
                  onClick={() => goToSession(row.sessionId)}
                  className="grid w-full grid-cols-3 gap-2 rounded-md border border-gray-200 bg-white p-3 text-left text-sm text-gray-900 shadow-sm hover:border-mint"
                >
                  <span className="font-bold">
                    {row.date} <span className="font-normal text-gray-500">/ {row.name}</span>
                  </span>
                  <span className="text-right">{row.quantity}点</span>
                  <span className="text-right font-black text-emerald-600">{yen(row.revenue)}</span>
                </button>
              ))}
              {detailStats.length === 0 && <p className="text-slate-500">この商品の販売実績がありません。</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`min-h-10 rounded-md px-4 text-sm font-bold ${active ? "bg-mint text-slate-950" : "bg-gray-100 text-gray-700"}`}>
      {children}
    </button>
  );
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`min-h-9 rounded-md px-3 text-sm font-bold ${active ? "bg-mint text-slate-950" : "bg-gray-100 text-gray-700"}`}>
      {children}
    </button>
  );
}
