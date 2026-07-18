"use client";

import { useMemo, useState } from "react";
import { getSkewerAutoDiscount, yen } from "@/lib/calculations";
import { playCheckoutSound } from "@/lib/sound";
import { useAppStore } from "@/store/useAppStore";
import type { PaymentMethod } from "@/types";

const paymentOptions: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "現金" },
  { value: "paypay", label: "PayPay" },
  { value: "other", label: "その他" }
];

const quickDiscountReasons = ["フォロワー", "1000円以上のおもちゃサービス"];

type Props = {
  onClose: () => void;
  onCompleted: () => void;
};

export default function CheckoutModal({ onClose, onCompleted }: Props) {
  const { cartItems, checkoutCart, settings } = useAppStore();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [receivedAmount, setReceivedAmount] = useState("");
  const [message, setMessage] = useState("");

  const subtotal = useMemo(() => cartItems.reduce((sum, item) => sum + item.totalPrice, 0), [cartItems]);
  const skewerAutoDiscount = useMemo(() => getSkewerAutoDiscount(cartItems), [cartItems]);
  const manualDiscount = Math.max(0, Number(discountAmount || 0));
  const totalDiscount = Math.min(skewerAutoDiscount + manualDiscount, subtotal);
  const finalTotal = Math.max(0, subtotal - totalDiscount);
  const receivedAmountNumber = Number(receivedAmount || 0);
  const changeAmount = paymentMethod === "cash" ? Math.max(0, receivedAmountNumber - finalTotal) : 0;

  const confirm = async () => {
    const result = await checkoutCart({
      paymentMethod,
      discountAmount: totalDiscount,
      discountReason,
      receivedAmount: paymentMethod === "cash" ? receivedAmountNumber : finalTotal
    });
    if (!result.ok) {
      setMessage(result.message ?? "会計できませんでした");
      return;
    }
    playCheckoutSound(settings.soundEnabled);
    onCompleted();
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/75 p-4">
      <div className="grid max-h-[92vh] w-full max-w-5xl gap-4 overflow-auto rounded-lg border border-line bg-white p-5 shadow-soft lg:grid-cols-[1fr_360px]">
        <section>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-2xl font-black">会計確認</h2>
              <p className="text-sm text-slate-600">内容を確認してから結算します。</p>
            </div>
            <button onClick={onClose} className="rounded-md bg-slate-700 px-4 py-2 font-bold text-white">
              キャンセル
            </button>
          </div>

          <div className="mt-4 space-y-2">
            {cartItems.map((item) => (
              <div key={item.id} className="rounded-lg border border-line bg-panel p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-black">{item.name}</div>
                    <div className="text-sm text-slate-600">{item.description}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-black">{yen(item.totalPrice)}</div>
                    <div className="text-sm text-slate-600">数量 {item.quantity}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="rounded-lg border border-line bg-panel p-4">
          <div className="space-y-3">
            <SummaryLine label="小計" value={yen(subtotal)} />
            {skewerAutoDiscount > 0 && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-mint/15 px-3 py-2 text-sm font-bold text-emerald-700">
                <span>串セット割引</span>
                <span>-{yen(skewerAutoDiscount)}</span>
              </div>
            )}
            <label className="block text-sm font-bold text-slate-600">
              割引金額
              <input
                type="number"
                value={discountAmount}
                placeholder="0"
                onChange={(event) => setDiscountAmount(event.target.value.replace(/^0+(?=\d)/, ""))}
                className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950"
              />
            </label>
            <label className="block text-sm font-bold text-slate-600">
              割引理由
              <input
                list="discount-reason-options"
                value={discountReason}
                placeholder="よく使う理由から選択..."
                onChange={(event) => setDiscountReason(event.target.value)}
                className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950"
              />
              <datalist id="discount-reason-options">
                {quickDiscountReasons.map((reason) => (
                  <option key={reason} value={reason} />
                ))}
              </datalist>
            </label>
            <label className="block text-sm font-bold text-slate-600">
              支払い方法
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950">
                {paymentOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`block text-sm font-bold ${paymentMethod === "cash" ? "text-slate-600" : "text-slate-400"}`}>
              お預かり金額
              <input
                type="number"
                value={paymentMethod === "cash" ? receivedAmount : String(finalTotal)}
                placeholder="0"
                onChange={(event) => setReceivedAmount(event.target.value.replace(/^0+(?=\d)/, ""))}
                disabled={paymentMethod !== "cash"}
                className="mt-1 w-full rounded-md border border-line bg-white p-3 text-slate-950 disabled:bg-slate-100 disabled:text-slate-500"
              />
            </label>
            <div className="rounded-lg bg-white p-3">
              <SummaryLine label="お支払い金額" value={yen(finalTotal)} strong />
              <SummaryLine label="お釣り" value={yen(changeAmount)} strong={paymentMethod === "cash"} />
            </div>
            {message && <div className="rounded-md bg-danger/10 p-3 text-sm font-bold text-danger">{message}</div>}
            <button onClick={confirm} className="min-h-16 w-full rounded-lg bg-mint text-xl font-black text-slate-950 active:scale-95">
              確認して会計する
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SummaryLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-slate-600">{label}</span>
      <span className={strong ? "text-2xl font-black text-slate-950" : "font-black"}>{value}</span>
    </div>
  );
}
