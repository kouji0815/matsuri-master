"use client";

import { downloadTextFile, salesToCsv } from "@/lib/csv";
import { getHourlySales, getSaleSummary, getTopProducts, yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";

export default function ReviewDashboard() {
  const { sessions, selectedSession, sales, costs, products, categories, selectSession, deleteSession } = useAppStore();
  const summary = getSaleSummary(sales, costs);
  const top = getTopProducts(sales, 10);
  const hourly = getHourlySales(sales);
  const maxHour = Math.max(1, ...hourly.map(([, value]) => value));
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
        { categoryName: category.name, quantity: 0, revenue: 0, profit: 0 }
      );
      return stats;
    })
    .filter((stat) => stat.quantity > 0 || stat.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);

  const exportCsv = () => {
    downloadTextFile(`matsuri-review-${selectedSession?.date ?? "session"}.csv`, salesToCsv(sales, selectedSession));
  };

  const removeSession = async (sessionId: string, sessionName: string, isOpen: boolean) => {
    if (isOpen) {
      alert("営業中の回は削除できません。先に収店してください。");
      return;
    }
    if (confirm(`${sessionName} を削除しますか？売上とコスト記録も削除されます。`)) {
      await deleteSession(sessionId);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
      <aside className="no-print rounded-lg border border-line bg-panel p-4">
        <h2 className="text-xl font-black">営業履歴</h2>
        <div className="mt-4 space-y-2">
          {sessions.map((session) => (
            <div key={session.id} className={`rounded-md p-2 ${selectedSession?.id === session.id ? "bg-mint/20" : "bg-white"}`}>
              <button onClick={() => void selectSession(session.id)} className="w-full rounded-md p-2 text-left text-slate-950">
                <div className="font-black">{session.name}</div>
                <div className="text-sm text-slate-500">{session.date}</div>
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
              <h2 className="text-2xl font-black">{selectedSession?.name ?? "営業回を選択"}</h2>
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
          <Metric label="商品原価" value={yen(summary.variableCost)} />
          <Metric label="固定費" value={yen(summary.fixedCost)} />
          <Metric label="注文数" value={`${sales.length}件`} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black">カテゴリ別集計</h3>
            <div className="mt-4 space-y-2">
              {categoryStats.map((item, index) => (
                <div key={item.categoryName} className="rounded-md bg-white p-3">
                  <div className="flex items-center justify-between gap-3">
                    <strong>
                      {index + 1}. {item.categoryName}
                    </strong>
                    <span className="font-black text-emerald-700">{yen(item.revenue)}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    数量 {item.quantity}点 / 利益 {yen(item.profit)}
                  </div>
                </div>
              ))}
              {categoryStats.length === 0 && <p className="text-slate-500">カテゴリ別データがありません。</p>}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black">商品別ランキング</h3>
            <div className="mt-4 space-y-2">
              {top.map((item, index) => (
                <div key={item.name} className="grid grid-cols-[40px_1fr_auto] items-center gap-3 rounded-md bg-white p-3">
                  <strong>{index + 1}</strong>
                  <span>{item.name}</span>
                  <span className="text-right">
                    {item.quantity}点 / {yen(item.profit)}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-panel p-4">
            <h3 className="text-xl font-black">時間帯別売上</h3>
            <div className="mt-4 space-y-3">
              {hourly.map(([hour, value]) => (
                <div key={hour}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span>{hour}</span>
                    <strong>{yen(value)}</strong>
                  </div>
                  <div className="h-3 rounded-full bg-white">
                    <div className="h-3 rounded-full bg-mint" style={{ width: `${(value / maxHour) * 100}%` }} />
                  </div>
                </div>
              ))}
              {hourly.length === 0 && <p className="text-slate-500">売上データがありません。</p>}
            </div>
          </section>
        </div>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black">残在庫</h3>
          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
            {products.map((product) => (
              <div key={product.id} className="rounded-md bg-white p-3">
                <div className="font-black">
                  {product.icon} {product.name}
                </div>
                <div className="text-sm text-slate-500">残 {product.currentStock}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h3 className="text-xl font-black">コスト明細</h3>
          <div className="mt-3 space-y-2">
            {costs.map((cost) => (
              <div key={cost.id} className="flex items-center justify-between rounded-md bg-white p-3">
                <span>{cost.name}</span>
                <strong>{yen(cost.amount)}</strong>
              </div>
            ))}
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
      <div className="mt-1 text-2xl font-black">{value}</div>
    </div>
  );
}
