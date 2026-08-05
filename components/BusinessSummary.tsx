"use client";

import { useEffect, useMemo, useState } from "react";
import { getSaleSummary, yen } from "@/lib/calculations";
import { db } from "@/lib/db";
import ProductSalesInsights from "@/components/ProductSalesInsights";
import { useAppStore } from "@/store/useAppStore";
import type { CostRecord, Product, SaleRecord, Session } from "@/types";

const chartColors = [
  "bg-orange-500",
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-lime-500",
  "bg-cyan-500",
  "bg-fuchsia-500"
];

// This screen is read-only across all-time data — unlike 振り返り (a specific session's detail),
// it never scopes to db.sessions.selectedSession, so it queries db.costs / db.sales directly
// instead of reading the store's session-scoped costs/sales state.
export default function BusinessSummary() {
  const { products, costCategories, settings } = useAppStore();
  const [allCosts, setAllCosts] = useState<CostRecord[]>([]);
  const [allSales, setAllSales] = useState<SaleRecord[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  // Includes disabled AND soft-deleted products too — unlike the store's `products`, which only
  // holds currently-active ones — so past sales of a discontinued product can still show their
  // icon and be labeled correctly in the ranking/detail views below.
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      db.costs.filter((cost) => cost.workspaceId === settings.workspaceId && !cost.deletedAt).toArray(),
      db.sales.filter((sale) => sale.workspaceId === settings.workspaceId && !sale.deletedAt).toArray(),
      db.sessions.filter((session) => session.workspaceId === settings.workspaceId && !session.deletedAt).toArray(),
      db.products.filter((product) => product.workspaceId === settings.workspaceId).toArray()
    ]).then(([costs, sales, sessions, products]) => {
      if (cancelled) return;
      setAllCosts(costs);
      setAllSales(sales);
      setAllSessions(sessions);
      setAllProducts(products);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [settings.workspaceId]);

  const activeProducts = useMemo(
    () => products.filter((product) => product.enabled).sort((a, b) => a.name.localeCompare(b.name, "ja")),
    [products]
  );

  const costCategoryTotals = useMemo(() => {
    const amounts = costCategories
      .filter((category) => category.enabled)
      .map((category) => ({
        id: category.id,
        name: category.name,
        amount: allCosts.filter((cost) => cost.costCategoryId === category.id).reduce((sum, cost) => sum + cost.amount, 0)
      }));
    const totalAmount = amounts.reduce((sum, item) => sum + item.amount, 0);
    return amounts
      .map((item) => ({ ...item, percent: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0 }))
      .sort((a, b) => b.amount - a.amount);
  }, [costCategories, allCosts]);

  const costTotal = allCosts.reduce((sum, cost) => sum + cost.amount, 0);
  const saleSummary = useMemo(() => getSaleSummary(allSales, []), [allSales]);
  // Expenses aren't double-tracked in this app's usage: everything that would normally be a
  // per-product cost is instead logged as a コスト record, so 総収益 is revenue minus every cost
  // record ever entered — not revenue minus the (separately, lightly maintained) per-product
  // unitCost field. The 商品原価一覧 below is kept only as per-product reference data.
  const totalProfit = saleSummary.revenue - costTotal;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-2xl font-black text-slate-950">経営サマリー</h2>
        <p className="mt-1 text-sm text-slate-500">全期間を通じた経営状況をまとめて確認できます（閲覧専用・ここから編集はできません）。</p>
      </div>

      <div className="rounded-lg border-2 border-mint bg-mint/10 p-6 text-center">
        <div className="text-sm font-bold text-slate-600">総収益（全期間粗利益）</div>
        <div className="mt-2 text-4xl font-black text-slate-950 md:text-6xl">{loading ? "計算中..." : yen(totalProfit)}</div>
        <p className="mt-2 text-xs text-slate-500">
          売上合計 {yen(saleSummary.revenue)} − 全コスト合計 {yen(costTotal)}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black text-slate-950">全商品の原価一覧</h3>
          <p className="mt-1 text-sm text-slate-500">現在有効な商品 {activeProducts.length}品</p>
          <p className="mt-1 text-xs text-slate-400">※参考情報です。上部の「総収益」の計算には使用していません（支出はコスト管理の記録で一括集計しています）。</p>
          <div className="mt-3 max-h-[480px] space-y-2 overflow-y-auto">
            {activeProducts.map((product) => {
              const costRate = product.price > 0 ? (product.unitCost / product.price) * 100 : 0;
              return (
                <div key={product.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-black text-gray-900">
                      {product.icon} {product.name}
                    </div>
                    <div className="text-sm font-bold text-gray-500">原価率 {costRate.toFixed(1)}%</div>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-sm text-gray-600">
                    <span>売価 {yen(product.price)}</span>
                    <span>原価 {yen(product.unitCost)}</span>
                  </div>
                </div>
              );
            })}
            {activeProducts.length === 0 && <p className="text-slate-500">有効な商品がありません。</p>}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xl font-black text-slate-950">コスト分類別集計（全期間）</h3>
            <div className="text-right">
              <div className="text-xs text-slate-500">合計</div>
              <div className="text-lg font-black text-amber-600">{yen(costTotal)}</div>
            </div>
          </div>
          <div className="mt-3 space-y-3">
            {costCategoryTotals.map((item, index) => (
              <div key={item.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                <div className="flex items-center justify-between text-sm text-gray-900">
                  <span className="font-bold">{item.name}</span>
                  <strong>
                    {yen(item.amount)} <span className="text-gray-500">({item.percent.toFixed(1)}%)</span>
                  </strong>
                </div>
                <div className="mt-1.5 h-2.5 rounded-full bg-gray-200">
                  <div className={`h-2.5 rounded-full ${chartColors[index % chartColors.length]}`} style={{ width: `${item.percent}%` }} />
                </div>
              </div>
            ))}
            {!loading && costCategoryTotals.every((item) => item.amount === 0) && <p className="text-slate-500">コスト記録がありません。</p>}
          </div>
        </section>
      </div>

      <ProductSalesInsights sales={allSales} sessions={allSessions} allProducts={allProducts} />
    </div>
  );
}
