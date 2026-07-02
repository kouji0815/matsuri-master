"use client";

import { useEffect, useMemo, useState } from "react";
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

const blankProduct = (category: string, sortOrder: number): Product => ({
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
  sortOrder,
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

function moveItem<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function costRateLabel(unitCost: number, price: number) {
  if (price <= 0) return "-";
  return `${((unitCost / price) * 100).toFixed(1)}%`;
}

type SaveResult = { ok: boolean; message?: string };

export default function ProductManager() {
  const {
    products,
    categories,
    bundles,
    saveProduct,
    deleteProduct,
    reorderProducts,
    bulkMoveProductsCategory,
    saveCategory,
    deleteCategory,
    moveCategory,
    saveBundle,
    deleteBundle
  } = useAppStore();

  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const [productModal, setProductModal] = useState<Product | undefined>(undefined);
  const [productModalError, setProductModalError] = useState("");
  const [categoryModal, setCategoryModal] = useState<ProductCategory | undefined>(undefined);
  const [categoryModalError, setCategoryModalError] = useState("");
  const [editingBundle, setEditingBundle] = useState<BundleRule>(blankBundle());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [bulkTargetCategoryId, setBulkTargetCategoryId] = useState("");
  const [draggedId, setDraggedId] = useState("");

  useEffect(() => {
    if (!selectedCategoryId && categories.length > 0) setSelectedCategoryId(categories[0].id);
  }, [categories, selectedCategoryId]);

  const categoryName = (id: string) => categories.find((category) => category.id === id)?.name ?? "未分類";
  const productCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    return counts;
  }, [products]);

  const categoryProducts = useMemo(
    () => products.filter((product) => product.category === selectedCategoryId),
    [products, selectedCategoryId]
  );

  const openNewProduct = () => {
    setProductModalError("");
    setProductModal(blankProduct(selectedCategoryId, Math.max(0, ...categoryProducts.map((product) => product.sortOrder)) + 10));
  };

  const openEditProduct = (product: Product) => {
    setProductModalError("");
    setProductModal(product);
  };

  const submitProduct = async (product: Product): Promise<SaveResult> => {
    if (!product.name.trim()) return { ok: false, message: "商品名を入力してください。" };
    if (!product.category) return { ok: false, message: "カテゴリを選択してください。" };
    try {
      await saveProduct(product);
      setProductModal(undefined);
      setProductModalError("");
      return { ok: true };
    } catch {
      return { ok: false, message: "保存に失敗しました。もう一度お試しください。" };
    }
  };

  const openNewCategory = () => {
    setCategoryModalError("");
    setCategoryModal(blankCategory(Math.max(0, ...categories.map((category) => category.sortOrder)) + 10));
  };

  const openEditCategory = (category: ProductCategory) => {
    setCategoryModalError("");
    setCategoryModal(category);
  };

  const submitCategory = async (category: ProductCategory): Promise<SaveResult> => {
    if (!category.name.trim()) return { ok: false, message: "カテゴリ名を入力してください。" };
    try {
      await saveCategory({
        ...category,
        sortOrder: category.sortOrder || Math.max(0, ...categories.map((item) => item.sortOrder)) + 10
      });
      setCategoryModal(undefined);
      setCategoryModalError("");
      return { ok: true };
    } catch {
      return { ok: false, message: "保存に失敗しました。もう一度お試しください。" };
    }
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

  const handleDeleteCategory = async (category: ProductCategory) => {
    const count = productCountByCategory.get(category.id) ?? 0;
    const message =
      count > 0
        ? `このカテゴリを削除しますか？紐づく商品 ${count} 点は「その他」へ移動します。`
        : "このカテゴリを削除しますか？";
    if (confirm(message)) {
      await deleteCategory(category.id);
      if (selectedCategoryId === category.id) setSelectedCategoryId("");
    }
  };

  const toggleSelectionMode = () => {
    setSelectionMode((current) => !current);
    setSelectedProductIds([]);
  };

  const toggleProductSelected = (productId: string) => {
    setSelectedProductIds((current) =>
      current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]
    );
  };

  const confirmBulkMove = async () => {
    if (!bulkTargetCategoryId || selectedProductIds.length === 0) return;
    await bulkMoveProductsCategory(selectedProductIds, bulkTargetCategoryId);
    setSelectedProductIds([]);
    setSelectionMode(false);
    setBulkTargetCategoryId("");
  };

  const persistOrder = async (orderedProducts: Product[]) => {
    await reorderProducts(selectedCategoryId, orderedProducts.map((product) => product.id));
  };

  const handleDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const fromIndex = categoryProducts.findIndex((product) => product.id === draggedId);
    const toIndex = categoryProducts.findIndex((product) => product.id === targetId);
    if (fromIndex < 0 || toIndex < 0) return;
    void persistOrder(moveItem(categoryProducts, fromIndex, toIndex));
    setDraggedId("");
  };

  const moveProductStep = (productId: string, direction: "up" | "down") => {
    const index = categoryProducts.findIndex((product) => product.id === productId);
    const swapIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || swapIndex < 0 || swapIndex >= categoryProducts.length) return;
    void persistOrder(moveItem(categoryProducts, index, swapIndex));
  };

  const selectedCategory = categories.find((category) => category.id === selectedCategoryId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        {categories.map((category) => (
          <button
            key={category.id}
            onClick={() => setSelectedCategoryId(category.id)}
            className={`min-h-12 rounded-md px-4 font-bold ${
              selectedCategoryId === category.id ? "bg-mint text-slate-950" : "bg-gray-100 text-gray-700"
            }`}
          >
            {category.name}
            <span className="ml-2 text-xs opacity-70">{productCountByCategory.get(category.id) ?? 0}品</span>
          </button>
        ))}
        {categories.length === 0 && <p className="text-sm text-gray-500">カテゴリがありません。右側から追加してください。</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-black text-gray-900">{selectedCategory ? `${selectedCategory.name} の商品` : "カテゴリを選択してください"}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={toggleSelectionMode}
                className={`rounded-md px-4 py-2 font-bold ${selectionMode ? "bg-amber text-slate-950" : "bg-slate-700 text-white"}`}
              >
                {selectionMode ? "選択モード終了" : "選択モード"}
              </button>
              <button
                onClick={openNewProduct}
                disabled={!selectedCategoryId}
                className="rounded-md bg-mint px-4 py-2 font-black text-slate-950 disabled:bg-slate-300 disabled:text-slate-600"
              >
                ＋ 商品を追加
              </button>
            </div>
          </div>

          {selectionMode && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg bg-amber/15 p-3">
              <span className="font-bold text-slate-700">{selectedProductIds.length}件選択中</span>
              <select
                value={bulkTargetCategoryId}
                onChange={(event) => setBulkTargetCategoryId(event.target.value)}
                className="rounded-md border border-line bg-white p-2 text-slate-950"
              >
                <option value="">移動先カテゴリを選択</option>
                {categories
                  .filter((category) => category.id !== selectedCategoryId)
                  .map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
              </select>
              <button
                onClick={confirmBulkMove}
                disabled={selectedProductIds.length === 0 || !bulkTargetCategoryId}
                className="rounded-md bg-mint px-4 py-2 font-black text-slate-950 disabled:bg-slate-300 disabled:text-slate-600"
              >
                選択した商品を移動
              </button>
            </div>
          )}

          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {categoryProducts.map((product) => (
              <article
                key={product.id}
                draggable={!selectionMode}
                onDragStart={() => setDraggedId(product.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => handleDrop(product.id)}
                className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm ${draggedId === product.id ? "opacity-50" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2">
                    {selectionMode && (
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5"
                        checked={selectedProductIds.includes(product.id)}
                        onChange={() => toggleProductSelected(product.id)}
                      />
                    )}
                    <div>
                      <div className="text-3xl">{product.icon}</div>
                      <h3 className="mt-2 text-xl font-black text-gray-900">{product.name}</h3>
                    </div>
                  </div>
                  <span className={`rounded-md px-2 py-1 text-xs font-black ${product.enabled ? "bg-mint text-slate-950" : "bg-slate-700 text-white"}`}>
                    {product.enabled ? "販売中" : "停止"}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <Info label="価格" value={yen(product.price)} />
                  <Info label="原価" value={yen(product.unitCost)} />
                  <Info label="原価率" value={costRateLabel(product.unitCost, product.price)} />
                  <Info label="初期在庫" value={`${product.initialStock}`} />
                  <Info label="現在在庫" value={`${product.currentStock}`} />
                </div>
                {!selectionMode && (
                  <div className="mt-4 flex gap-2">
                    <button onClick={() => moveProductStep(product.id, "up")} className="rounded-md bg-gray-100 px-3 py-3 font-black text-gray-900">
                      ↑
                    </button>
                    <button onClick={() => moveProductStep(product.id, "down")} className="rounded-md bg-gray-100 px-3 py-3 font-black text-gray-900">
                      ↓
                    </button>
                    <button onClick={() => openEditProduct(product)} className="flex-1 rounded-md bg-slate-700 py-3 font-bold text-white">
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
                )}
              </article>
            ))}
            {selectedCategoryId && categoryProducts.length === 0 && (
              <p className="text-gray-500">このカテゴリに商品がありません。「＋ 商品を追加」から作成してください。</p>
            )}
          </div>
        </section>

        <aside className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xl font-black text-gray-900">カテゴリ管理</h2>
            <button onClick={openNewCategory} className="rounded-md bg-mint px-3 py-2 font-black text-slate-950">
              ＋ 新規
            </button>
          </div>
          <div className="mt-3 space-y-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className={`rounded-lg border p-3 ${
                  selectedCategoryId === category.id ? "border-mint bg-mint/15" : "border-gray-200 bg-white"
                }`}
              >
                <button onClick={() => setSelectedCategoryId(category.id)} className="w-full text-left">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-gray-900">{category.name}</strong>
                    <span className="rounded-md bg-gray-100 px-2 py-1 text-xs font-bold text-gray-600">
                      {productCountByCategory.get(category.id) ?? 0}品
                    </span>
                  </div>
                  <div className="text-xs text-gray-500">{category.enabled ? "表示中" : "停止"}</div>
                </button>
                <div className="mt-2 flex flex-wrap gap-1">
                  <button onClick={() => void moveCategory(category.id, "up")} className="rounded-md bg-gray-100 px-2 py-1 text-sm font-black text-gray-900">
                    ↑
                  </button>
                  <button onClick={() => void moveCategory(category.id, "down")} className="rounded-md bg-gray-100 px-2 py-1 text-sm font-black text-gray-900">
                    ↓
                  </button>
                  <button onClick={() => openEditCategory(category)} className="flex-1 rounded-md bg-slate-700 px-2 py-1 text-sm font-bold text-white">
                    編集
                  </button>
                  <button onClick={() => void handleDeleteCategory(category)} className="rounded-md bg-danger px-2 py-1 text-sm font-bold text-white">
                    削除
                  </button>
                </div>
              </div>
            ))}
            {categories.length === 0 && <p className="text-sm text-gray-500">カテゴリがありません。</p>}
          </div>
        </aside>
      </div>

      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-black text-gray-900">セット管理</h2>
        </div>
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_420px]">
          <div className="space-y-2">
            {bundles.map((bundle) => (
              <div key={bundle.id} className="rounded-md bg-gray-50 p-3">
                <div className="flex items-center justify-between text-gray-900">
                  <strong>{bundle.name}</strong>
                  <span>{yen(bundle.price)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">
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
          <div className="grid gap-3">
            <Field label="セット名" value={editingBundle.name} onChange={(value) => setEditingBundle({ ...editingBundle, name: value })} />
            <NumberField label="セット価格" value={editingBundle.price} onChange={(value) => setEditingBundle({ ...editingBundle, price: value })} />
            <NumberField label="対象商品の点数" value={editingBundle.itemCount} onChange={(value) => setEditingBundle({ ...editingBundle, itemCount: value })} />
            <NumberField label="値引額" value={editingBundle.discountAmount} onChange={(value) => setEditingBundle({ ...editingBundle, discountAmount: value })} />
            <div className="rounded-md bg-gray-50 p-3">
              <div className="mb-2 text-sm font-bold text-gray-600">セット対象カテゴリ</div>
              <div className="grid gap-2">
                {categories.map((category) => (
                  <label key={category.id} className="flex items-center gap-3 font-bold text-gray-900">
                    <input type="checkbox" checked={(editingBundle.allowedCategoryIds ?? []).includes(category.id)} onChange={() => toggleBundleCategory(category.id)} />
                    {category.name}
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-600">おもちゃ等は、ここで選ばない限り串セットに入りません。</p>
            </div>
            <label className="flex items-center gap-3 rounded-md bg-gray-50 p-3 font-bold text-gray-900">
              <input type="checkbox" checked={editingBundle.allowChoice} onChange={(event) => setEditingBundle({ ...editingBundle, allowChoice: event.target.checked })} />
              商品を自由選択
            </label>
            <label className="flex items-center gap-3 rounded-md bg-gray-50 p-3 font-bold text-gray-900">
              <input type="checkbox" checked={editingBundle.includesDrink} onChange={(event) => setEditingBundle({ ...editingBundle, includesDrink: event.target.checked })} />
              ドリンクを含む
            </label>
            <label className="flex items-center gap-3 rounded-md bg-gray-50 p-3 font-bold text-gray-900">
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
        </div>
      </section>

      {productModal !== undefined && (
        <ProductEditModal
          product={productModal}
          categories={categories}
          error={productModalError}
          onCancel={() => setProductModal(undefined)}
          onSave={submitProduct}
        />
      )}

      {categoryModal !== undefined && (
        <CategoryEditModal category={categoryModal} error={categoryModalError} onCancel={() => setCategoryModal(undefined)} onSave={submitCategory} />
      )}
    </div>
  );
}

function ProductEditModal({
  product,
  categories,
  error,
  onCancel,
  onSave
}: {
  product: Product;
  categories: ProductCategory[];
  error: string;
  onCancel: () => void;
  onSave: (product: Product) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState<Product>(product);
  const [localError, setLocalError] = useState(error);
  const [saving, setSaving] = useState(false);
  const isNew = !product.name;

  const handleSave = async () => {
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) setLocalError(result.message ?? "保存できませんでした。");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-lg border border-line bg-white shadow-soft">
        <div className="flex-1 overflow-y-auto p-5">
          <h2 className="text-xl font-black">{isNew ? "商品を追加" : "商品編集"}</h2>
          <div className="mt-4 grid gap-3">
            <Field label="商品名" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <Field label="Emoji / アイコン" value={draft.icon} onChange={(value) => setDraft({ ...draft, icon: value })} />
            <label className="text-sm font-bold text-slate-600">
              カテゴリ
              <select
                value={draft.category}
                onChange={(event) => setDraft({ ...draft, category: event.target.value })}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white p-3 text-gray-900 focus:border-blue-500 focus:outline-none"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <NumberField label="販売価格" value={draft.price} onChange={(value) => setDraft({ ...draft, price: value })} />
            <NumberField label="単品原価" value={draft.unitCost} onChange={(value) => setDraft({ ...draft, unitCost: value })} />
            <div className="rounded-md bg-slate-100 p-3 text-sm font-bold text-slate-700">原価率: {costRateLabel(draft.unitCost, draft.price)}</div>
            <NumberField label="初期在庫" value={draft.initialStock} onChange={(value) => setDraft({ ...draft, initialStock: value })} />
            <NumberField label="現在在庫" value={draft.currentStock} onChange={(value) => setDraft({ ...draft, currentStock: value })} />
            <NumberField label="警告在庫" value={draft.warningStock} onChange={(value) => setDraft({ ...draft, warningStock: value })} />
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              有効にする
            </label>
          </div>
          {localError && <div className="mt-3 rounded-md bg-danger/10 p-3 text-sm font-bold text-danger">{localError}</div>}
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <button onClick={onCancel} className="flex-1 rounded-md bg-slate-700 py-3 font-bold text-white">
            キャンセル
          </button>
          <button onClick={() => void handleSave()} disabled={saving} className="flex-1 rounded-lg bg-mint font-black text-slate-950 disabled:bg-slate-300">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CategoryEditModal({
  category,
  error,
  onCancel,
  onSave
}: {
  category: ProductCategory;
  error: string;
  onCancel: () => void;
  onSave: (category: ProductCategory) => Promise<SaveResult>;
}) {
  const [draft, setDraft] = useState<ProductCategory>(category);
  const [localError, setLocalError] = useState(error);
  const [saving, setSaving] = useState(false);
  const isNew = !category.name;

  const handleSave = async () => {
    setSaving(true);
    const result = await onSave(draft);
    setSaving(false);
    if (!result.ok) setLocalError(result.message ?? "保存できませんでした。");
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-lg border border-line bg-white shadow-soft">
        <div className="flex-1 overflow-y-auto p-5">
          <h2 className="text-xl font-black">{isNew ? "新しいカテゴリ" : "カテゴリ編集"}</h2>
          <div className="mt-4 grid gap-3">
            <Field label="カテゴリ名" value={draft.name} onChange={(value) => setDraft({ ...draft, name: value })} />
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
              表示する
            </label>
            <label className="flex items-center gap-3 rounded-md bg-white p-3 font-bold">
              <input type="checkbox" checked={draft.showInHighTraffic} onChange={(event) => setDraft({ ...draft, showInHighTraffic: event.target.checked })} />
              ピークモードで表示
            </label>
          </div>
          {localError && <div className="mt-3 rounded-md bg-danger/10 p-3 text-sm font-bold text-danger">{localError}</div>}
        </div>
        <div className="flex gap-2 border-t border-line p-4">
          <button onClick={onCancel} className="flex-1 rounded-md bg-slate-700 py-3 font-bold text-white">
            キャンセル
          </button>
          <button onClick={() => void handleSave()} disabled={saving} className="flex-1 rounded-lg bg-mint font-black text-slate-950 disabled:bg-slate-300">
            {saving ? "保存中..." : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-gray-50 p-2">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="font-black text-gray-900">{value}</div>
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
