-- =============================================================================
-- HARDENING MIGRATION — fixes schema issues discovered during audit
-- =============================================================================

-- ────────────────────────────────────────────────────────────
-- FIX 1: Make old predictions columns nullable
-- The new prediction_answers table replaces first/second/third_driver.
-- These columns must be nullable so v2 API upserts don't violate NOT NULL.
-- ────────────────────────────────────────────────────────────
alter table public.predictions
  alter column first_driver  drop not null,
  alter column second_driver drop not null,
  alter column third_driver  drop not null;

-- FIX 2: Drop the old podium check constraint (incompatible with nullable columns)
alter table public.predictions
  drop constraint if exists predictions_distinct_podium;

-- ────────────────────────────────────────────────────────────
-- FIX 3: Unique constraint on prediction_questions(race_id, question_type)
-- Prevents duplicate questions being seeded on repeated migration runs.
-- ────────────────────────────────────────────────────────────
alter table public.prediction_questions
  drop constraint if exists pq_race_question_type_unique;

alter table public.prediction_questions
  add constraint pq_race_question_type_unique unique (race_id, question_type);

-- ────────────────────────────────────────────────────────────
-- FIX 4: Add compute_pick_popularity RPC
-- Called by settlement when no pre-frozen snapshot exists.
-- Returns popularity_percent = pick_count / total_active_entries
-- ────────────────────────────────────────────────────────────
create or replace function public.compute_pick_popularity(p_race_id text)
returns table (
  question_id       uuid,
  option_id         uuid,
  popularity_percent numeric
)
language plpgsql
as $$
declare
  v_total integer;
begin
  -- Count distinct active predictions for this race
  select count(*)
  into v_total
  from public.predictions
  where race_id = p_race_id
    and status = 'active';

  if v_total = 0 then
    return; -- empty result set
  end if;

  return query
  select
    pa.question_id,
    pa.option_id,
    (count(*)::numeric / v_total)::numeric as popularity_percent
  from public.prediction_answers pa
  join public.predictions p on p.id = pa.prediction_id
  where p.race_id = p_race_id
    and p.status = 'active'
  group by pa.question_id, pa.option_id;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- FIX 5: RLS INSERT policies for admin-written tables
-- Admin APIs use service_role key (bypasses RLS entirely), but adding
-- explicit admin policies here as belt-and-suspenders.
-- ────────────────────────────────────────────────────────────

-- race_results: only admins insert
drop policy if exists "rr_insert_admin" on public.race_results;
create policy "rr_insert_admin" on public.race_results
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "rr_delete_admin" on public.race_results;
create policy "rr_delete_admin" on public.race_results
  for delete to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- race_scores: only admins insert/upsert
drop policy if exists "rs_insert_admin" on public.race_scores;
create policy "rs_insert_admin" on public.race_scores
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "rs_update_admin" on public.race_scores;
create policy "rs_update_admin" on public.race_scores
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- league_scores: only admins insert/update
drop policy if exists "ls_insert_admin" on public.league_scores;
create policy "ls_insert_admin" on public.league_scores
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

drop policy if exists "ls_update_admin" on public.league_scores;
create policy "ls_update_admin" on public.league_scores
  for update to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- pick_popularity_snapshots: only admins insert
drop policy if exists "pps_insert_admin" on public.pick_popularity_snapshots;
create policy "pps_insert_admin" on public.pick_popularity_snapshots
  for insert to authenticated
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- ────────────────────────────────────────────────────────────
-- FIX 6: predictions INSERT/UPDATE RLS needs status column allowed
-- (predictions already has RLS from 202603110001 — ensure it covers new cols)
-- No change needed: existing "predictions_insert_own" allows all columns.
-- ────────────────────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────
-- FIX 7: Add updated_at triggers for tables that were missing them
-- ────────────────────────────────────────────────────────────
drop trigger if exists race_scores_set_updated_at on public.race_scores;
-- race_scores doesn't have updated_at — uses calculated_at instead. Skip.

-- ────────────────────────────────────────────────────────────
-- FIX 8: Atomic prize pool increment (avoids read-then-write race condition)
-- ────────────────────────────────────────────────────────────
create or replace function public.increment_prize_pool(p_league_id uuid, p_amount numeric)
returns void
language sql
security definer
as $$
  update public.leagues
  set prize_pool = prize_pool + p_amount
  where id = p_league_id;
$$;

-- ────────────────────────────────────────────────────────────
-- VERIFY: leaderboard view references race_scores (new table)
-- Drop old leaderboard that referenced predictions.points_awarded
-- Already handled in 202603190001_prd_full_schema.sql
-- ────────────────────────────────────────────────────────────
