"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { customerDisplayChannelName, loadCustomerDisplay } from "@/lib/customerDisplay";
import { customerDisplayChannel } from "@/lib/customerDisplaySync";
import { getSupabaseClient } from "@/lib/supabaseClient";
import { yen } from "@/lib/calculations";
import type { CurrentCheckoutDisplay, PaymentMethod } from "@/types";

const pairedWorkspaceStorageKey = "matsuri-customer-display-workspace";
const completedResetDelayMs = 6000;

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

type ConnectionState = "connected" | "connecting" | "disconnected";

export default function CustomerDisplayPage() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [pairingChecked, setPairingChecked] = useState(false);
  const [display, setDisplay] = useState<CurrentCheckoutDisplay>(emptyDisplay);
  const [connection, setConnection] = useState<ConnectionState>("disconnected");
  const resetTimerRef = useRef<number | null>(null);

  const applyDisplay = useCallback((next: CurrentCheckoutDisplay) => {
    setDisplay(next);
    if (resetTimerRef.current) window.clearTimeout(resetTimerRef.current);
    if (next.status === "completed") {
      resetTimerRef.current = window.setTimeout(() => setDisplay(emptyDisplay), completedResetDelayMs);
    }
  }, []);

  // Read pairing state once on mount (client-only: localStorage isn't available during SSR).
  useEffect(() => {
    setWorkspaceId(localStorage.getItem(pairedWorkspaceStorageKey));
    setPairingChecked(true);
  }, []);

  // Same-device path: works immediately with zero setup (e.g. a popup window on the cashier's
  // own machine), regardless of whether this device has been QR-paired to a workspace.
  useEffect(() => {
    const saved = loadCustomerDisplay();
    if (saved) applyDisplay(saved);
    const channel = new BroadcastChannel(customerDisplayChannelName);
    channel.onmessage = (event: MessageEvent<CurrentCheckoutDisplay>) => applyDisplay(event.data);
    const onStorage = () => {
      const next = loadCustomerDisplay();
      if (next) applyDisplay(next);
    };
    window.addEventListener("storage", onStorage);
    return () => {
      channel.close();
      window.removeEventListener("storage", onStorage);
    };
  }, [applyDisplay]);

  // Cross-device path: only active once this device has scanned a workspace's pairing QR code.
  useEffect(() => {
    if (!workspaceId) return;
    const client = getSupabaseClient();
    if (!client) {
      setConnection("disconnected");
      return;
    }
    setConnection("connecting");
    const channel = client
      .channel(customerDisplayChannel(workspaceId))
      .on("broadcast", { event: "cart-update" }, ({ payload }) => applyDisplay(payload as CurrentCheckoutDisplay))
      .on("broadcast", { event: "checkout-complete" }, ({ payload }) => applyDisplay(payload as CurrentCheckoutDisplay))
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("connected");
        else if (status === "CLOSED" || status === "CHANNEL_ERROR" || status === "TIMED_OUT") setConnection("disconnected");
      });
    return () => {
      client.removeChannel(channel);
    };
  }, [workspaceId, applyDisplay]);

  const handleScanSuccess = useCallback((scannedText: string) => {
    const trimmed = scannedText.trim();
    if (!trimmed) return;
    localStorage.setItem(pairedWorkspaceStorageKey, trimmed);
    setWorkspaceId(trimmed);
  }, []);

  const unpair = () => {
    localStorage.removeItem(pairedWorkspaceStorageKey);
    setWorkspaceId(null);
    setConnection("disconnected");
  };

  if (!pairingChecked) return null;

  if (!workspaceId) {
    return <PairingScreen onScanSuccess={handleScanSuccess} />;
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-5 md:p-10">
        <header className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black md:text-5xl">Matsuri Master</h1>
            <p className="mt-2 text-lg text-slate-300 md:text-2xl">お会計表示</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-white px-4 py-3 text-xl font-black text-slate-950 md:text-3xl">
              {paymentLabel[display.paymentMethod]}
            </div>
            <ConnectionDot state={connection} />
            <button
              onClick={unpair}
              title="ペアリングを解除"
              className="rounded-full p-2 text-xs text-slate-600 opacity-40 transition hover:bg-slate-800 hover:text-slate-300 hover:opacity-100"
            >
              解除
            </button>
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

function ConnectionDot({ state }: { state: ConnectionState }) {
  const color = state === "connected" ? "bg-mint" : state === "connecting" ? "bg-amber-400" : "bg-slate-600";
  const label = state === "connected" ? "接続中" : state === "connecting" ? "接続中..." : "未接続";
  return <span title={label} className={`h-3 w-3 rounded-full ${color}`} />;
}

function PairingScreen({ onScanSuccess }: { onScanSuccess: (text: string) => void }) {
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let scanner: InstanceType<typeof import("html5-qrcode").Html5QrcodeScanner> | null = null;

    import("html5-qrcode")
      .then(({ Html5QrcodeScanner }) => {
        if (cancelled) return;
        scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: 240 }, false);
        scanner.render(
          (decodedText: string) => {
            onScanSuccessRef.current(decodedText);
            void scanner?.clear().catch(() => undefined);
          },
          () => {
            // per-frame scan miss while no QR code is in view — expected, not an error
          }
        );
      })
      .catch(() => {
        if (!cancelled) setError("カメラを起動できませんでした。カメラの使用を許可してください。");
      });

    return () => {
      cancelled = true;
      void scanner?.clear().catch(() => undefined);
    };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-black md:text-4xl">QRコードをスキャンして接続</h1>
        <p className="mt-2 text-slate-300">レジ端末の「設定」画面に表示されているQRコードを読み取ってください。</p>
        <div id="qr-reader" className="mt-6 overflow-hidden rounded-xl" />
        {error && <p className="mt-4 font-bold text-danger">{error}</p>}
      </div>
    </main>
  );
}
