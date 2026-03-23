import { createClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client authenticated with the service_role key.
 * This bypasses Row Level Security entirely.
 *
 * ONLY use this in server-side admin API routes.
 * NEVER expose the service_role key to the browser.
 *
 * Returns null if the env var is not set — callers must handle this.
 */
export function createSupabaseAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
