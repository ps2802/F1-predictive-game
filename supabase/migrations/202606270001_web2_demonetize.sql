-- =============================================================================
-- WEB2 DE-MONETIZATION
-- Gridlock is now a free, friends-only F1 prediction game. This migration
-- removes the entire crypto / USDC / wallet / paid-league / prize-payout
-- subsystem and replaces the money-coupled prediction RPC + signup trigger
-- with money-free equivalents. It also adds races.lock_time_utc — the single
-- weekend lock anchor (start of the first competitive session).
--
-- Safe to run on a database that has already partially diverged: every drop is
-- IF EXISTS and functions are dropped by name across all overloads.
-- =============================================================================

-- 1. Drop money RPCs (all overloads, regardless of signature). -----------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT format(
      'DROP FUNCTION IF EXISTS public.%I(%s) CASCADE;',
      p.proname,
      pg_get_function_identity_arguments(p.oid)
    ) AS stmt
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'create_league_with_stake',
        'join_league_with_stake',
        'top_up_league_stake',
        'apply_league_settlement',
        'record_normalized_deposit',
        'atomic_deduct_balance',
        'credit_user_balance',
        'credit_fee_wallet',
        'increment_prize_pool',
        'increment_member_count',
        'record_prediction_submission'
      )
  LOOP
    EXECUTE r.stmt;
  END LOOP;
END $$;

-- 2. Money-free prediction submission. ----------------------------------------
-- Upserts the single prediction sheet per (user, race), replaces its answers,
-- and appends an immutable version snapshot (settlement reads the latest
-- version). No balance, no edit fee, no fee wallet. Every sheet is active.
CREATE OR REPLACE FUNCTION public.record_prediction_submission(
  p_user_id uuid,
  p_race_id text,
  p_answers_json jsonb,
  p_answer_rows jsonb,
  p_status public.prediction_status DEFAULT 'active'
)
RETURNS TABLE (
  prediction_id uuid,
  version_number integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prediction_id uuid;
  v_next_version_number integer := 1;
BEGIN
  SELECT id
  INTO v_prediction_id
  FROM public.predictions
  WHERE user_id = p_user_id
    AND race_id = p_race_id
  FOR UPDATE;

  IF v_prediction_id IS NULL THEN
    INSERT INTO public.predictions (user_id, race_id, status)
    VALUES (p_user_id, p_race_id, p_status)
    RETURNING id INTO v_prediction_id;
  ELSE
    UPDATE public.predictions
    SET status = p_status,
        updated_at = now()
    WHERE id = v_prediction_id;
  END IF;

  DELETE FROM public.prediction_answers
  WHERE prediction_id = v_prediction_id;

  IF jsonb_typeof(coalesce(p_answer_rows, '[]'::jsonb)) = 'array'
     AND jsonb_array_length(coalesce(p_answer_rows, '[]'::jsonb)) > 0 THEN
    INSERT INTO public.prediction_answers (prediction_id, question_id, option_id, pick_order)
    SELECT
      v_prediction_id,
      (value ->> 'question_id')::uuid,
      (value ->> 'option_id')::uuid,
      coalesce((value ->> 'pick_order')::integer, 1)
    FROM jsonb_array_elements(p_answer_rows);
  END IF;

  SELECT coalesce(max(pv.version_number), 0) + 1
  INTO v_next_version_number
  FROM public.prediction_versions pv
  WHERE pv.prediction_id = v_prediction_id;

  INSERT INTO public.prediction_versions (prediction_id, version_number, answers_json)
  VALUES (v_prediction_id, v_next_version_number, p_answers_json);

  RETURN QUERY SELECT v_prediction_id, v_next_version_number;
END;
$$;

-- 3. Money-free signup trigger (just creates the profile row). -----------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, points, is_admin)
  VALUES (NEW.id, NULL, 0, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 4. Drop money views. --------------------------------------------------------
DROP VIEW IF EXISTS public.fee_wallet_total CASCADE;
DROP VIEW IF EXISTS public.league_leaderboard CASCADE;

-- 5. Drop money tables (CASCADE clears FK dependents + dependent objects). -----
DROP TABLE IF EXISTS public.payout_holds CASCADE;
DROP TABLE IF EXISTS public.withdrawal_holds CASCADE;
DROP TABLE IF EXISTS public.held_payout_reserves CASCADE;
DROP TABLE IF EXISTS public.platform_fund_adjustments CASCADE;
DROP TABLE IF EXISTS public.league_race_settlements CASCADE;
DROP TABLE IF EXISTS public.deposit_events CASCADE;
DROP TABLE IF EXISTS public.edit_events CASCADE;
DROP TABLE IF EXISTS public.transactions CASCADE;
DROP TABLE IF EXISTS public.fee_wallet CASCADE;

-- 6. Drop money columns. ------------------------------------------------------
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS balance_usdc CASCADE,
  DROP COLUMN IF EXISTS wallet_address CASCADE,
  DROP COLUMN IF EXISTS privy_user_id CASCADE,
  DROP COLUMN IF EXISTS is_beta_account CASCADE,
  DROP COLUMN IF EXISTS payouts_frozen CASCADE;

ALTER TABLE public.leagues
  DROP COLUMN IF EXISTS entry_fee_usdc CASCADE,
  DROP COLUMN IF EXISTS prize_pool CASCADE,
  DROP COLUMN IF EXISTS payout_model CASCADE,
  DROP COLUMN IF EXISTS payout_config CASCADE;

ALTER TABLE public.league_members
  DROP COLUMN IF EXISTS paid CASCADE,
  DROP COLUMN IF EXISTS stake_amount_usdc CASCADE;

-- 7. Single weekend lock anchor: start of the first competitive session. -------
-- Populated server-side from the live Jolpica schedule (qualifying, or sprint
-- qualifying on sprint weekends — whichever comes first).
ALTER TABLE public.races
  ADD COLUMN IF NOT EXISTS lock_time_utc timestamptz;

-- Backfill from existing timing where present (qualifying is the usual first
-- competitive session; fall back to race start).
UPDATE public.races
SET lock_time_utc = coalesce(qualifying_starts_at, race_starts_at)
WHERE lock_time_utc IS NULL;

-- 8. Harden league visibility (private leagues must stay invite-only). ---------
-- The original policy allowed any authenticated user to SELECT every league row
-- (including invite_code) via the data API, defeating the private/invite-only
-- boundary. Restrict reads to public/global leagues, the creator, and members.
DROP POLICY IF EXISTS "leagues_read_all" ON public.leagues;
DROP POLICY IF EXISTS "leagues_select_visible" ON public.leagues;
CREATE POLICY "leagues_select_visible" ON public.leagues
  FOR SELECT TO authenticated
  USING (
    type IN ('public', 'global')
    OR creator_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.league_members lm
      WHERE lm.league_id = leagues.id AND lm.user_id = auth.uid()
    )
  );

-- Invite-based lookups (join preview, join) run through the service-role client
-- in the API layer, so they continue to resolve private leagues by invite_code.
