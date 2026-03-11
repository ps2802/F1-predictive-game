-- Consolidated schema for Next.js + Supabase F1 Predictive Game
-- Includes required tables: races, predictions, profiles, results

create extension if not exists "pgcrypto";

-- Keep updated_at in sync across mutable tables.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Auto-create profile row when a new auth user is created.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username)
  values (new.id, null)
  on conflict (id) do nothing;

  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  points integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.races (
  id text primary key,
  round integer not null,
  name text not null,
  country text not null,
  race_date date not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.predictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id text not null references public.races(id) on delete cascade,
  first_driver text not null,
  second_driver text not null,
  third_driver text not null,
  points_awarded integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint predictions_user_race_unique unique (user_id, race_id),
  constraint predictions_distinct_podium check (
    first_driver <> second_driver
    and first_driver <> third_driver
    and second_driver <> third_driver
  )
);

create table if not exists public.results (
  race_id text primary key references public.races(id) on delete cascade,
  first_driver text not null,
  second_driver text not null,
  third_driver text not null,
  is_final boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint results_distinct_podium check (
    first_driver <> second_driver
    and first_driver <> third_driver
    and second_driver <> third_driver
  )
);

create index if not exists idx_predictions_race_id on public.predictions (race_id);
create index if not exists idx_predictions_user_id on public.predictions (user_id);

-- Attach updated_at triggers

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

drop trigger if exists races_set_updated_at on public.races;
create trigger races_set_updated_at
before update on public.races
for each row
execute function public.set_updated_at();

drop trigger if exists predictions_set_updated_at on public.predictions;
create trigger predictions_set_updated_at
before update on public.predictions
for each row
execute function public.set_updated_at();

drop trigger if exists results_set_updated_at on public.results;
create trigger results_set_updated_at
before update on public.results
for each row
execute function public.set_updated_at();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.races enable row level security;
alter table public.predictions enable row level security;
alter table public.results enable row level security;

-- Profiles: user can read and update only own profile
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- Races: authenticated users can read all races
drop policy if exists "races_read_all" on public.races;
create policy "races_read_all"
on public.races
for select
to authenticated
using (true);

-- Predictions: users can CRUD only their own predictions
drop policy if exists "predictions_select_own" on public.predictions;
create policy "predictions_select_own"
on public.predictions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "predictions_insert_own" on public.predictions;
create policy "predictions_insert_own"
on public.predictions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "predictions_update_own" on public.predictions;
create policy "predictions_update_own"
on public.predictions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "predictions_delete_own" on public.predictions;
create policy "predictions_delete_own"
on public.predictions
for delete
to authenticated
using (auth.uid() = user_id);

-- Results: authenticated users can read final standings
drop policy if exists "results_read_all" on public.results;
create policy "results_read_all"
on public.results
for select
to authenticated
using (true);

-- Seed races that match current app route IDs and code expectations
insert into public.races (id, round, name, country, race_date, is_locked)
values
  ('australia-2026', 1, 'Australian Grand Prix', 'Australia', '2026-03-15', false),
  ('japan-2026', 2, 'Japanese Grand Prix', 'Japan', '2026-03-29', false),
  ('bahrain-2026', 3, 'Bahrain Grand Prix', 'Bahrain', '2026-04-12', false)
on conflict (id) do update
set
  round = excluded.round,
  name = excluded.name,
  country = excluded.country,
  race_date = excluded.race_date,
  is_locked = excluded.is_locked,
  updated_at = now();
