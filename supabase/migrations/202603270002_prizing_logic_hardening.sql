-- =============================================================================
-- PRIZING LOGIC HARDENING
-- =============================================================================

-- Allow manual payout review holds without blocking scoring visibility.
alter table public.profiles
  add column if not exists payouts_frozen boolean not null default false;

-- New leagues default to manual 50/30/20 unless explicitly configured otherwise.
alter table public.leagues
  alter column payout_model set default 'manual';

create table if not exists public.league_race_settlements (
  id                   uuid primary key default gen_random_uuid(),
  league_id            uuid not null references public.leagues(id) on delete cascade,
  race_id              text not null references public.races(id) on delete cascade,
  status               text not null,
  payout_model         text not null,
  prize_pool           numeric(18, 6) not null default 0,
  paid_entrant_count   integer not null default 0,
  eligible_count       integer not null default 0,
  withheld_amount      numeric(18, 6) not null default 0,
  undistributed_amount numeric(18, 6) not null default 0,
  payouts_json         jsonb,
  notes                text,
  settled_at           timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  unique (league_id, race_id)
);

create index if not exists idx_lrs_race_id on public.league_race_settlements (race_id);
create index if not exists idx_lrs_league_id on public.league_race_settlements (league_id);

alter table public.league_race_settlements enable row level security;

drop policy if exists "lrs_select_admin" on public.league_race_settlements;
create policy "lrs_select_admin" on public.league_race_settlements
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );
