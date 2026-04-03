-- =============================================================================
-- MULTI-ASSET DEPOSIT FLOW
-- =============================================================================

-- Deposit events now track the inbound asset and the USDC amount credited after swap.
alter table public.deposit_events
  add column if not exists swapped_amount_usdc numeric(18, 6),
  add column if not exists credited_amount_usdc numeric(18, 6),
  add column if not exists fee_amount_usdc numeric(18, 6) not null default 0,
  add column if not exists swap_reference text;

update public.deposit_events
set
  swapped_amount_usdc = coalesce(swapped_amount_usdc, amount),
  credited_amount_usdc = coalesce(credited_amount_usdc, amount)
where swapped_amount_usdc is null
   or credited_amount_usdc is null;

alter table public.deposit_events
  alter column swapped_amount_usdc set not null;

alter table public.deposit_events
  alter column credited_amount_usdc set not null;

-- Fee wallet is the shared USDC sink for league rake and any swap/deposit fees.
drop function if exists public.credit_fee_wallet(numeric, uuid);

create or replace function public.credit_fee_wallet(
  p_amount numeric,
  p_league_id uuid default null,
  p_description text default 'Platform fee collected'
)
returns void
language sql
security definer
as $$
  insert into public.fee_wallet (amount, league_id, description)
  select
    p_amount,
    p_league_id,
    coalesce(p_description, 'Platform fee collected')
  where coalesce(p_amount, 0) > 0;
$$;

create or replace function public.record_normalized_deposit(
  p_target_user_id uuid,
  p_wallet_address text,
  p_tx_hash text,
  p_source_amount numeric,
  p_source_token text,
  p_swapped_amount_usdc numeric,
  p_credited_amount_usdc numeric,
  p_fee_amount_usdc numeric default 0,
  p_swap_reference text default null,
  p_description text default null
)
returns table (
  deposit_event_id uuid,
  credited_amount_usdc numeric,
  fee_amount_usdc numeric
)
language plpgsql
security definer
as $$
declare
  v_event_id uuid;
  v_fee numeric(18, 6) := coalesce(p_fee_amount_usdc, 0);
  v_description text := coalesce(
    p_description,
    case
      when upper(coalesce(p_source_token, 'USDC')) = 'USDC' and v_fee = 0
        then 'Manual USDC credit'
      else format(
        'Manual deposit credit after %s to USDC swap',
        upper(coalesce(p_source_token, 'USDC'))
      )
    end
  );
begin
  if p_source_amount <= 0 then
    raise exception 'source_amount must be positive';
  end if;

  if p_credited_amount_usdc <= 0 then
    raise exception 'credited_amount_usdc must be positive';
  end if;

  if v_fee < 0 then
    raise exception 'fee_amount_usdc cannot be negative';
  end if;

  if round((p_credited_amount_usdc + v_fee)::numeric, 6) <> round(p_swapped_amount_usdc::numeric, 6) then
    raise exception 'swapped_amount_usdc must equal credited_amount_usdc + fee_amount_usdc';
  end if;

  insert into public.deposit_events (
    wallet_address,
    tx_hash,
    amount,
    token,
    swapped_amount_usdc,
    credited_amount_usdc,
    fee_amount_usdc,
    swap_reference,
    confirmed,
    user_id
  )
  values (
    coalesce(nullif(trim(p_wallet_address), ''), 'manual'),
    p_tx_hash,
    p_source_amount,
    upper(coalesce(p_source_token, 'USDC')),
    p_swapped_amount_usdc,
    p_credited_amount_usdc,
    v_fee,
    nullif(trim(coalesce(p_swap_reference, '')), ''),
    true,
    p_target_user_id
  )
  returning id into v_event_id;

  update public.profiles
  set balance_usdc = balance_usdc + p_credited_amount_usdc
  where id = p_target_user_id;

  if not found then
    raise exception 'Target user not found';
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
    p_target_user_id,
    'deposit',
    p_credited_amount_usdc,
    'USDC',
    v_event_id,
    v_description
  );

  perform public.credit_fee_wallet(
    v_fee,
    null,
    format(
      'Deposit swap fee collected from %s deposit',
      upper(coalesce(p_source_token, 'USDC'))
    )
  );

  return query
  select v_event_id, p_credited_amount_usdc, v_fee;
end;
$$;
