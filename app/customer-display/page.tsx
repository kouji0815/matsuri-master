"use client";

import { useEffect, useState } from "react";
import { customerDisplayChannelName, loadCustomerDisplay } from "@/lib/customerDisplay";
import { yen } from "@/lib/calculations";
import type { CurrentCheckoutDisplay, PaymentMethod } from "@/types";

const paymentLabel: Record<PaymentMethod, string> = {
  cash: "現金",
  paypay: "PayPay",
  creditCard: "クレジットカード",
  other: "その他"
};

const emptyDisplay: CurrentCheckoutDisplay = {
  status: "editing",
  updatedAt: new Date().toISOString(),
  items: [],
  subtotal: 0,
  discountAmount: 0,
  finalTotal: 0,
  receivedAmount: 0,
  changeAmount: 0,
  paymentMethod: "cash"
};

export default function CustomerDisplayPage() {
  const [display, setDisplay] = useState<CurrentCheckoutDisplay>(emptyDisplay);

  useEffect(() => {
    const saved = loadCustomerDisplay();
    if (saved) setDisplay(saved);

    const channel = new BroadcastChannel(customerDisplayChannelName);
    channel.onmessage = (event: MessageEvent<CurrentCheckoutDisplay>) => setDisplay(event.data);
    const onStorage = () => {
      const next = loadCustomerDisplay();
      if (next) setDisplay(next);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-5 md:p-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black md:text-5xl">Matsuri Master</h1>
            <p className="mt-2 text-lg text-slate-300 md:text-2xl">お会計表示</p>
          </div>
          <div className="rounded-lg bg-white px-4 py-3 text-xl font-black text-slate-950 md:text-3xl">
            {paymentLabel[display.paymentMethod]}
          </div>
        </header>

        {display.status === "completed" ? (
          <section className="grid flex-1 place-items-center text-center">
            <div>
              <div className="text-5xl font-black md:text-8xl">ありがとうございました</div>
              <div className="mt-8 text-4xl font-black text-mint md:text-7xl">{yen(display.finalTotal)}</div>
              {display.paymentMethod === "cash" && <div className="mt-4 text-2xl text-slate-200 md:text-4xl">お釣り {yen(display.changeAmount)}</div>}
            </div>
          </section>
        ) : (
          <>
            <section className="flex-1 rounded-lg border border-slate-700 bg-slate-900 p-4 md:p-6">
              <h2 className="text-2xl font-black md:text-4xl">商品明細</h2>
              <div className="mt-5 space-y-3">
                {display.items.map((item, index) => (
                  <div key={`${item.name}-${index}`} className="rounded-lg bg-slate-800 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-2xl font-black md:text-4xl">{item.name}</div>
                        <div className="mt-1 text-base text-slate-300 md:text-xl">{item.description}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-2xl font-black text-mint md:text-4xl">{yen(item.totalPrice)}</div>
                        <div className="mt-1 text-lg text-slate-300 md:text-2xl">数量 {item.quantity}</div>
                      </div>
                    </div>
                  </div>
                ))}
                {display.items.length === 0 && <div className="rounded-lg bg-slate-800 p-8 text-center text-2xl text-slate-300 md:text-4xl">商品を選択中です</div>}
              </div>
            </section>

            <section className="rounded-lg bg-white p-5 text-slate-950 md:p-8">
              <div className="grid gap-4 md:grid-cols-4">
                <Amount label="小計" value={yen(display.subtotal)} />
                <Amount label="割引" value={yen(display.discountAmount)} />
                <Amount label="お支払い金額" value={yen(display.finalTotal)} strong />
                <Amount label="お釣り" value={yen(display.changeAmount)} />
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

function Amount({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <div className="text-lg font-bold text-slate-600 md:text-2xl">{label}</div>
      <div className={`${strong ? "text-4xl md:text-6xl" : "text-3xl md:text-5xl"} mt-1 font-black`}>{value}</div>
    </div>
  );
}
