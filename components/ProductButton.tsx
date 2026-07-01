"use client";

import { useRef } from "react";
import type { Product } from "@/types";
import { yen } from "@/lib/calculations";

type Props = {
  product: Product;
  onSell: (productId: string) => void;
  onLongPress: (product: Product) => void;
  activeFlash?: boolean;
};

export default function ProductButton({ product, onSell, onLongPress, activeFlash }: Props) {
  const timerRef = useRef<number | null>(null);
  const soldOut = product.currentStock <= 0;
  const warning = product.currentStock > 0 && product.currentStock <= product.warningStock;

  const startPress = () => {
    timerRef.current = window.setTimeout(() => onLongPress(product), 550);
  };

  const cancelPress = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  return (
    <button
      disabled={soldOut || !product.enabled}
      onClick={() => onSell(product.id)}
      onPointerDown={startPress}
      onPointerUp={cancelPress}
      onPointerLeave={cancelPress}
      className={`min-h-32 rounded-lg border p-4 text-left shadow-soft transition duration-150 active:scale-95 ${
        soldOut
          ? "border-slate-200 bg-slate-100 text-slate-500"
          : warning
            ? "border-amber bg-amber/15 text-slate-950"
            : "border-line bg-panel text-slate-950 hover:border-mint"
      } ${activeFlash ? "scale-[1.03] border-mint bg-mint/25 ring-4 ring-mint" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-4xl">{product.icon}</span>
        <span className={`rounded-md px-2 py-1 text-xs font-black ${soldOut ? "bg-slate-800 text-white" : warning ? "bg-amber text-slate-950" : "bg-slate-900 text-white"}`}>
          {soldOut ? "売切" : `残 ${product.currentStock}`}
        </span>
      </div>
      <div className="mt-3 text-xl font-black">{product.name}</div>
      <div className="mt-1 text-lg font-bold text-slate-600">{yen(product.price)}</div>
    </button>
  );
}
