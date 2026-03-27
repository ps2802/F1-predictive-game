-- =============================================================================
-- PRIZE DISTRIBUTION — DB functions for fee wallet + user balance credits
-- =============================================================================

-- ────────────────────────────────────────────────────────────
-- 1. FEE WALLET TABLE
--    Platform revenue ledger. Each row is a fee event.
--    The fee_wallet_address env var / config determines where
--    actual on-chain withdrawals go.
-- ────────────────────────────────────────────────────────────
create table if not exists public.fee_wallet (
  id          uuid primary key default gen_random_uuid(),
  amount      numeric(18, 6) not null,
  currency    text not null default 'USDC',
  league_id   uuid references public.leagues(id) on delete set null,
  description text,
  created_at  timestamptz not null default now()
);

alter table public.fee_wallet enable row level security;

-- Only admins can read fee wallet entries
drop policy if exists "fw_select_admin" on public.fee_wallet;
create policy "fw_select_admin" on public.fee_wallet
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- ────────────────────────────────────────────────────────────
-- 2. credit_fee_wallet RPC
--    Records platform rake from a league entry fee.
--    Called from the league join route.
-- ────────────────────────────────────────────────────────────
create or replace function public.credit_fee_wallet(p_amount numeric, p_league_id uuid)
returns void
language sql
security definer
as $$
  insert into public.fee_wallet (amount, league_id, description)
  values (p_amount, p_league_id, 'Platform rake from league entry fee');
$$;

-- ────────────────────────────────────────────────────────────
-- 3. credit_user_balance RPC
--    Atomically increments a user's USDC balance.
--    Used by the settlement payout pipeline.
-- ────────────────────────────────────────────────────────────
create or replace function public.credit_user_balance(p_user_id uuid, p_amount numeric)
returns void
language sql
security definer
as $$
  update public.profiles
  set balance_usdc = balance_usdc + p_amount
  where id = p_user_id;
$$;

-- ────────────────────────────────────────────────────────────
-- 4. fee_wallet_total VIEW
--    Quick aggregate for admin dashboard.
-- ────────────────────────────────────────────────────────────
create or replace view public.fee_wallet_total as
select
  coalesce(sum(amount), 0) as total_fees_collected,
  count(*) as total_fee_events,
  currency
from public.fee_wallet
group by currency;
