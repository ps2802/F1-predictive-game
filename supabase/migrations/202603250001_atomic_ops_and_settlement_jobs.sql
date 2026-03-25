-- =============================================================================
-- ATOMIC OPS + SETTLEMENT JOBS
-- 1. atomic_deduct_balance  — prevents double-spend race condition (F1P-70)
-- 2. increment_member_count — prevents lost-update on league member_count
-- 3. settlement_jobs table  — async race settlement queue (F1P-76)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Atomic balance deduction
--    Deducts p_amount from a user's balance in a single UPDATE … WHERE …
--    RETURNING statement. If no row is returned the balance was insufficient.
--    Raises 'insufficient_balance' so the caller can surface a clean 402.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.atomic_deduct_balance(
  p_user_id uuid,
  p_amount  numeric
) RETURNS numeric            -- returns the new balance on success
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_balance numeric;
BEGIN
  UPDATE profiles
  SET    balance_usdc = balance_usdc - p_amount
  WHERE  id = p_user_id
    AND  balance_usdc >= p_amount
  RETURNING balance_usdc INTO v_new_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_balance'
      USING HINT = 'balance_usdc is below the required amount';
  END IF;

  RETURN v_new_balance;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Atomic member count increment
--    Replaces the read-then-write member_count update in leagues/join.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.increment_member_count(
  p_league_id uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE leagues
  SET member_count = member_count + 1
  WHERE id = p_league_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Settlement jobs queue
--    Admin enqueues a job; the cron processor picks it up and runs scoring.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  race_id         text NOT NULL REFERENCES public.races(id),
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'running', 'done', 'failed')),
  scores_computed integer,
  error_message   text,
  created_by      uuid REFERENCES auth.users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  started_at      timestamptz,
  completed_at    timestamptz
);

ALTER TABLE public.settlement_jobs ENABLE ROW LEVEL SECURITY;

-- Admins can read and manage jobs; no direct write access for regular users.
CREATE POLICY "admins_manage_settlement_jobs"
  ON public.settlement_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND is_admin = true
    )
  );
