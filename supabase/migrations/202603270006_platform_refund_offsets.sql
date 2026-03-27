-- =============================================================================
-- PLATFORM REFUND OFFSETS
-- =============================================================================

create table if not exists public.platform_fund_adjustments (
  id          uuid primary key default gen_random_uuid(),
  league_id   uuid references public.leagues(id) on delete set null,
  race_id     text references public.races(id) on delete set null,
  amount      numeric(18, 6) not null,
  reason      text not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_platform_fund_adjustments_league_id
  on public.platform_fund_adjustments (league_id);

create index if not exists idx_platform_fund_adjustments_race_id
  on public.platform_fund_adjustments (race_id);

alter table public.platform_fund_adjustments enable row level security;

drop policy if exists "pfa_select_admin" on public.platform_fund_adjustments;
create policy "pfa_select_admin" on public.platform_fund_adjustments
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

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
  v_total_refunded numeric(18, 6) := 0;
  v_platform_offset numeric(18, 6) := 0;
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
      v_total_refunded := v_total_refunded + coalesce((v_item ->> 'amount')::numeric, 0);

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

    v_platform_offset := round(greatest(v_total_refunded - coalesce(p_prize_pool, 0), 0), 6);

    if v_platform_offset > 0 then
      insert into public.platform_fund_adjustments (
        league_id,
        race_id,
        amount,
        reason
      )
      values (
        p_league_id,
        p_race_id,
        v_platform_offset,
        'Platform-funded rake restoration for underfilled league refund'
      );
    end if;

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
      notes = concat_ws(
        ' ',
        p_notes,
        case
          when v_platform_offset > 0 then format(
            'Platform restored %s USDC so members received full refunds.',
            v_platform_offset
          )
          else null
        end
      ),
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
