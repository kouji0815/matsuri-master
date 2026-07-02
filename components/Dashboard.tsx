"use client";

import { useEffect, useMemo, useState } from "react";
import CheckoutModal from "@/components/CheckoutModal";
import ProductButton from "@/components/ProductButton";
import SalesHistory from "@/components/SalesHistory";
import SetOrderModal from "@/components/SetOrderModal";
import StockAdjustModal from "@/components/StockAdjustModal";
import { downloadTextFile, salesToCsv } from "@/lib/csv";
import { getLowStockProducts, getRecentRevenue, getSaleSummary, getTopProducts, yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";
import type { BundleRule, Product, Session } from "@/types";

const today = () => new Date().toISOString().slice(0, 10);

function makeQuickSession(targetSales: number): Session {
  return {
    id: `session-${crypto.randomUUID()}`,
    name: "本日の営業",
    date: today(),
    location: "",
    targetSales,
    status: "planned",
    createdAt: new Date().toISOString(),
    workspaceId: "",
    deviceId: "",
    updatedAt: new Date().toISOString(),
    syncStatus: "pending",
    deletedAt: null
  };
}

export default function Dashboard() {
  const {
    products,
    categories,
    bundles,
    sales,
    costs,
    activeSession,
    selectedSession,
    settings,
    cartItems,
    addProductToCart,
    removeCartItem,
    clearCart,
    saveSession,
    startSession,
    undoLastSale,
    closeActiveSession,
    setMode
  } = useAppStore();
  const [bundle, setBundle] = useState<BundleRule | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [flashProductId, setFlashProductId] = useState("");
  const [quickSession, setQuickSession] = useState<Session>(() => selectedSession ?? makeQuickSession(settings.defaultTargetSales));

  useEffect(() => {
    if (!activeSession && selectedSession) setQuickSession(selectedSession);
  }, [activeSession, selectedSession]);

  const summary = useMemo(() => getSaleSummary(sales, costs), [sales, costs]);
  const topProducts = useMemo(() => getTopProducts(sales), [sales]);
  const lowStock = useMemo(() => getLowStockProducts(products), [products]);
  const recentRevenue = useMemo(() => getRecentRevenue(sales), [sales]);
  const visibleCategories = categories.filter((category) => category.enabled && (!settings.highTrafficMode || category.showInHighTraffic));
  const visibleCategoryIds = new Set(visibleCategories.map((category) => category.id));
  const enabledProducts = products.filter((product) => product.enabled && visibleCategoryIds.has(product.category));
  const target = activeSession?.targetSales ?? selectedSession?.targetSales ?? settings.defaultTargetSales;
  const progress = Math.min(100, target > 0 ? (summary.revenue / target) * 100 : 0);
  const cartSubtotal = cartItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const selectedCounts = cartItems.reduce<Record<string, number>>((acc, cartItem) => {
    for (const item of cartItem.items) acc[item.productId] = (acc[item.productId] ?? 0) + item.quantity;
    return acc;
  }, {});

  const startQuickSession = async () => {
    const sessionToStart = {
      ...quickSession,
      name: quickSession.name.trim() || "本日の営業",
      date: quickSession.date || today(),
      targetSales: quickSession.targetSales || settings.defaultTargetSales
    };
    await saveSession(sessionToStart);
    const result = await startSession(sessionToStart.id);
    setMessage(result.ok ? "営業を開始しました" : result.message ?? "営業を開始できませんでした");
  };

  const handleAddProduct = (productId: string) => {
    const product = products.find((item) => item.id === productId);
    const result = addProductToCart(productId);
    if (!result.ok) {
      setMessage(result.message ?? "カートに追加できませんでした");
      return;
    }
    setFlashProductId(productId);
    setMessage(`${product?.name ?? "商品"}を会計に追加しました`);
    window.setTimeout(() => setFlashProductId(""), 220);
    window.setTimeout(() => setMessage(""), 900);
  };

  const exportCsv = () => {
    downloadTextFile(`matsuri-sales-${new Date().toISOString().slice(0, 10)}.csv`, salesToCsv(sales, selectedSession));
  };

  const openCustomerDisplay = () => {
    window.open("/customer-display", "matsuri-customer-display", "width=520,height=900");
  };

  return (
    <div className="grid flex-1 gap-4 lg:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        {!activeSession && (
          <section className="rounded-lg border-2 border-mint bg-mint/10 p-4 shadow-soft">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end">
              <div className="grid flex-1 gap-3 md:grid-cols-4">
                <Field label="営業名" value={quickSession.name} onChange={(value) => setQuickSession({ ...quickSession, name: value })} />
                <Field label="日付" type="date" value={quickSession.date} onChange={(value) => setQuickSession({ ...quickSession, date: value })} />
                <Field label="場所" value={quickSession.location} onChange={(value) => setQuickSession({ ...quickSession, location: value })} placeholder="任意" />
                <Field label="売上目標" type="number" value={quickSession.targetSales} onChange={(value) => setQuickSession({ ...quickSession, targetSales: Number(value) })} />
              </div>
              <button onClick={startQuickSession} className="min-h-16 rounded-lg bg-mint px-8 text-xl font-black text-slate-950 active:scale-95">
                今日の営業を開始
              </button>
            </div>
          </section>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="売上" value={yen(summary.revenue)} tone="mint" />
          <Metric label="販売数" value={`${summary.quantity}点`} />
          <Metric label="粗利益" value={yen(summary.grossProfit)} />
          <Metric label="純利益" value={yen(summary.netProfit)} />
          <Metric label="直近30分" value={yen(recentRevenue)} />
        </div>

        <div className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black">{activeSession ? activeSession.name : "営業未開始"}</h2>
              <p className="text-sm text-slate-500">目標達成率 {progress.toFixed(1)}%</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={openCustomerDisplay} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
                顧客表示を開く
              </button>
              <button onClick={exportCsv} className="rounded-md bg-slate-700 px-4 py-3 font-bold text-white">
                CSV
              </button>
              <button onClick={() => void undoLastSale()} className="rounded-md bg-amber px-4 py-3 font-black text-slate-950">
                取消
              </button>
              <button onClick={() => void closeActiveSession()} disabled={!activeSession} className="rounded-md bg-danger px-4 py-3 font-black text-white disabled:bg-slate-700 disabled:text-white">
                収店
              </button>
            </div>
          </div>
          <div className="mt-3 h-3 rounded-full bg-white">
            <div className="h-3 rounded-full bg-mint" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {message && <div className="rounded-md border border-mint bg-mint/15 p-3 font-bold text-emerald-700">{message}</div>}

        <div className="space-y-6">
          {visibleCategories.map((category) => {
            const categoryProducts = enabledProducts.filter((product) => product.category === category.id);
            if (categoryProducts.length === 0) return null;
            return (
              <section key={category.id}>
                <div className="mb-3 flex items-center gap-3">
                  <h2 className="text-2xl font-black">【{category.name}】</h2>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-sm font-bold text-slate-600">{categoryProducts.length}品</span>
                </div>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {categoryProducts.map((product) => (
                    <ProductButton
                      key={product.id}
                      product={product}
                      onSell={handleAddProduct}
                      onLongPress={setStockProduct}
                      activeFlash={flashProductId === product.id}
                      selectedQuantity={selectedCounts[product.id] ?? 0}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border-2 border-mint bg-white p-4 shadow-soft">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-black">現在の会計</h2>
              <p className="text-sm text-slate-600">{cartItems.length}件の商品</p>
            </div>
            <div className="text-right">
              <div className="text-sm font-bold text-slate-600">合計</div>
              <div className="text-3xl font-black text-emerald-700">{yen(cartSubtotal)}</div>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {cartItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{item.name}</div>
                    <div className="text-sm text-slate-600">{item.description}</div>
                    <div className="mt-1 text-sm font-bold">数量 {item.quantity}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black">{yen(item.totalPrice)}</div>
                    <button onClick={() => removeCartItem(item.id)} className="mt-2 rounded-md bg-danger px-3 py-1 text-sm font-bold text-white">
                      削除
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {cartItems.length === 0 && <p className="rounded-lg bg-panel p-4 text-center text-slate-600">商品を選択してください。</p>}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button onClick={clearCart} disabled={cartItems.length === 0} className="min-h-14 rounded-lg bg-slate-700 font-bold text-white disabled:bg-slate-300 disabled:text-slate-600">
              会計をクリア
            </button>
            <button onClick={() => setCheckoutOpen(true)} disabled={cartItems.length === 0} className="min-h-14 rounded-lg bg-mint text-xl font-black text-slate-950 disabled:bg-slate-300 disabled:text-slate-600">
              会計する
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black">セット注文</h2>
            <button onClick={() => setMode("menu")} className="text-sm font-bold text-emerald-700">
              編集
            </button>
          </div>
          <div className="mt-3 grid gap-2">
            {bundles
              .filter((item) => item.enabled)
              .map((item) => (
                <button key={item.id} onClick={() => setBundle(item)} className="rounded-lg border border-line bg-white p-4 text-left hover:border-mint active:scale-[0.98]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-black">{item.name}</span>
                    <span className="font-black text-emerald-700">{yen(item.price)}</span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    対象 {item.itemCount}点{item.includesDrink ? " + ドリンク" : ""} / 値引 {yen(item.discountAmount)}
                  </p>
                </button>
              ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-lg font-black">在庫注意</h2>
          <div className="mt-3 space-y-2">
            {lowStock.slice(0, 5).map((product) => (
              <div key={product.id} className="flex items-center justify-between rounded-md bg-amber/15 px-3 py-2 text-amber">
                <span>{product.name}</span>
                <strong>残 {product.currentStock}</strong>
              </div>
            ))}
            {lowStock.length === 0 && <p className="text-sm text-slate-500">注意在庫はありません。</p>}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-lg font-black">売れ筋 TOP3</h2>
          <div className="mt-3 space-y-2">
            {topProducts.map((product, index) => (
              <div key={product.name} className="flex items-center justify-between rounded-md bg-white px-3 py-2">
                <span>
                  {index + 1}. {product.name}
                </span>
                <strong>{product.quantity}点</strong>
              </div>
            ))}
            {topProducts.length === 0 && <p className="text-sm text-slate-500">まだデータがありません。</p>}
          </div>
        </section>

        <SalesHistory />
      </aside>

      {checkoutOpen && <CheckoutModal onClose={() => setCheckoutOpen(false)} onCompleted={() => setCheckoutOpen(false)} />}
      {bundle && <SetOrderModal bundle={bundle} onClose={() => setBundle(null)} />}
      {stockProduct && <StockAdjustModal product={stockProduct} onClose={() => setStockProduct(null)} />}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  placeholder
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  const displayValue = type === "number" && value === 0 ? "" : value;
  const handleChange = (raw: string) => {
    onChange(type === "number" ? raw.replace(/^0+(?=\d)/, "") : raw);
  };

  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input value={displayValue} type={type} onChange={(event) => handleChange(event.target.value)} placeholder={placeholder ?? (type === "number" ? "0" : undefined)} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950" />
    </label>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "mint" }) {
  return (
    <div className="rounded-lg border border-line bg-panel p-4">
      <div className="text-sm font-bold text-slate-500">{label}</div>
      <div className={`mt-1 text-2xl font-black ${tone === "mint" ? "text-emerald-700" : "text-slate-950"}`}>{value}</div>
    </div>
  );
}
