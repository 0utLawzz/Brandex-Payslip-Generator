import { createClient } from "@supabase/supabase-js";

// Server-only Supabase admin client. This module is never imported by client bundles.
// Reads/writes happen with service_role privileges so the single-user app does not require auth.
export function getDb() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
