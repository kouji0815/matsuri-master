"use client";

import { useState } from "react";
import type { Product, StockReason } from "@/types";
import { useAppStore } from "@/store/useAppStore";

type Props = {
  product: Product;
  onClose: () => void;
};

const reasons: { value: StockReason; label: string }[] = [
  { value: "loss", label: "ロス" },
  { value: "gift", label: "サービス" },
  { value: "countFix", label: "棚卸修正" },
  { value: "other", label: "その他" }
];

export default function StockAdjustModal({ product, onClose }: Props) {
  const adjustStock = useAppStore((state) => state.adjustStock);
  const [custom, setCustom] = useState(0);
  const [reason, setReason] = useState<StockReason>("countFix");
  const [note, setNote] = useState("");

  const apply = async (delta: number) => {
    if (delta === 0) return;
    await adjustStock(product.id, delta, reason, note);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
      <div className="w-full max-w-xl rounded-lg border border-line bg-panel p-5 shadow-soft">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">在庫調整</h2>
            <p className="text-slate-600">
              {product.icon} {product.name} / 現在 {product.currentStock}
            </p>
          </div>
          <button onClick={onClose} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
            閉じる
          </button>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-3">
          {[-5, -1, 1, 5].map((delta) => (
            <button key={delta} onClick={() => apply(delta)} className="min-h-16 rounded-lg bg-ink text-xl font-black hover:bg-slate-800">
              {delta > 0 ? `+${delta}` : delta}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-sm font-bold text-slate-600">理由</label>
        <select value={reason} onChange={(event) => setReason(event.target.value as StockReason)} className="mt-2 w-full rounded-md border border-line bg-ink p-3">
          {reasons.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-sm font-bold text-slate-600">メモ</label>
        <input value={note} onChange={(event) => setNote(event.target.value)} className="mt-2 w-full rounded-md border border-line bg-ink p-3" placeholder="任意" />

        <div className="mt-4 flex gap-3">
          <input
            type="number"
            value={custom}
            onChange={(event) => setCustom(Number(event.target.value))}
            className="min-w-0 flex-1 rounded-md border border-line bg-ink p-3"
            placeholder="数量"
          />
          <button onClick={() => apply(custom)} className="rounded-md bg-mint px-5 font-black text-slate-950">
            反映
          </button>
        </div>
      </div>
    </div>
  );
}
