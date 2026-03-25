-- =============================================================================
-- SUPABASE-BACKED RATE LIMITING (F1P-69)
-- Replaces the in-memory rate limiter with a durable, cross-instance solution.
-- The check_rate_limit() function atomically increments a counter per key+window
-- and returns true when the caller is over the limit.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limit_counters (
  key          text        NOT NULL,
  window_start timestamptz NOT NULL,
  count        integer     NOT NULL DEFAULT 1,
  PRIMARY KEY (key, window_start)
);

-- No row-level policies needed: only accessible via the SECURITY DEFINER
-- function below (called from server-side admin client which bypasses RLS).
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- check_rate_limit(key, limit, window_seconds)
-- Returns TRUE if the caller should be blocked (count exceeds limit).
-- Uses a fixed-window algorithm: all requests in the same window_seconds
-- bucket share a counter.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
) RETURNS boolean   -- true = rate limited (over limit)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_window_start timestamptz;
  v_count        integer;
BEGIN
  -- Compute fixed-window start: floor(now_epoch / window) * window
  v_window_start := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  -- Prune stale entries (older than 2× the window) to keep the table small
  DELETE FROM rate_limit_counters
  WHERE window_start < now() - (p_window_seconds * 2 * interval '1 second');

  -- Atomic upsert + increment; returns the post-increment count
  INSERT INTO rate_limit_counters (key, window_start, count)
  VALUES (p_key, v_window_start, 1)
  ON CONFLICT (key, window_start) DO UPDATE
    SET count = rate_limit_counters.count + 1
  RETURNING count INTO v_count;

  RETURN v_count > p_limit;
END;
$$;
