"use client";

import { useAppStore } from "@/store/useAppStore";
import { yen } from "@/lib/calculations";

export default function SalesHistory() {
  const sales = useAppStore((state) => state.sales);

  return (
    <section className="rounded-lg border border-line bg-panel p-4">
      <h2 className="text-lg font-black">最近の注文</h2>
      <div className="mt-3 max-h-72 space-y-2 overflow-auto">
        {sales.slice(0, 12).map((sale) => (
          <div key={sale.id} className="rounded-md border border-line bg-ink p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-slate-600">{new Date(sale.createdAt).toLocaleTimeString("ja-JP")}</span>
              <span className="font-black text-mint">{yen(sale.totalRevenue)}</span>
            </div>
            <div className="mt-1 text-sm text-slate-600">
              {sale.bundleName ? `${sale.bundleName}：` : ""}
              {sale.items.map((item) => `${item.productName} x${item.quantity}`).join(" / ")}
            </div>
          </div>
        ))}
        {sales.length === 0 && <p className="text-sm text-slate-600">まだ注文がありません。</p>}
      </div>
    </section>
  );
}
