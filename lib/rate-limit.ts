/**
 * lib/rate-limit.ts — Lightweight in-memory rate limiter.
 *
 * Works within a single serverless function instance. Good enough for a
 * 20-100 user closed beta to catch obvious abuse (brute force, spam).
 * Does not persist across cold starts or across multiple instances.
 *
 * PRODUCTION WARNING: Replace with @upstash/ratelimit + Redis before
 * scaling beyond a single-instance deployment. On Vercel with multiple
 * concurrent function instances, each instance has its own bucket store —
 * an attacker can exceed the limit by distributing requests across instances.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const store = new Map<string, Bucket>();

// Prune expired buckets every 5 minutes to prevent unbounded memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store.entries()) {
    if (now >= bucket.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Returns true if the request should be rate-limited.
 *
 * @param key      - Unique identifier (e.g. IP address or user ID)
 * @param limit    - Max requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 */
export function isRateLimited(
  key: string,
  limit: number,
  windowMs: number
): boolean {
  const now = Date.now();
  const bucket = store.get(key);

  if (!bucket || now >= bucket.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

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
