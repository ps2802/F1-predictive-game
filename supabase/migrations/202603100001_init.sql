create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  points integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.races (
  id text primary key,
  round integer not null,
  name text not null,
  country text not null,
  race_date date not null,
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
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
  constraint unique_user_race_prediction unique (user_id, race_id)
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists predictions_set_updated_at on public.predictions;
create trigger predictions_set_updated_at
before update on public.predictions
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.races enable row level security;
alter table public.predictions enable row level security;

create policy "profiles_select_own" on public.profiles
for select
using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
for update
using (auth.uid() = id)
with check (auth.uid() = id);

create policy "races_read_all" on public.races
for select
using (true);

create policy "predictions_select_own" on public.predictions
for select
using (auth.uid() = user_id);

create policy "predictions_insert_own" on public.predictions
for insert
with check (auth.uid() = user_id);

create policy "predictions_update_own" on public.predictions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
