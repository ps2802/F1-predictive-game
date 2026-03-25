-- =============================================================================
-- MIGRATION: freeze_pick_popularity, transactions INSERT RLS, atomic member_count
-- =============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 1: freeze_pick_popularity RPC
--
-- Called by the cron lock job and manual admin lock to snapshot pick counts at
-- the moment a race locks. Settlement uses these snapshots as the canonical
-- difficulty multiplier source instead of computing live (which is non-
-- deterministic if called multiple times after lock).
--
-- Safe to re-run: ON CONFLICT DO UPDATE overwrites with current counts.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.freeze_pick_popularity(p_race_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total integer;
BEGIN
  SELECT count(*)
  INTO v_total
  FROM public.predictions
  WHERE race_id = p_race_id
    AND status = 'active';

  -- Nothing to snapshot if nobody has predicted yet
  IF v_total = 0 THEN
    RETURN;
  END IF;

  INSERT INTO public.pick_popularity_snapshots
    (race_id, question_id, option_id, pick_count, total_entries, popularity_percent)
  SELECT
    p.race_id,
    pa.question_id,
    pa.option_id,
    count(*)::integer        AS pick_count,
    v_total                  AS total_entries,
    (count(*)::numeric / v_total)::numeric AS popularity_percent
  FROM public.prediction_answers pa
  JOIN public.predictions p ON p.id = pa.prediction_id
  WHERE p.race_id = p_race_id
    AND p.status = 'active'
  GROUP BY p.race_id, pa.question_id, pa.option_id
  ON CONFLICT (race_id, question_id, option_id) DO UPDATE
    SET pick_count         = EXCLUDED.pick_count,
        total_entries      = EXCLUDED.total_entries,
        popularity_percent = EXCLUDED.popularity_percent,
        snapshot_time      = now();
END;
$$;

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 2: transactions INSERT policy for authenticated users
--
-- The existing tx_select_own policy allows users to read their own rows, but
-- there was no INSERT policy. The leagues/join and predictions/v2 routes use
-- the anon Supabase client (user session), so inserts were silently rejected
-- by RLS.
-- ────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "tx_insert_own" ON public.transactions;
CREATE POLICY "tx_insert_own" ON public.transactions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────────────────────
-- FIX 3: Atomic member_count increment
--
-- The join route was doing a read-then-write on member_count (race condition:
-- two simultaneous joins could both read member_count=5, both write 6, losing
-- one increment). This RPC does it atomically.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_member_count(p_league_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
AS $$
  UPDATE public.leagues
  SET member_count = member_count + 1
  WHERE id = p_league_id;
$$;
