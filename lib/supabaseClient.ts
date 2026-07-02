import { createClient } from "@supabase/supabase-js";

let cachedClient: ReturnType<typeof createClient> | null | undefined;

type SupabasePublicEnvStatus = {
  url: string | null;
  anonKey: string | null;
  configured: boolean;
  missingKeys: Array<"NEXT_PUBLIC_SUPABASE_URL" | "NEXT_PUBLIC_SUPABASE_ANON_KEY">;
};

function normalizePublicEnv(value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (normalized === "undefined" || normalized === "null") return null;
  return normalized;
}

export function getSupabasePublicEnvStatus(): SupabasePublicEnvStatus {
  const url = normalizePublicEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const anonKey = normalizePublicEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const missingKeys: SupabasePublicEnvStatus["missingKeys"] = [];

  if (!url) missingKeys.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!anonKey) missingKeys.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

  return {
    url,
    anonKey,
    configured: missingKeys.length === 0,
    missingKeys
  };
}

export function isSupabaseConfigured() {
  return getSupabasePublicEnvStatus().configured;
}

export function getSupabaseClient() {
  if (cachedClient !== undefined) return cachedClient;
  const { url, anonKey } = getSupabasePublicEnvStatus();

  if (!url || !anonKey) {
    cachedClient = null;
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return cachedClient;
}
