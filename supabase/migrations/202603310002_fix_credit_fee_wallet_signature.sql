-- Fix credit_fee_wallet to accept optional description parameter.
-- All call sites in 202603270004 and 202603270005 pass 3 arguments.
create or replace function public.credit_fee_wallet(
  p_amount     numeric,
  p_league_id  uuid,
  p_description text default null
)
returns void
language sql
security definer
as $$
  insert into public.fee_wallet (amount, league_id, description)
  values (p_amount, p_league_id, coalesce(p_description, 'Platform fee'));
$$;
