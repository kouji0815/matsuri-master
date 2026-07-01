import type { CurrentCheckoutDisplay } from "@/types";

export const customerDisplayStorageKey = "matsuri-master-current-checkout-display";
export const customerDisplayChannelName = "matsuri-master-customer-display";

export function saveCustomerDisplay(display: CurrentCheckoutDisplay) {
  if (typeof window === "undefined") return;
  localStorage.setItem(customerDisplayStorageKey, JSON.stringify(display));
  const channel = new BroadcastChannel(customerDisplayChannelName);
  channel.postMessage(display);
  channel.close();
}

export function loadCustomerDisplay(): CurrentCheckoutDisplay | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(customerDisplayStorageKey);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentCheckoutDisplay;
  } catch {
    return null;
  }
}
