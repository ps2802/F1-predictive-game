-- =============================================================================
-- ATOMIC LEAGUE STAKES + PREDICTION EDITS
-- =============================================================================

alter table public.league_members
  add column if not exists stake_amount_usdc numeric(10, 2) not null default 0;

update public.league_members lm
set stake_amount_usdc = coalesce(l.entry_fee_usdc, 0)
from public.leagues l
where l.id = lm.league_id
  and lm.paid = true
  and coalesce(lm.stake_amount_usdc, 0) = 0;

alter table public.leagues
  alter column entry_fee_usdc set default 5;

create table if not exists public.payout_holds (
  id            uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.league_race_settlements(id) on delete cascade,
  league_id     uuid not null references public.leagues(id) on delete cascade,
  race_id       text not null references public.races(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  amount        numeric(18, 6) not null,
  payout_rank   integer,
  released      boolean not null default false,
  payout_payload jsonb,
  created_at    timestamptz not null default now()
);

create index if not exists idx_payout_holds_user_id on public.payout_holds (user_id);
create index if not exists idx_payout_holds_settlement_id on public.payout_holds (settlement_id);

alter table public.payout_holds enable row level security;

drop policy if exists "ph_select_admin" on public.payout_holds;
create policy "ph_select_admin" on public.payout_holds
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

create or replace function public.create_league_with_stake(
  p_creator_id uuid,
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

create or replace function public.join_league_with_stake(
  p_league_id uuid,
  p_user_id uuid,
  p_stake_amount_usdc numeric
)
returns table (
  league_id uuid,
  league_name text,
  charged_amount_usdc numeric,
  rake_amount_usdc numeric,
  net_to_pool_usdc numeric
)
language plpgsql
security definer
as $$
declare
  v_league public.leagues%rowtype;
  v_balance numeric(18, 6);
  v_rake numeric(18, 6);
  v_net numeric(18, 6);
begin
  select *
  into v_league
  from public.leagues
  where id = p_league_id
  for update;

  if v_league.id is null then
    raise exception 'League not found';
  end if;

  if v_league.is_active is not true then
    raise exception 'This league is no longer active';
  end if;

  if v_league.member_count >= v_league.max_users then
    raise exception 'League is full';
  end if;

  if exists (
    select 1
    from public.league_members
    where league_id = p_league_id
      and user_id = p_user_id
  ) then
    raise exception 'Already a member of this league';
  end if;

  if coalesce(p_stake_amount_usdc, 0) < coalesce(v_league.entry_fee_usdc, 5) then
    raise exception 'Stake must be at least the league minimum';
  end if;

  select balance_usdc
  into v_balance
  from public.profiles
  where id = p_user_id
  for update;

  if v_balance is null then
    raise exception 'User profile not found';
  end if;

  if v_balance < p_stake_amount_usdc then
    raise exception 'Insufficient balance';
  end if;

  v_rake := round((p_stake_amount_usdc * 0.10)::numeric, 6);
  v_net := round((p_stake_amount_usdc - v_rake)::numeric, 6);

  update public.profiles
  set balance_usdc = balance_usdc - p_stake_amount_usdc
  where id = p_user_id;

  insert into public.league_members (
    league_id,
    user_id,
    paid,
    stake_amount_usdc
  )
  values (
    p_league_id,
    p_user_id,
    true,
    p_stake_amount_usdc
  );

  update public.leagues
  set
    member_count = member_count + 1,
    prize_pool = prize_pool + v_net
  where id = p_league_id;

  insert into public.transactions (
    user_id,
    type,
    amount,
    currency,
    reference_id,
    description
  )
  values (
    p_user_id,
    'entry_fee',
    -p_stake_amount_usdc,
    'USDC',
    p_league_id,
    format(
      'League stake for %s (10%% platform fee)',
      v_league.name
    )
  );

  perform public.credit_fee_wallet(
    v_rake,
    p_league_id,
    'Platform rake from league entry stake'
  );

  return query
  select p_league_id, v_league.name, p_stake_amount_usdc, v_rake, v_net;
end;
$$;

create or replace function public.record_prediction_submission(
  p_user_id uuid,
  p_race_id text,
  p_answers_json jsonb,
  p_answer_rows jsonb,
  p_status public.prediction_status default 'active',
  p_increment_edit_count boolean default false,
  p_edit_fee_usdc numeric default 0,
  p_edit_description text default 'Prediction edit fee'
)
returns table (
  prediction_id uuid,
  edit_count integer,
  version_number integer,
  charged_edit_fee boolean
)
language plpgsql
security definer
as $$
declare
  v_prediction_id uuid;
  v_existing_edit_count integer := 0;
  v_new_edit_count integer := 0;
  v_next_version_number integer := 1;
  v_fee numeric(18, 6) := coalesce(p_edit_fee_usdc, 0);
begin
  select id, edit_count
  into v_prediction_id, v_existing_edit_count
  from public.predictions
  where user_id = p_user_id
    and race_id = p_race_id
  for update;

  if v_prediction_id is null then
    if v_fee > 0 then
      raise exception 'Cannot charge an edit fee for a new prediction';
    end if;

    insert into public.predictions (
      user_id,
      race_id,
      status,
      edit_count
    )
    values (
      p_user_id,
      p_race_id,
      p_status,
      0
    )
    returning id, edit_count into v_prediction_id, v_new_edit_count;
  else
    v_new_edit_count := coalesce(v_existing_edit_count, 0)
      + case when p_increment_edit_count then 1 else 0 end;

    if v_fee > 0 then
      update public.profiles
      set balance_usdc = balance_usdc - v_fee
      where id = p_user_id
        and balance_usdc >= v_fee;

      if not found then
        raise exception 'Insufficient balance for edit fee';
      end if;

      insert into public.transactions (
        user_id,
        type,
        amount,
        currency,
        reference_id,
        description
      )
      values (
        p_user_id,
        'edit_fee',
        -v_fee,
        'USDC',
        v_prediction_id,
        coalesce(p_edit_description, 'Prediction edit fee')
      );

      insert into public.edit_events (
        prediction_id,
        user_id,
        cost_usdc,
        edit_number
      )
      values (
        v_prediction_id,
        p_user_id,
        v_fee,
        v_new_edit_count
      );

      perform public.credit_fee_wallet(
        v_fee,
        null,
        coalesce(p_edit_description, 'Prediction edit fee')
      );
    end if;

    update public.predictions
    set
      status = p_status,
      edit_count = v_new_edit_count,
      updated_at = now()
    where id = v_prediction_id;
  end if;

  delete from public.prediction_answers
  where prediction_id = v_prediction_id;

  if jsonb_typeof(coalesce(p_answer_rows, '[]'::jsonb)) = 'array'
     and jsonb_array_length(coalesce(p_answer_rows, '[]'::jsonb)) > 0 then
    insert into public.prediction_answers (
      prediction_id,
      question_id,
      option_id,
      pick_order
    )
    select
      v_prediction_id,
      (value ->> 'question_id')::uuid,
      (value ->> 'option_id')::uuid,
      coalesce((value ->> 'pick_order')::integer, 1)
    from jsonb_array_elements(p_answer_rows);
  end if;

  select coalesce(max(pv.version_number), 0) + 1
  into v_next_version_number
  from public.prediction_versions pv
  where pv.prediction_id = v_prediction_id;

  insert into public.prediction_versions (
    prediction_id,
    version_number,
    answers_json,
    edit_cost
  )
  values (
    v_prediction_id,
    v_next_version_number,
    p_answers_json,
    case when v_fee > 0 then v_fee else 0 end
  );

  return query
  select
    v_prediction_id,
    v_new_edit_count,
    v_next_version_number,
    v_fee > 0;
end;
$$;

create or replace function public.apply_league_settlement(
  p_league_id uuid,
  p_race_id text,
  p_status text,
  p_payout_model text,
  p_prize_pool numeric,
  p_paid_entrant_count integer,
  p_eligible_count integer,
  p_withheld_amount numeric,
  p_undistributed_amount numeric,
  p_payouts_json jsonb default '[]'::jsonb,
  p_notes text default null,
  p_refunds_json jsonb default '[]'::jsonb
)
returns text
language plpgsql
security definer
as $$
declare
  v_settlement_id uuid;
  v_item jsonb;
begin
  insert into public.league_race_settlements (
    league_id,
    race_id,
    status,
    payout_model,
    prize_pool
  )
  values (
    p_league_id,
    p_race_id,
    'processing',
    p_payout_model,
    p_prize_pool
  )
  returning id into v_settlement_id;

  if p_status = 'refunded' then
    for v_item in
      select value
      from jsonb_array_elements(coalesce(p_refunds_json, '[]'::jsonb))
    loop
      perform public.credit_user_balance(
        (v_item ->> 'userId')::uuid,
        coalesce((v_item ->> 'amount')::numeric, 0)
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
        (v_item ->> 'userId')::uuid,
        'refund',
        coalesce((v_item ->> 'amount')::numeric, 0),
        'USDC',
        p_league_id,
        coalesce(
          v_item ->> 'description',
          format('League refund for race %s', p_race_id)
        )
      );
    end loop;

    update public.leagues
    set prize_pool = 0
    where id = p_league_id;

    update public.league_race_settlements
    set
      status = 'refunded',
      payout_model = p_payout_model,
      paid_entrant_count = coalesce(p_paid_entrant_count, 0),
      eligible_count = 0,
      withheld_amount = 0,
      undistributed_amount = 0,
      payouts_json = coalesce(p_refunds_json, '[]'::jsonb),
      notes = p_notes,
      settled_at = now()
    where id = v_settlement_id;

    return 'refunded';
  end if;

  if p_status <> 'settled' then
    raise exception 'Unsupported settlement status %', p_status;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(coalesce(p_payouts_json, '[]'::jsonb))
  loop
    if coalesce((v_item ->> 'held')::boolean, false) then
      insert into public.payout_holds (
        settlement_id,
        league_id,
        race_id,
        user_id,
        amount,
        payout_rank,
        payout_payload
      )
      values (
        v_settlement_id,
        p_league_id,
        p_race_id,
        (v_item ->> 'userId')::uuid,
        coalesce((v_item ->> 'amount')::numeric, 0),
        nullif(v_item ->> 'rank', '')::integer,
        v_item
      );
    elsif coalesce((v_item ->> 'amount')::numeric, 0) > 0 then
      perform public.credit_user_balance(
        (v_item ->> 'userId')::uuid,
        (v_item ->> 'amount')::numeric
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
        (v_item ->> 'userId')::uuid,
        'payout',
        (v_item ->> 'amount')::numeric,
        'USDC',
        p_league_id,
        format(
          'Race payout: #%s in league (race %s)',
          coalesce(v_item ->> 'rank', '?'),
          p_race_id
        )
      );
    end if;
  end loop;

  update public.leagues
  set prize_pool = 0
  where id = p_league_id;

  update public.league_race_settlements
  set
    status = 'settled',
    payout_model = p_payout_model,
    paid_entrant_count = coalesce(p_paid_entrant_count, 0),
    eligible_count = coalesce(p_eligible_count, 0),
    withheld_amount = coalesce(p_withheld_amount, 0),
    undistributed_amount = coalesce(p_undistributed_amount, 0),
    payouts_json = coalesce(p_payouts_json, '[]'::jsonb),
    notes = p_notes,
    settled_at = now()
  where id = v_settlement_id;

  return 'settled';
exception
  when unique_violation then
    return 'already_settled';
end;
$$;
