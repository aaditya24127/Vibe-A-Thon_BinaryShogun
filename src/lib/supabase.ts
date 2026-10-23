import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = Boolean(url && key);

let client: SupabaseClient | null = null;

/** The only place a Supabase client is created. Returns null when the environment variables are not set. */
export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!client) client = createClient(url, key, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 5 } } });
  return client;
}
