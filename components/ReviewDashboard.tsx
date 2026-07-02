"use client";

import { downloadTextFile, salesToCsv } from "@/lib/csv";
import { getHourlySales, getSaleSummary, getTopProducts, yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";

export default function ReviewDashboard() {
  const { sessions, selectedSession, sales, costs, products, categories, costCategories, selectSession, deleteSession, deleteSale } = useAppStore();
  const summary = getSaleSummary(sales, costs);
  const top = getTopProducts(sales, 10);
  const hourly = getHourlySales(sales);
  const maxHour = Math.max(1, ...hourly.map(([, value]) => value));
  const totalCategoryRevenue = Math.max(
    1,
    sales.reduce((sum, sale) => sum + sale.items.reduce((itemSum, item) => itemSum + item.subtotal, 0), 0)
  );

  const categoryStats = categories
    .map((category) => {
      const stats = sales.reduce(
        (acc, sale) => {
          sale.items
            .filter((item) => item.category === category.id)
            .forEach((item) => {
              acc.quantity += item.quantity;
              acc.revenue += item.subtotal;
              acc.profit += item.subtotalProfit;
            });
          return acc;
        },
        { categoryId: category.id, categoryName: category.name, quantity: 0, revenue: 0, profit: 0 }
      );
      return {
        ...stats,
        ratio: stats.revenue / totalCategoryRevenue,
        percent: (stats.revenue / totalCategoryRevenue) * 100
      };
    })
    .filter((stat) => stat.quantity > 0 || stat.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const costCategoryStats = costCategories
    .map((category) => ({
      name: category.name,
      amount: costs.filter((cost) => cost.costCategoryId === category.id).reduce((sum, cost) => sum + cost.amount, 0)
    }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const exportCsv = () => {
    downloadTextFile(`matsuri-review-${selectedSession?.date ?? "session"}.csv`, salesToCsv(sales, selectedSession));
  };

  const removeSession = async (sessionId: string, sessionName: string, isOpen: boolean) => {
    if (isOpen) {
      alert("営業中の場次は削除できません。先に終了してください。");
      return;
    }
    if (confirm(`${sessionName} を削除しますか？この場次の売上記録も削除対象になります。`)) {
      await deleteSession(sessionId);
    }
  };

  const removeSale = async (saleId: string, orderId: string) => {
    if (confirm(`${orderId} を削除しますか？在庫も元に戻します。`)) {
      await deleteSale(saleId);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="no-print rounded-lg border border-line bg-panel p-4">
        <h2 className="text-xl font-black text-slate-950">営業場次</h2>
        <div className="mt-4 space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className={`rounded-md border p-2 ${selectedSession?.id === session.id ? "border-mint bg-mint/20" : "border-gray-200 bg-white shadow-sm"}`}>
              <button onClick={() => void selectSession(session.id)} className="w-full rounded-md p-2 text-left text-slate-950">
                <div className="font-black">{session.name}</div>
                <div className="text-sm text-slate-600">{session.date}</div>
              </button>
              <button onClick={() => void removeSession(session.id, session.name, session.status === "open")} className="mt-1 w-full rounded-md bg-danger py-2 text-sm font-black text-white">
                削除
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="space-y-4">
        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-black text-slate-950">{selectedSession?.name ?? "場次を選択してください"}</h2>
              <p className="text-sm text-slate-500">
                {selectedSession?.date} {selectedSession?.location ? `/ ${selectedSession.location}` : ""}
              </p>
            </div>
            <div className="no-print flex gap-2">
              <button onClick={exportCsv} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
                CSV
              </button>
              <button onClick={() => window.print()} className="rounded-md bg-mint px-4 py-3 font-black text-slate-950">
                印刷
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Metric label="売上" value={yen(summary.revenue)} />
          <Metric label="販売数" value={`${summary.quantity}点`} />
          <Metric label="粗利益" value={yen(summary.grossProfit)} />
          <Metric label="純利益" value={yen(summary.netProfit)} />
          <Metric label="利益率" value={`${(summary.profitRate * 100).toFixed(1)}%`} />
          <Metric label="原価率" value={`${(summary.costRate * 100).toFixed(1)}%`} />
          <Metric label="商品原価" value={yen(summary.variableCost)} />
          <Metric label="固定費" value={yen(summary.fixedCost)} />
          <Metric label="会計件数" value={`${sales.length}件`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black text-slate-950">分類別売上</h3>
            <div className="mt-4 space-y-2">
              {categoryStats.map((item, index) => (
                <div key={item.categoryId} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <strong className="text-gray-900">
                      {index + 1}. {item.categoryName}
                    </strong>
                    <span className="text-right font-black text-emerald-600">
                      {yen(item.revenue)}
                      <span className="ml-1 text-sm text-gray-500">({item.percent.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="mt-2 h-2.5 rounded-full bg-gray-200">
                    <div className="h-2.5 rounded-full bg-emerald-500" style={{ width: `${item.ratio * 100}%` }} />
                  </div>
                  <div className="mt-1 text-sm text-gray-500">数量 {item.quantity}点 / 利益 {yen(item.profit)}</div>
                </div>
              ))}
              {categoryStats.length === 0 && <p className="text-slate-500">分類データがありません。</p>}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black text-slate-950">商品ランキング</h3>
            <div className="mt-4 space-y-2">
              {top.map((item, index) => (
                <div key={item.name} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-md border border-gray-200 bg-white p-3 text-gray-900 shadow-sm">
                  <strong>{index + 1}</strong>
                  <span>{item.name}</span>
                  <span className="text-right">
                    {item.quantity}点 / {yen(item.profit)}
                  </span>
                </div>
              ))}
              {top.length === 0 && <p className="text-slate-500">商品データがありません。</p>}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black text-slate-950">時間帯別売上</h3>
            <div className="mt-4 space-y-3">
              {hourly.map(([hour, value]) => (
                <div key={hour}>
                  <div className="mb-1 flex justify-between text-sm text-slate-700">
                    <span>{hour}</span>
                    <strong>{yen(value)}</strong>
                  </div>
                  <div className="h-3 rounded-full bg-gray-200">
                    <div className="h-3 rounded-full bg-mint" style={{ width: `${(value / maxHour) * 100}%` }} />
                  </div>
                </div>
              ))}
              {hourly.length === 0 && <p className="text-slate-500">売上データがありません。</p>}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black text-slate-950">分類別コスト</h3>
            <div className="mt-4 space-y-2">
              {costCategoryStats.map((item, index) => (
                <div key={item.name} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                  <div className="flex items-center justify-between text-gray-900">
                    <strong>
                      {index + 1}. {item.name}
                    </strong>
                    <span className="font-black text-amber-600">{yen(item.amount)}</span>
                  </div>
                </div>
              ))}
              {costCategoryStats.length === 0 && <p className="text-slate-500">コスト分類データがありません。</p>}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-xl font-black text-slate-950">売上明細</h3>
              <p className="text-sm text-slate-500">削除すると、その会計で減った在庫も元に戻ります。</p>
            </div>
            <div className="rounded-md bg-gray-100 px-3 py-2 text-sm font-bold text-gray-700">{sales.length}件</div>
          </div>
          <div className="mt-4 space-y-3">
            {sales.map((sale) => (
              <article key={sale.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h4 className="font-black text-gray-900">{sale.orderId}</h4>
                    <p className="text-sm text-gray-500">{new Date(sale.createdAt).toLocaleString("ja-JP")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-right">
                      <div className="font-black text-emerald-600">{yen(sale.finalTotal)}</div>
                      <div className="text-sm text-gray-500">利益 {yen(sale.grossProfit)}</div>
                    </div>
                    <button onClick={() => void removeSale(sale.id, sale.orderId)} className="rounded-md bg-danger px-3 py-2 text-sm font-black text-white">
                      削除
                    </button>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  {sale.items.map((item, index) => (
                    <div key={`${sale.id}-${item.productId}-${index}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-gray-50 px-3 py-2 text-sm text-gray-900">
                      <span>{item.productName} / {item.quantity}点</span>
                      <span>{yen(item.subtotal)} / 原価 {yen(item.subtotalCost)} / 利益 {yen(item.subtotalProfit)}</span>
                    </div>
                  ))}
                </div>
              </article>
            ))}
            {sales.length === 0 && <p className="text-slate-500">売上記録がありません。</p>}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black text-slate-950">残り在庫</h3>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
                <div className="font-black text-gray-900">
                  {product.icon} {product.name}
                </div>
                <div className="text-sm text-gray-500">残 {product.currentStock}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black text-slate-950">コスト明細</h3>
          <div className="mt-3 space-y-2">
            {costs.map((cost) => {
              const categoryName = costCategories.find((category) => category.id === cost.costCategoryId)?.name ?? "その他";
              return (
                <div key={cost.id} className="flex items-center justify-between rounded-md border border-gray-200 bg-white p-3 text-gray-900 shadow-sm">
                  <span>
                    {cost.name} / {categoryName}
                  </span>
                  <strong>{yen(cost.amount)}</strong>
                </div>
              );
            })}
            {costs.length === 0 && <p className="text-slate-500">コスト記録がありません。</p>}
          </div>
        </section>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}
