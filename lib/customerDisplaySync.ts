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
