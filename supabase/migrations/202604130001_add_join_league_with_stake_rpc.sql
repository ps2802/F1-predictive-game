-- Add join_league_with_stake RPC.
--
-- The app's /api/leagues/join route first tries this RPC. If it was missing,
-- it fell back to joinLeagueWithoutRpc (TypeScript) which has an inherent
-- race condition: prize_pool and member_count are updated in two separate
-- statements, so concurrent joins can produce lost updates.
--
-- This function runs the entire join atomically inside a single transaction,
-- eliminating that race condition.

create or replace function public.join_league_with_stake(
  p_league_id  uuid,
  p_user_id    uuid,
  p_stake_amount_usdc numeric
)
returns table(
  charged_amount_usdc numeric,
  rake_amount_usdc    numeric,
  net_to_pool_usdc    numeric
)
language plpgsql
security definer
as $$
declare
  v_balance      numeric(18, 6);
  v_entry_fee    numeric(18, 6);
  v_member_count integer;
  v_max_users    integer;
  v_is_active    boolean;
  v_prize_pool   numeric(18, 6);
  v_rake         numeric(18, 6);
  v_net          numeric(18, 6);
  v_league_name  text;
begin
  -- Lock the league row to prevent concurrent joins racing on member_count / prize_pool
  select
    l.is_active,
    l.entry_fee_usdc,
    l.member_count,
    l.max_users,
    l.prize_pool,
    l.name
  into
    v_is_active,
    v_entry_fee,
    v_member_count,
    v_max_users,
    v_prize_pool,
    v_league_name
  from public.leagues l
  where l.id = p_league_id
  for update;

  if not found then
    raise exception 'League not found';
  end if;

  if not v_is_active then
    raise exception 'This league is no longer active';
  end if;

  if p_stake_amount_usdc < coalesce(v_entry_fee, 0) then
    raise exception 'Stake must be at least the league minimum';
  end if;

  if v_member_count >= v_max_users then
    raise exception 'League is full';
  end if;

  -- Check for existing membership
  if exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = p_user_id
  ) then
    raise exception 'Already a member of this league';
  end if;

  -- Lock and check user balance
  select balance_usdc into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'User profile not found';
  end if;

  if v_balance < p_stake_amount_usdc then
    raise exception 'Insufficient balance';
  end if;

  -- Compute rake (10%) and net to prize pool
  v_rake := round((p_stake_amount_usdc * 0.10)::numeric, 6);
  v_net  := round((p_stake_amount_usdc - v_rake)::numeric, 6);

  -- Deduct from user balance
  update public.profiles
  set balance_usdc = balance_usdc - p_stake_amount_usdc
  where id = p_user_id;

  -- Insert league member
  insert into public.league_members (league_id, user_id, paid, stake_amount_usdc)
  values (p_league_id, p_user_id, true, p_stake_amount_usdc);

  -- Atomically increment member_count and add net stake to prize pool
  update public.leagues
  set
    member_count = member_count + 1,
    prize_pool   = round((coalesce(prize_pool, 0) + v_net)::numeric, 6)
  where id = p_league_id;

  -- Record transaction ledger entry
  insert into public.transactions (user_id, type, amount, currency, reference_id, description)
  values (
    p_user_id,
    'entry_fee',
    -p_stake_amount_usdc,
    'USDC',
    p_league_id,
    format('League stake for %s (10%% platform fee)', v_league_name)
  );

  -- Credit platform fee wallet (best-effort — non-fatal if credit_fee_wallet is unavailable)
  begin
    perform public.credit_fee_wallet(v_rake, p_league_id, 'Platform rake from league join stake');
  exception when others then
    insert into public.fee_wallet (amount, league_id, description)
    values (v_rake, p_league_id, 'Platform rake from league join stake');
  end;

  return query select p_stake_amount_usdc, v_rake, v_net;
end;
$$;
