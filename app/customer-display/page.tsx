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

type ScreenState = "idle" | "starting" | "scanning" | "success" | "camera-error";

// A workspaceId is always generated as `workspace-${crypto.randomUUID()}` (see SettingsPanel.tsx)
// — a lightweight shape check here is enough to tell "wrong/garbage QR code" apart from "camera
// briefly saw noise", without being so strict that a future id format change breaks scanning.
const workspaceIdPattern = /^workspace-[a-zA-Z0-9-]{8,}$/;

function PairingScreen({ onScanSuccess }: { onScanSuccess: (text: string) => void }) {
  const onScanSuccessRef = useRef(onScanSuccess);
  onScanSuccessRef.current = onScanSuccess;
  const scannerRef = useRef<InstanceType<typeof import("html5-qrcode").Html5Qrcode> | null>(null);
  const invalidQrTimerRef = useRef<number | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>("idle");
  const [invalidQrMessage, setInvalidQrMessage] = useState("");

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      if (scanner.isScanning) await scanner.stop();
      scanner.clear();
    } catch {
      // ignore: best-effort cleanup, the camera stream is being torn down regardless
    }
  }, []);

  useEffect(() => {
    return () => {
      void stopScanner();
      if (invalidQrTimerRef.current) window.clearTimeout(invalidQrTimerRef.current);
    };
  }, [stopScanner]);

  // Uses the low-level Html5Qrcode class (not Html5QrcodeScanner) so pressing "スキャン" goes
  // straight into an active back-camera feed — no library-drawn "Request Camera Permissions" /
  // "Scan an Image File" buttons in between. The only unavoidable interruption is the browser's
  // own native camera-permission prompt.
  const startScanning = async () => {
    setScreenState("starting");
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const scanner = new Html5Qrcode("qr-reader");
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: 240 },
        (decodedText: string) => {
          const trimmed = decodedText.trim();
          if (!workspaceIdPattern.test(trimmed)) {
            if (invalidQrTimerRef.current) window.clearTimeout(invalidQrTimerRef.current);
            setInvalidQrMessage("無効なQRコードです。レジ用iPadの正しいQRコードを読み取ってください。");
            invalidQrTimerRef.current = window.setTimeout(() => setInvalidQrMessage(""), 3000);
            return;
          }
          setScreenState("success");
          void stopScanner();
          window.setTimeout(() => onScanSuccessRef.current(trimmed), 900);
        },
        () => {
          // per-frame scan miss while no QR code is in view — expected, not an error
        }
      );
      setScreenState("scanning");
    } catch {
      setScreenState("camera-error");
    }
  };

  return (
    <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white">
      <div className="w-full max-w-md text-center">
        <h1 className="text-3xl font-black md:text-4xl">客用ディスプレイ</h1>

        {screenState === "idle" && (
          <>
            <p className="mt-3 text-slate-300">レジ用iPadとペアリングして、お会計内容をリアルタイムに表示します。</p>
            <button
              onClick={() => void startScanning()}
              className="mt-8 min-h-16 w-full rounded-lg bg-mint px-8 text-xl font-black text-slate-950 active:scale-95"
            >
              スキャン
            </button>
          </>
        )}

        {screenState === "starting" && <p className="mt-8 text-lg text-slate-300">カメラを起動しています...</p>}

        {(screenState === "scanning" || screenState === "success") && (
          <>
            <p className="mt-3 text-slate-300">レジ用iPadの設定画面に表示されているQRコードを映してください。</p>
            <div id="qr-reader" className="mx-auto mt-6 overflow-hidden rounded-xl" />
            {invalidQrMessage && <p className="mt-4 font-bold text-danger">{invalidQrMessage}</p>}
            {screenState === "success" && <div className="mt-4 rounded-lg bg-mint/20 p-4 text-xl font-black text-mint">接続しました</div>}
          </>
        )}

        {screenState === "camera-error" && (
          <>
            <p className="mt-8 font-bold text-danger">カメラを起動できませんでした。カメラの使用を許可してから、もう一度お試しください。</p>
            <button
              onClick={() => void startScanning()}
              className="mt-6 min-h-14 w-full rounded-lg bg-mint px-8 font-black text-slate-950 active:scale-95"
            >
              再試行
            </button>
          </>
        )}
      </div>
    </main>
  );
}
