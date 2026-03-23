-- =============================================================================
-- PRIVY AUTH + BETA CREDITS MIGRATION
-- Adds Privy identity link and beta account flag to profiles.
-- Updates handle_new_user trigger to credit 100 Beta Credits on signup.
-- =============================================================================

-- 1. Add Privy identity + beta flag columns
alter table public.profiles
  add column if not exists privy_user_id  text unique,
  add column if not exists is_beta_account boolean not null default true;

-- 2. Back-fill existing accounts as beta
update public.profiles set is_beta_account = true where is_beta_account is distinct from true;

-- 3. Update handle_new_user to credit 100 Beta Credits on every new signup.
--    The privy-sync API route handles OAuth users; this fires for any new
--    auth.users row (including those created by the Supabase admin API on
--    behalf of Privy-authenticated users).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, balance_usdc, is_beta_account)
  values (new.id, null, 100.0, true)
  on conflict (id) do nothing;

  -- Log the initial credit so it appears in the transaction ledger.
  -- Ignore if profile already existed (on conflict do nothing covers that).
  insert into public.transactions (user_id, type, amount, currency, description)
  select new.id, 'deposit', 100.0, 'USDC', 'Beta signup — 100 Beta Credits'
  where not exists (
    select 1 from public.transactions
    where user_id = new.id and description = 'Beta signup — 100 Beta Credits'
  );

  return new;
end;
$$;
