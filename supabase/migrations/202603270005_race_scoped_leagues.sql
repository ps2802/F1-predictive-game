-- =============================================================================
-- RACE-SCOPED LEAGUES
-- =============================================================================

alter table public.leagues
  add column if not exists race_id text references public.races(id) on delete cascade;

create index if not exists idx_leagues_race_id on public.leagues (race_id);

drop view if exists public.league_leaderboard;
create view public.league_leaderboard as
select
  lm.league_id,
  l.race_id,
  pr.id as user_id,
  pr.username,
  pr.avatar_url,
  coalesce(max(rs.total_score), 0)::numeric as total_score,
  case when max(rs.race_id) is null then 0 else 1 end::integer as races_played
from public.league_members lm
join public.leagues l on l.id = lm.league_id
join public.profiles pr on pr.id = lm.user_id
left join public.race_scores rs
  on rs.user_id = lm.user_id
 and rs.race_id = l.race_id
where lm.paid = true
group by lm.league_id, l.race_id, pr.id, pr.username, pr.avatar_url
order by total_score desc;

create or replace function public.create_league_with_stake(
  p_creator_id uuid,
  p_race_id text,
  p_name text,
  p_type public.league_type,
  p_max_users integer,
  p_min_stake_usdc numeric,
  p_creator_stake_usdc numeric,
  p_payout_model text,
  p_payout_config jsonb default null
)
returns table (
  league_id uuid,
  invite_code text,
  charged_amount_usdc numeric,
  rake_amount_usdc numeric,
  net_to_pool_usdc numeric
)
language plpgsql
security definer
as $$
declare
  v_balance numeric(18, 6);
  v_league_id uuid;
  v_invite_code text;
  v_rake numeric(18, 6);
  v_net numeric(18, 6);
begin
  if p_race_id is null then
    raise exception 'Race is required';
  end if;

  if not exists (
    select 1
    from public.races
    where id = p_race_id
  ) then
    raise exception 'Race not found';
  end if;

  if coalesce(p_min_stake_usdc, 0) < 5 then
    raise exception 'League minimum stake must be at least 5 USDC';
  end if;

  if coalesce(p_creator_stake_usdc, 0) < p_min_stake_usdc then
    raise exception 'Creator stake must be at least the league minimum stake';
  end if;

  select balance_usdc
  into v_balance
  from public.profiles
  where id = p_creator_id
  for update;

  if v_balance is null then
    raise exception 'Creator profile not found';
  end if;

  if v_balance < p_creator_stake_usdc then
    raise exception 'Insufficient balance';
  end if;

  select public.generate_invite_code() into v_invite_code;

  v_rake := round((p_creator_stake_usdc * 0.10)::numeric, 6);
  v_net := round((p_creator_stake_usdc - v_rake)::numeric, 6);

  update public.profiles
  set balance_usdc = balance_usdc - p_creator_stake_usdc
  where id = p_creator_id;

  insert into public.leagues (
    race_id,
    name,
    type,
    invite_code,
    creator_id,
    entry_fee_usdc,
    prize_pool,
    max_users,
    member_count,
    payout_model,
    payout_config
  )
  values (
    p_race_id,
    trim(p_name),
    p_type,
    v_invite_code,
    p_creator_id,
    p_min_stake_usdc,
    v_net,
    p_max_users,
    1,
    p_payout_model,
    p_payout_config
  )
  returning id into v_league_id;

  insert into public.league_members (
    league_id,
    user_id,
    paid,
    stake_amount_usdc
  )
  values (
    v_league_id,
    p_creator_id,
    true,
    p_creator_stake_usdc
  );

  insert into public.transactions (
    user_id,
    type,
    amount,
    currency,
    reference_id,
    description
  )
  values (
    p_creator_id,
    'entry_fee',
    -p_creator_stake_usdc,
    'USDC',
    v_league_id,
    format(
      'League opening stake for %s (10%% platform fee)',
      trim(p_name)
    )
  );

  perform public.credit_fee_wallet(
    v_rake,
    v_league_id,
    'Platform rake from league opening stake'
  );

  return query
  select v_league_id, v_invite_code, p_creator_stake_usdc, v_rake, v_net;
end;
$$;
