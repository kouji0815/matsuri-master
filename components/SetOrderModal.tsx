"use client";

import { useMemo, useState } from "react";
import type { BundleRule } from "@/types";
import { yen } from "@/lib/calculations";
import { useAppStore } from "@/store/useAppStore";

type Props = {
  bundle: BundleRule;
  onClose: () => void;
};

export default function SetOrderModal({ bundle, onClose }: Props) {
  const { products, addBundleToCart } = useAppStore();
  const [selected, setSelected] = useState<string[]>([]);
  const [drinkId, setDrinkId] = useState("");
  const [message, setMessage] = useState("");
  const allowedCategoryIds = bundle.allowedCategoryIds?.length ? bundle.allowedCategoryIds : ["cat-skewer"];
  const selectableProducts = useMemo(
    () => products.filter((product) => product.enabled && allowedCategoryIds.includes(product.category)),
    [allowedCategoryIds, products]
  );
  const drinks = useMemo(() => products.filter((product) => product.enabled && product.category === "cat-drink"), [products]);

  const countById = selected.reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  const add = (id: string) => {
    if (selected.length >= bundle.itemCount) return;
    setSelected((current) => [...current, id]);
  };

  const remove = (id: string) => {
    setSelected((current) => {
      const index = current.indexOf(id);
      if (index < 0) return current;
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  };

  const confirm = () => {
    const result = addBundleToCart(bundle, selected, drinkId || undefined);
    if (!result.ok) {
      setMessage(result.message ?? "カートに追加できませんでした");
      return;
    }
    onClose();
  };

  const ready = selected.length === bundle.itemCount && (!bundle.includesDrink || drinkId);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <div className="grid max-h-[92vh] w-full max-w-5xl gap-4 overflow-auto rounded-lg border border-line bg-white p-5 shadow-soft lg:grid-cols-[1fr_300px]">
        <section>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">{bundle.name}</h2>
              <p className="text-slate-600">
                {bundle.itemCount}点選択 / {yen(bundle.price)}
              </p>
            </div>
            <button onClick={onClose} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
              閉じる
            </button>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-3">
            {selectableProducts.map((product) => {
              const selectedCount = countById[product.id] ?? 0;
              const disabled = product.currentStock <= selectedCount;
              return (
                <button
                  key={product.id}
                  disabled={disabled || selected.length >= bundle.itemCount}
                  onClick={() => add(product.id)}
                  className="min-h-28 rounded-lg border border-line bg-white p-4 text-left text-slate-950 shadow-soft disabled:bg-slate-100 disabled:text-slate-500"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-3xl">{product.icon}</span>
                    <span className="rounded-md bg-slate-900 px-2 py-1 text-sm font-bold text-white">残 {product.currentStock - selectedCount}</span>
                  </div>
                  <div className="mt-2 text-lg font-black">{product.name}</div>
                  <div className={`mt-2 rounded-md px-2 py-1 text-center text-sm font-black ${selectedCount > 0 ? "bg-mint text-slate-950" : "bg-slate-100 text-slate-600"}`}>
                    選択 {selectedCount}
                  </div>
                </button>
              );
            })}
          </div>

          {bundle.includesDrink && (
            <div className="mt-5">
              <h3 className="font-black">ドリンク</h3>
              <div className="mt-2 grid grid-cols-2 gap-3">
                {drinks.map((product) => (
                  <button
                    key={product.id}
                    disabled={product.currentStock <= 0}
                    onClick={() => setDrinkId(product.id)}
                    className={`min-h-20 rounded-lg border p-3 text-left ${
                      drinkId === product.id ? "border-mint bg-mint text-slate-950" : "border-line bg-white text-slate-950"
                    } disabled:bg-slate-100 disabled:text-slate-500`}
                  >
                    <span className="text-2xl">{product.icon}</span>
                    <span className="ml-2 font-black">{product.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="rounded-lg border border-line bg-slate-900 p-4 text-white">
          <h3 className="text-lg font-black">選択中</h3>
          <p className="mt-1 text-sm text-slate-200">
            {selected.length} / {bundle.itemCount}
          </p>
          <div className="mt-4 space-y-2">
            {Object.entries(countById).map(([id, count]) => {
              const product = products.find((item) => item.id === id);
              if (!product) return null;
              return (
                <button key={id} onClick={() => remove(id)} className="flex w-full items-center justify-between rounded-md bg-white px-3 py-2 text-left text-slate-950">
                  <span>
                    {product.icon} {product.name}
                  </span>
                  <span className="font-black">×{count}</span>
                </button>
              );
            })}
          </div>
          {message && <p className="mt-4 rounded-md bg-danger/20 p-3 text-sm font-bold text-white">{message}</p>}
          <button
            onClick={confirm}
            disabled={!ready}
            className="mt-5 min-h-16 w-full rounded-lg bg-mint text-xl font-black text-slate-950 disabled:bg-slate-600 disabled:text-white"
          >
            会計に追加
          </button>
        </aside>
      </div>
    </div>
  );
}
