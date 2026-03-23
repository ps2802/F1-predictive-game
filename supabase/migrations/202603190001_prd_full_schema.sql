-- =============================================================================
-- F1 PREDICTION PLATFORM — FULL PRD SCHEMA
-- Implements all 16 tables from the Product Requirements Document
-- =============================================================================

-- ────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ────────────────────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────────────────
-- ENUMS
-- ────────────────────────────────────────────────────────────
do $$ begin
  create type prediction_status as enum ('draft', 'active', 'locked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type transaction_type as enum (
    'deposit', 'entry_fee', 'edit_fee', 'withdrawal', 'payout', 'refund'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type question_category as enum ('qualifying', 'race', 'chaos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type confidence_tier as enum ('low_variance', 'medium', 'high', 'chaos');
exception when duplicate_object then null; end $$;

do $$ begin
  create type league_type as enum ('public', 'private', 'global');
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
-- 1. PROFILES (extend existing — add wallet + balance fields)
-- ────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists wallet_address text,
  add column if not exists balance_usdc   numeric(18, 6) not null default 0,
  add column if not exists avatar_url     text,
  add column if not exists is_admin       boolean not null default false;

-- ────────────────────────────────────────────────────────────
-- 2. RACES (extend existing — add lock timestamps + season)
-- ────────────────────────────────────────────────────────────
alter table public.races
  add column if not exists season              integer not null default 2026,
  add column if not exists circuit            text,
  add column if not exists race_starts_at     timestamptz,
  add column if not exists q1_start_time      timestamptz,
  add column if not exists formation_lap_time timestamptz,
  add column if not exists quali_locked       boolean not null default false,
  add column if not exists race_locked        boolean not null default false;

-- ────────────────────────────────────────────────────────────
-- 3. PREDICTION QUESTIONS
--    Template questions per race (created when race is seeded)
-- ────────────────────────────────────────────────────────────
create table if not exists public.prediction_questions (
  id              uuid primary key default gen_random_uuid(),
  race_id         text not null references public.races(id) on delete cascade,
  category        question_category not null,
  question_type   text not null,
  label           text not null,
  base_points     integer not null,
  confidence_tier confidence_tier not null default 'medium',
  multi_select    integer not null default 1, -- how many options user must pick
  display_order   integer not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists idx_pq_race_id on public.prediction_questions (race_id);

-- ────────────────────────────────────────────────────────────
-- 4. PREDICTION OPTIONS
--    Possible answers per question (drivers, constructors, counts)
-- ────────────────────────────────────────────────────────────
create table if not exists public.prediction_options (
  id            uuid primary key default gen_random_uuid(),
  question_id   uuid not null references public.prediction_questions(id) on delete cascade,
  option_type   text not null, -- 'driver' | 'constructor' | 'number' | 'custom'
  option_value  text not null,
  display_order integer not null default 0
);

create index if not exists idx_po_question_id on public.prediction_options (question_id);

-- ────────────────────────────────────────────────────────────
-- 5. PREDICTIONS (update — add status & edit tracking)
-- ────────────────────────────────────────────────────────────
alter table public.predictions
  add column if not exists status     prediction_status not null default 'draft',
  add column if not exists edit_count integer not null default 0;

-- ────────────────────────────────────────────────────────────
-- 6. PREDICTION ANSWERS
--    Stores actual user picks (question + option pairs)
-- ────────────────────────────────────────────────────────────
create table if not exists public.prediction_answers (
  id            uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  question_id   uuid not null references public.prediction_questions(id) on delete cascade,
  option_id     uuid not null references public.prediction_options(id) on delete cascade,
  pick_order    integer not null default 1, -- for multi-select: 1st pick, 2nd pick, etc.
  created_at    timestamptz not null default now(),
  unique (prediction_id, question_id, pick_order)
);

create index if not exists idx_pa_prediction_id on public.prediction_answers (prediction_id);
create index if not exists idx_pa_question_id   on public.prediction_answers (question_id);

-- ────────────────────────────────────────────────────────────
-- 7. PREDICTION VERSIONS
--    Audit trail of every edit (for disputes + replay)
-- ────────────────────────────────────────────────────────────
create table if not exists public.prediction_versions (
  id             uuid primary key default gen_random_uuid(),
  prediction_id  uuid not null references public.predictions(id) on delete cascade,
  version_number integer not null,
  answers_json   jsonb not null,
  edit_cost      numeric(10, 2) not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists idx_pv_prediction_id on public.prediction_versions (prediction_id);

-- ────────────────────────────────────────────────────────────
-- 8. LEAGUES
-- ────────────────────────────────────────────────────────────
create table if not exists public.leagues (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  type           league_type not null default 'private',
  invite_code    text unique,
  invite_link    text,
  creator_id     uuid not null references auth.users(id) on delete cascade,
  entry_fee_usdc numeric(10, 2) not null default 0,
  prize_pool     numeric(10, 2) not null default 0,
  max_users      integer not null default 1000,
  member_count   integer not null default 0,
  payout_model   text not null default 'skill_weighted', -- 'manual' | 'skill_weighted'
  payout_config  jsonb,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_leagues_invite_code on public.leagues (invite_code);
create index if not exists idx_leagues_type        on public.leagues (type);

-- ────────────────────────────────────────────────────────────
-- 9. LEAGUE MEMBERS
-- ────────────────────────────────────────────────────────────
create table if not exists public.league_members (
  id            uuid primary key default gen_random_uuid(),
  league_id     uuid not null references public.leagues(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  paid          boolean not null default false,
  joined_at     timestamptz not null default now(),
  unique (league_id, user_id)
);

create index if not exists idx_lm_league_id on public.league_members (league_id);
create index if not exists idx_lm_user_id   on public.league_members (user_id);

-- ────────────────────────────────────────────────────────────
-- 10. RACE RESULTS (per question)
--     Stores correct answers for each prediction question
-- ────────────────────────────────────────────────────────────
create table if not exists public.race_results (
  id               uuid primary key default gen_random_uuid(),
  race_id          text not null references public.races(id) on delete cascade,
  question_id      uuid not null references public.prediction_questions(id) on delete cascade,
  correct_option_id uuid not null references public.prediction_options(id) on delete cascade,
  pick_order       integer not null default 1,
  created_at       timestamptz not null default now(),
  unique (race_id, question_id, pick_order)
);

create index if not exists idx_rr_race_id     on public.race_results (race_id);
create index if not exists idx_rr_question_id on public.race_results (question_id);

-- ────────────────────────────────────────────────────────────
-- 11. RACE SCORES
--     Computed scores per user per race
-- ────────────────────────────────────────────────────────────
create table if not exists public.race_scores (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  race_id          text not null references public.races(id) on delete cascade,
  total_score      numeric(10, 4) not null default 0,
  base_score       numeric(10, 4) not null default 0,
  difficulty_score numeric(10, 4) not null default 0,
  edit_penalty     numeric(10, 4) not null default 1,
  breakdown_json   jsonb,
  calculated_at    timestamptz not null default now(),
  unique (user_id, race_id)
);

create index if not exists idx_rs_user_id on public.race_scores (user_id);
create index if not exists idx_rs_race_id on public.race_scores (race_id);

-- ────────────────────────────────────────────────────────────
-- 12. LEAGUE SCORES
--     Per-league rankings aggregated across races
-- ────────────────────────────────────────────────────────────
create table if not exists public.league_scores (
  id         uuid primary key default gen_random_uuid(),
  league_id  uuid not null references public.leagues(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  race_id    text not null references public.races(id) on delete cascade,
  score      numeric(10, 4) not null default 0,
  rank       integer,
  created_at timestamptz not null default now(),
  unique (league_id, user_id, race_id)
);

create index if not exists idx_ls_league_id on public.league_scores (league_id);
create index if not exists idx_ls_user_id   on public.league_scores (user_id);

-- ────────────────────────────────────────────────────────────
-- 13. TRANSACTIONS
--     Internal USDC balance ledger
-- ────────────────────────────────────────────────────────────
create table if not exists public.transactions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  type         transaction_type not null,
  amount       numeric(18, 6) not null,
  currency     text not null default 'USDC',
  reference_id uuid,
  description  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_tx_user_id on public.transactions (user_id);
create index if not exists idx_tx_type    on public.transactions (type);

-- ────────────────────────────────────────────────────────────
-- 14. DEPOSIT EVENTS
--     Blockchain deposit detection records
-- ────────────────────────────────────────────────────────────
create table if not exists public.deposit_events (
  id             uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  tx_hash        text unique not null,
  amount         numeric(18, 6) not null,
  token          text not null default 'USDC',
  confirmed      boolean not null default false,
  user_id        uuid references auth.users(id),
  created_at     timestamptz not null default now()
);

create index if not exists idx_de_wallet on public.deposit_events (wallet_address);
create index if not exists idx_de_tx     on public.deposit_events (tx_hash);

-- ────────────────────────────────────────────────────────────
-- 15. EDIT EVENTS (Edit Credits)
--     Track every paid edit to a prediction
-- ────────────────────────────────────────────────────────────
create table if not exists public.edit_events (
  id            uuid primary key default gen_random_uuid(),
  prediction_id uuid not null references public.predictions(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  cost_usdc     numeric(10, 4) not null default 1.0,
  edit_number   integer not null,
  created_at    timestamptz not null default now()
);

create index if not exists idx_ee_prediction_id on public.edit_events (prediction_id);
create index if not exists idx_ee_user_id       on public.edit_events (user_id);

-- ────────────────────────────────────────────────────────────
-- 16. PICK POPULARITY SNAPSHOTS
--     Frozen at lock time — used for difficulty multipliers
-- ────────────────────────────────────────────────────────────
create table if not exists public.pick_popularity_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  race_id            text not null references public.races(id) on delete cascade,
  question_id        uuid not null references public.prediction_questions(id) on delete cascade,
  option_id          uuid not null references public.prediction_options(id) on delete cascade,
  pick_count         integer not null default 0,
  total_entries      integer not null default 0,
  popularity_percent numeric(6, 4) not null default 0,
  snapshot_time      timestamptz not null default now(),
  unique (race_id, question_id, option_id)
);

create index if not exists idx_pps_race_id on public.pick_popularity_snapshots (race_id);

-- ────────────────────────────────────────────────────────────
-- UPDATED_AT TRIGGERS for new tables
-- ────────────────────────────────────────────────────────────
drop trigger if exists leagues_set_updated_at on public.leagues;
create trigger leagues_set_updated_at
before update on public.leagues
for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────────────────────
-- GLOBAL LEADERBOARD VIEW (updated)
-- ────────────────────────────────────────────────────────────
drop view if exists public.leaderboard;
create view public.leaderboard as
select
  pr.id          as user_id,
  pr.username,
  pr.avatar_url,
  coalesce(sum(rs.total_score), 0)::numeric as total_score,
  count(rs.race_id)::integer                as races_played
from public.profiles pr
left join public.race_scores rs on rs.user_id = pr.id
group by pr.id, pr.username, pr.avatar_url
order by total_score desc, pr.id;

-- ────────────────────────────────────────────────────────────
-- LEAGUE LEADERBOARD VIEW
-- ────────────────────────────────────────────────────────────
drop view if exists public.league_leaderboard;
create view public.league_leaderboard as
select
  lm.league_id,
  pr.id          as user_id,
  pr.username,
  pr.avatar_url,
  coalesce(sum(rs.total_score), 0)::numeric as total_score,
  count(rs.race_id)::integer                as races_played
from public.league_members lm
join public.profiles pr on pr.id = lm.user_id
left join public.race_scores rs on rs.user_id = lm.user_id
group by lm.league_id, pr.id, pr.username, pr.avatar_url
order by total_score desc;

-- ────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

-- prediction_questions: readable by all authenticated
alter table public.prediction_questions enable row level security;
drop policy if exists "pq_read_all" on public.prediction_questions;
create policy "pq_read_all" on public.prediction_questions
  for select to authenticated using (true);

-- prediction_options: readable by all authenticated
alter table public.prediction_options enable row level security;
drop policy if exists "po_read_all" on public.prediction_options;
create policy "po_read_all" on public.prediction_options
  for select to authenticated using (true);

-- prediction_answers: users can CRUD own answers
alter table public.prediction_answers enable row level security;
drop policy if exists "pa_select_own" on public.prediction_answers;
create policy "pa_select_own" on public.prediction_answers
  for select to authenticated
  using (exists (
    select 1 from public.predictions p
    where p.id = prediction_id and p.user_id = auth.uid()
  ));
drop policy if exists "pa_insert_own" on public.prediction_answers;
create policy "pa_insert_own" on public.prediction_answers
  for insert to authenticated
  with check (exists (
    select 1 from public.predictions p
    where p.id = prediction_id and p.user_id = auth.uid()
  ));
drop policy if exists "pa_update_own" on public.prediction_answers;
create policy "pa_update_own" on public.prediction_answers
  for update to authenticated
  using (exists (
    select 1 from public.predictions p
    where p.id = prediction_id and p.user_id = auth.uid()
  ));
drop policy if exists "pa_delete_own" on public.prediction_answers;
create policy "pa_delete_own" on public.prediction_answers
  for delete to authenticated
  using (exists (
    select 1 from public.predictions p
    where p.id = prediction_id and p.user_id = auth.uid()
  ));

-- prediction_versions: users see own versions
alter table public.prediction_versions enable row level security;
drop policy if exists "pv_select_own" on public.prediction_versions;
create policy "pv_select_own" on public.prediction_versions
  for select to authenticated
  using (exists (
    select 1 from public.predictions p
    where p.id = prediction_id and p.user_id = auth.uid()
  ));

-- leagues: all authenticated can read, creator can insert/update
alter table public.leagues enable row level security;
drop policy if exists "leagues_read_all" on public.leagues;
create policy "leagues_read_all" on public.leagues
  for select to authenticated using (true);
drop policy if exists "leagues_insert_own" on public.leagues;
create policy "leagues_insert_own" on public.leagues
  for insert to authenticated with check (auth.uid() = creator_id);
drop policy if exists "leagues_update_own" on public.leagues;
create policy "leagues_update_own" on public.leagues
  for update to authenticated using (auth.uid() = creator_id);

-- league_members: users see all members (for leaderboard), insert own
alter table public.league_members enable row level security;
drop policy if exists "lm_read_all" on public.league_members;
create policy "lm_read_all" on public.league_members
  for select to authenticated using (true);
drop policy if exists "lm_insert_own" on public.league_members;
create policy "lm_insert_own" on public.league_members
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "lm_delete_own" on public.league_members;
create policy "lm_delete_own" on public.league_members
  for delete to authenticated using (auth.uid() = user_id);

-- race_results: readable by all authenticated
alter table public.race_results enable row level security;
drop policy if exists "rr_read_all" on public.race_results;
create policy "rr_read_all" on public.race_results
  for select to authenticated using (true);

-- race_scores: readable by all authenticated
alter table public.race_scores enable row level security;
drop policy if exists "rs_read_all" on public.race_scores;
create policy "rs_read_all" on public.race_scores
  for select to authenticated using (true);

-- league_scores: readable by all authenticated
alter table public.league_scores enable row level security;
drop policy if exists "lscore_read_all" on public.league_scores;
create policy "lscore_read_all" on public.league_scores
  for select to authenticated using (true);

-- transactions: users see own transactions
alter table public.transactions enable row level security;
drop policy if exists "tx_select_own" on public.transactions;
create policy "tx_select_own" on public.transactions
  for select to authenticated using (auth.uid() = user_id);

-- deposit_events: users see own deposits
alter table public.deposit_events enable row level security;
drop policy if exists "de_select_own" on public.deposit_events;
create policy "de_select_own" on public.deposit_events
  for select to authenticated using (auth.uid() = user_id);

-- edit_events: users see own edits
alter table public.edit_events enable row level security;
drop policy if exists "ee_select_own" on public.edit_events;
create policy "ee_select_own" on public.edit_events
  for select to authenticated using (auth.uid() = user_id);

-- pick_popularity_snapshots: readable by all authenticated (post-lock)
alter table public.pick_popularity_snapshots enable row level security;
drop policy if exists "pps_read_all" on public.pick_popularity_snapshots;
create policy "pps_read_all" on public.pick_popularity_snapshots
  for select to authenticated using (true);

-- ────────────────────────────────────────────────────────────
-- HELPER: Generate invite code
-- ────────────────────────────────────────────────────────────
create or replace function public.generate_invite_code()
returns text
language sql
as $$
  select upper(substring(replace(gen_random_uuid()::text, '-', ''), 1, 8));
$$;

-- ────────────────────────────────────────────────────────────
-- HELPER: Seed standard prediction questions for a race
-- ────────────────────────────────────────────────────────────
create or replace function public.seed_race_questions(p_race_id text)
returns void
language plpgsql
as $$
declare
  v_qid uuid;
  v_driver text;
  v_constructor text;
  v_drivers text[] := array[
    'Max Verstappen','Liam Lawson','Lando Norris','Oscar Piastri',
    'Charles Leclerc','Lewis Hamilton','George Russell','Andrea Kimi Antonelli',
    'Fernando Alonso','Lance Stroll','Carlos Sainz','Alexander Albon',
    'Nico Hülkenberg','Oliver Bearman','Yuki Tsunoda','Isack Hadjar',
    'Esteban Ocon','Jack Doohan','Gabriel Bortoleto','Valtteri Bottas'
  ];
  v_constructors text[] := array[
    'Red Bull','McLaren','Ferrari','Mercedes','Aston Martin',
    'Williams','Haas','RB','Alpine','Sauber'
  ];
  v_i integer;
begin
  -- ── QUALIFYING ──────────────────────────────────────────

  -- Q: Pole sitter
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'qualifying', 'pole_sitter', 'Pole Sitter', 12, 'medium', 1, 1)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

  -- Q: Both cars Q3 (pick constructor)
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'qualifying', 'both_cars_q3', 'Constructor with Both Cars in Q3', 10, 'medium', 2, 2)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_constructor in array v_constructors loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'constructor', v_constructor, array_position(v_constructors, v_constructor))
      on conflict do nothing;
    end loop;
  end if;

  -- Q: Q1 Eliminations (pick 2 drivers)
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'qualifying', 'q1_elimination', 'Q1 Eliminations (pick 2)', 8, 'high', 2, 3)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

  -- ── RACE ────────────────────────────────────────────────

  -- R: Race Winner
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'winner', 'Race Winner', 20, 'medium', 1, 10)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

  -- R: Podium (pick 2 additional drivers, P2 + P3)
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'podium', 'Podium Finishers (P2 & P3)', 15, 'medium', 2, 11)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

  -- R: Fastest Lap
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'fastest_lap', 'Fastest Lap', 12, 'high', 1, 12)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

  -- R: Most Positions Gained
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'most_positions_gained', 'Most Positions Gained', 12, 'high', 1, 13)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

  -- R: Top Constructor
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'top_constructor', 'Top Scoring Constructor', 10, 'medium', 1, 14)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_constructor in array v_constructors loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'constructor', v_constructor, array_position(v_constructors, v_constructor))
      on conflict do nothing;
    end loop;
  end if;

  -- ── CHAOS ───────────────────────────────────────────────

  -- C: Safety Cars
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'chaos', 'safety_cars', 'Number of Safety Cars', 10, 'chaos', 1, 20)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    insert into public.prediction_options (question_id, option_type, option_value, display_order) values
      (v_qid, 'number', '0',  1),
      (v_qid, 'number', '1',  2),
      (v_qid, 'number', '2',  3),
      (v_qid, 'number', '3+', 4)
    on conflict do nothing;
  end if;

  -- C: P5–P10 Finishers (pick 2)
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'chaos', 'p5_to_p10', 'P5–P10 Finishers (pick 2)', 10, 'chaos', 2, 21)
  on conflict do nothing
  returning id into v_qid;
  if v_qid is not null then
    foreach v_driver in array v_drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_qid, 'driver', v_driver, array_position(v_drivers, v_driver))
      on conflict do nothing;
    end loop;
  end if;

end;
$$;

-- ────────────────────────────────────────────────────────────
-- SEED QUESTIONS FOR ALL EXISTING RACES
-- ────────────────────────────────────────────────────────────
do $$
declare
  r public.races%rowtype;
begin
  for r in select * from public.races loop
    perform public.seed_race_questions(r.id);
  end loop;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- ENSURE GLOBAL LEAGUE EXISTS
-- ────────────────────────────────────────────────────────────
-- Note: Global league needs a system user. We create it via service role.
-- This is handled in app bootstrap instead.
