import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabaseClient } from "@/lib/supabaseClient";
import type { CurrentCheckoutDisplay } from "@/types";

export function customerDisplayChannel(workspaceId: string) {
  return `customer-display:${workspaceId}`;
}

let cachedChannel: RealtimeChannel | null = null;
let cachedWorkspaceId: string | null = null;

// Reuses one subscribed channel per workspaceId so every cart click doesn't pay for a fresh
// websocket handshake — broadcast-only channels don't need ack before send(), so we fire as soon
// as subscribe() has been requested.
function getChannel(workspaceId: string): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;

  if (cachedChannel && cachedWorkspaceId === workspaceId) return cachedChannel;

  if (cachedChannel) {
    try {
      client.removeChannel(cachedChannel);
    } catch {
      // ignore: best-effort cleanup of the previous channel
    }
  }

  cachedChannel = client.channel(customerDisplayChannel(workspaceId));
  cachedWorkspaceId = workspaceId;
  cachedChannel.subscribe();
  return cachedChannel;
}

// Fire-and-forget: the customer display is a nice-to-have, never a dependency of the checkout
// flow. Any failure (no Supabase config, offline, channel error) is swallowed silently here so
// callers can invoke this with `void` and never worry about it throwing or blocking.
function send(workspaceId: string, event: string, payload: unknown) {
  if (!workspaceId) return;
  try {
    const channel = getChannel(workspaceId);
    if (!channel) return;
    channel.send({ type: "broadcast", event, payload }).catch(() => undefined);
  } catch {
    // ignore: customer display sync must never affect the cashier flow
  }
}

export function broadcastCartUpdate(workspaceId: string, display: CurrentCheckoutDisplay) {
  send(workspaceId, "cart-update", display);
}

export function broadcastCheckoutComplete(workspaceId: string, display: CurrentCheckoutDisplay) {
  send(workspaceId, "checkout-complete", display);
}

// PIN pairing: a short-lived Realtime broadcast channel keyed by a 4-digit code, used to hand a
// customer-display device the cashier's workspaceId without ever touching a camera (iOS PWAs can
// have unreliable camera-permission behavior in standalone/home-screen mode). No database table
// is involved — this is a pure ephemeral pub/sub exchange, same mechanism as the cart broadcasts
// above, just on a channel named after the PIN instead of the workspaceId.
export function pairingChannelName(pin: string) {
  return `pairing:${pin}`;
}

// Cashier side: opens a channel for this PIN and answers any "request-workspace" broadcast with
// this device's workspaceId. Callers own the returned channel's lifetime — call
// closePairingChannel when the PIN is regenerated or the settings screen unmounts, so a stale PIN
// stops being answerable (that's what makes it "expire").
export function hostPairingChannel(pin: string, workspaceId: string): RealtimeChannel | null {
  const client = getSupabaseClient();
  if (!client) return null;
  const channel = client.channel(pairingChannelName(pin));
  channel.on("broadcast", { event: "request-workspace" }, () => {
    channel.send({ type: "broadcast", event: "workspace-info", payload: { workspaceId } }).catch(() => undefined);
  });
  channel.subscribe();
  return channel;
}

export function closePairingChannel(channel: RealtimeChannel | null) {
  if (!channel) return;
  try {
    getSupabaseClient()?.removeChannel(channel);
  } catch {
    // ignore: best-effort cleanup
  }
}

// Customer-display side: asks whoever is hosting this PIN's channel for the workspaceId. Rejects
// on timeout, which covers both "wrong PIN" and "expired PIN" the same way — nobody's listening
// on that channel, so no response ever arrives. That single failure mode is enough to give the
// user a clear, honest error without distinguishing causes we can't actually tell apart.
export function requestWorkspaceViaPin(pin: string, timeoutMs = 6000): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = getSupabaseClient();
    if (!client) {
      reject(new Error("no-client"));
      return;
    }
    const channel = client.channel(pairingChannelName(pin));
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      client.removeChannel(channel);
      fn();
    };

    const timer = window.setTimeout(() => finish(() => reject(new Error("timeout"))), timeoutMs);

    channel
      .on("broadcast", { event: "workspace-info" }, ({ payload }) => {
        const workspaceId = (payload as { workspaceId?: string } | undefined)?.workspaceId;
        if (!workspaceId) return;
        finish(() => resolve(workspaceId));
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channel.send({ type: "broadcast", event: "request-workspace", payload: {} }).catch(() => undefined);
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          finish(() => reject(new Error("channel-error")));
        }
      });
  });
}
