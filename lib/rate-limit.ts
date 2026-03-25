/**
 * lib/rate-limit.ts — Supabase-backed rate limiter.
 *
 * Uses a PostgreSQL counter table so limits are enforced consistently across
 * all Vercel function instances (replaces the previous single-instance
 * in-memory Map which could not share state across cold starts or pods).
 *
 * Degrades gracefully: if the admin client is unavailable (missing env var)
 * or the DB call fails, the request is allowed through rather than blocked.
 */
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Extracts a best-effort client IP from Next.js request headers.
 * Falls back to "unknown" if no IP headers are present.
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headers.get("x-real-ip") ??
    "unknown"
  );
}

/**
 * Returns true if the key has exceeded the limit within the current window.
 *
 * @param key      - Unique identifier (e.g. `"predictions:1.2.3.4"`)
 * @param limit    - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 */
export async function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  if (!admin) return false; // graceful degradation when service key is absent

  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  const { data, error } = await admin.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });

  if (error) return false; // graceful degradation on DB error
  return data === true;
}
