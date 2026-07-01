"use client";

import { useEffect, useState } from "react";
import type { BundleRule, Product, ProductCategory } from "@/types";
import { yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";

const now = () => new Date().toISOString();

const baseSync = () => ({
  workspaceId: "",
  deviceId: "",
  syncStatus: "pending" as const,
  updatedAt: now(),
  deletedAt: null as string | null
});

const blankProduct = (category = "cat-skewer"): Product => ({
  id: `prod-${crypto.randomUUID()}`,
  name: "",
  icon: "🍢",
  category,
  price: 350,
  unitCost: 0,
  initialStock: 0,
  currentStock: 0,
  warningStock: 5,
  enabled: true,
  createdAt: now(),
  ...baseSync()
});

const blankCategory = (sortOrder: number): ProductCategory => ({
  id: `cat-${crypto.randomUUID()}`,
  name: "",
  enabled: true,
  sortOrder,
  showInHighTraffic: false,
  createdAt: now(),
  ...baseSync()
});

const blankBundle = (): BundleRule => ({
  id: `bundle-${crypto.randomUUID()}`,
  name: "",
  price: 0,
  itemCount: 1,
  allowChoice: true,
  includesDrink: false,
  allowedCategoryIds: ["cat-skewer"],
  discountAmount: 0,
  enabled: true,
  createdAt: now(),
  ...baseSync()
});

export default function ProductManager() {
  const {
    products,
    categories,
    bundles,
    saveProduct,
    deleteProduct,
    saveCategory,
    deleteCategory,
    moveCategory,
    saveBundle,
    deleteBundle
  } = useAppStore();
  const firstCategoryId = categories[0]?.id ?? "cat-skewer";
  const [editingProduct, setEditingProduct] = useState<Product>(blankProduct(firstCategoryId));
  const [editingCategory, setEditingCategory] = useState<ProductCategory>(blankCategory(100));
  const [editingBundle, setEditingBundle] = useState<BundleRule>(blankBundle());

  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name ?? "未分類";

  const submitProduct = async () => {
    if (!editingProduct.name.trim()) return;
    await saveProduct({ ...editingProduct, category: editingProduct.category || firstCategoryId });
    setEditingProduct(blankProduct(firstCategoryId));
  };

  const submitCategory = async () => {
    if (!editingCategory.name.trim()) return;
    await saveCategory({
      ...editingCategory,
      sortOrder: editingCategory.sortOrder || Math.max(0, ...categories.map((category) => category.sortOrder)) + 10
    });
    setEditingCategory(blankCategory(Math.max(0, ...categories.map((category) => category.sortOrder)) + 20));
  };

  const submitBundle = async () => {
    if (!editingBundle.name.trim()) return;
    await saveBundle({
      ...editingBundle,
      allowedCategoryIds: editingBundle.allowedCategoryIds.length > 0 ? editingBundle.allowedCategoryIds : ["cat-skewer"]
    });
    setEditingBundle(blankBundle());
  };

  const toggleBundleCategory = (categoryId: string) => {
    const exists = editingBundle.allowedCategoryIds.includes(categoryId);
    setEditingBundle({
      ...editingBundle,
      allowedCategoryIds: exists
        ? editingBundle.allowedCategoryIds.filter((id) => id !== categoryId)
        : [...editingBundle.allowedCategoryIds, categoryId]
    });
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_430px]">
      <section className="rounded-lg border border-line bg-panel p-4">
        <h2 className="text-2xl font-black">商品・在庫</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {products.map((product) => (
            <article key={product.id} className="rounded-lg border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-3xl">{product.icon}</div>
                  <h3 className="mt-2 text-xl font-black">{product.name}</h3>
                  <p className="text-sm text-slate-600">{categoryName(product.category)}</p>
                </div>
                <span className={`rounded-md px-2 py-1 text-xs font-black ${product.enabled ? "bg-mint text-slate-950" : "bg-slate-700 text-white"}`}>
                  {product.enabled ? "販売中" : "停止"}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                <Info label="価格" value={yen(product.price)} />
                <Info label="原価" value={yen(product.unitCost)} />
                <Info label="初期在庫" value={`${product.initialStock}`} />
                <Info label="現在在庫" value={`${product.currentStock}`} />
              </div>
              <div className="mt-4 flex gap-2">
                <button onClick={() => setEditingProduct(product)} className="flex-1 rounded-md bg-slate-700 py-3 font-bold text-white">
                  編集
                </button>
                <button
                  onClick={() => {
                    if (confirm("この商品を削除しますか？")) void deleteProduct(product.id);
                  }}
                  className="rounded-md bg-danger px-4 py-3 font-bold text-white"
                >
                  削除
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className="space-y-4">
        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-xl font-black">商品編集</h2>
          <div className="mt-4 grid gap-3">
            <Field label="商品名" value={editingProduct.name} onChange={(value) => setEditingProduct({ ...editingProduct, name: value })} />
            <Field label="Emoji / アイコン" value={editingProduct.icon} onChange={(value) => setEditingProduct({ ...editingProduct, icon: value })} />
            <label className="text-sm font-bold text-slate-600">
              カテゴリ
              <select value={editingProduct.category} onChange={(event) => setEditingProduct({ ...editingProduct, category: event.target.value })} className="mt-1 w-full rounded-md border border-line bg-white p-3">
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="販売価格" value={editingProduct.price} onChange={(value) => setEditingProduct({ ...editingProduct, price: value })} />
            <NumberField label="単品原価" value={editingProduct.unitCost} onChange={(value) => setEditingProduct({ ...editingProduct, unitCost: value })} />
            <NumberField label="初期在庫" value={editingProduct.initialStock} onChange={(value) => setEditingProduct({ ...editingProduct, initialStock: value })} />
            <NumberField label="現在在庫" value={editingProduct.currentStock} onChange={(value) => setEditingProduct({ ...editingProduct, currentStock: value })} />
            <NumberField label="警告在庫" value={editingProduct.warningStock} onChange={(value) => setEditingProduct({ ...editingProduct, warningStock: value })} />
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={editingProduct.enabled} onChange={(event) => setEditingProduct({ ...editingProduct, enabled: event.target.checked })} />
              有効にする
            </label>
            <button onClick={submitProduct} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
              商品を保存
            </button>
            <button onClick={() => setEditingProduct(blankProduct(firstCategoryId))} className="rounded-md bg-slate-700 py-3 font-bold text-white">
              新規入力
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-xl font-black">カテゴリ管理</h2>
          <div className="mt-3 space-y-2">
            {categories.map((category) => (
              <div key={category.id} className="rounded-md bg-white p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <strong>{category.name}</strong>
                    <div className="text-sm text-slate-600">
                      {category.enabled ? "表示中" : "停止"} / ピーク時 {category.showInHighTraffic ? "表示" : "非表示"}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => void moveCategory(category.id, "up")} className="rounded-md bg-slate-100 px-3 py-2 font-black">
                      ↑
                    </button>
                    <button onClick={() => void moveCategory(category.id, "down")} className="rounded-md bg-slate-100 px-3 py-2 font-black">
                      ↓
                    </button>
                  </div>
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEditingCategory(category)} className="flex-1 rounded-md bg-slate-700 py-2 font-bold text-white">
                    編集
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("このカテゴリを削除しますか？商品はその他カテゴリへ移動します。")) void deleteCategory(category.id);
                    }}
                    className="rounded-md bg-danger px-3 py-2 font-bold text-white"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="カテゴリ名" value={editingCategory.name} onChange={(value) => setEditingCategory({ ...editingCategory, name: value })} />
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={editingCategory.enabled} onChange={(event) => setEditingCategory({ ...editingCategory, enabled: event.target.checked })} />
              表示する
            </label>
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={editingCategory.showInHighTraffic} onChange={(event) => setEditingCategory({ ...editingCategory, showInHighTraffic: event.target.checked })} />
              ピークモードで表示
            </label>
            <button onClick={submitCategory} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
              カテゴリを保存
            </button>
            <button onClick={() => setEditingCategory(blankCategory(Math.max(0, ...categories.map((category) => category.sortOrder)) + 10))} className="rounded-md bg-slate-700 py-3 font-bold text-white">
              新規入力
            </button>
          </div>
        </section>

        <section className="rounded-lg border border-line bg-panel p-4">
          <h2 className="text-xl font-black">セット管理</h2>
          <div className="mt-3 space-y-2">
            {bundles.map((bundle) => (
              <div key={bundle.id} className="rounded-md bg-white p-3">
                <div className="flex items-center justify-between">
                  <strong>{bundle.name}</strong>
                  <span>{yen(bundle.price)}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  対象: {(bundle.allowedCategoryIds ?? ["cat-skewer"]).map(categoryName).join(" / ")}
                </p>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => setEditingBundle({ ...bundle, allowedCategoryIds: bundle.allowedCategoryIds ?? ["cat-skewer"] })} className="flex-1 rounded-md bg-slate-700 py-2 font-bold text-white">
                    編集
                  </button>
                  <button
                    onClick={() => {
                      if (confirm("このセットを削除しますか？")) void deleteBundle(bundle.id);
                    }}
                    className="rounded-md bg-danger px-3 py-2 font-bold text-white"
                  >
                    削除
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3">
            <Field label="セット名" value={editingBundle.name} onChange={(value) => setEditingBundle({ ...editingBundle, name: value })} />
            <NumberField label="セット価格" value={editingBundle.price} onChange={(value) => setEditingBundle({ ...editingBundle, price: value })} />
            <NumberField label="対象商品の点数" value={editingBundle.itemCount} onChange={(value) => setEditingBundle({ ...editingBundle, itemCount: value })} />
            <NumberField label="値引額" value={editingBundle.discountAmount} onChange={(value) => setEditingBundle({ ...editingBundle, discountAmount: value })} />
            <div className="rounded-md bg-white p-3">
              <div className="mb-2 text-sm font-bold text-slate-600">セット対象カテゴリ</div>
              <div className="grid gap-2">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-3 font-bold">
                    <input type="checkbox" checked={(editingBundle.allowedCategoryIds ?? []).includes(category.id)} onChange={() => toggleBundleCategory(category.id)} />
                    {category.name}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-slate-600">おもちゃ等は、ここで選ばない限り串セットに入りません。</p>
            </div>
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={editingBundle.allowChoice} onChange={(event) => setEditingBundle({ ...editingBundle, allowChoice: event.target.checked })} />
              商品を自由選択
            </label>
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={editingBundle.includesDrink} onChange={(event) => setEditingBundle({ ...editingBundle, includesDrink: event.target.checked })} />
              ドリンクを含む
            </label>
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={editingBundle.enabled} onChange={(event) => setEditingBundle({ ...editingBundle, enabled: event.target.checked })} />
              有効にする
            </label>
            <button onClick={submitBundle} className="min-h-14 rounded-lg bg-mint font-black text-slate-950">
              セットを保存
            </button>
            <button onClick={() => setEditingBundle(blankBundle())} className="rounded-md bg-slate-700 py-3 font-bold text-white">
              新規入力
            </button>
          </div>
        </section>
      </aside>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-panel p-2">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="font-black">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950" />
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [text, setText] = useState(value === 0 ? "" : String(value));

  useEffect(() => {
    setText(value === 0 ? "" : String(value));
  }, [value]);

  const handleChange = (raw: string) => {
    const next = raw.replace(/^0+(?=\d)/, "");
    setText(next);
    onChange(Number(next || 0));
  };

  return (
    <label className="text-sm font-bold text-slate-600">
      {label}
      <input type="number" value={text} placeholder="0" onChange={(event) => handleChange(event.target.value)} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950" />
    </label>
  );
}
