-- =============================================================================
-- RACE STATUS COLUMN
-- Adds a status column to races to track lifecycle: upcoming → active → completed.
-- "active" = qualifying is underway, predictions are locked.
-- "completed" = race finished (~4 hours after race_date), results are final.
-- =============================================================================

alter table public.races
  add column if not exists status text not null default 'upcoming'
  check (status in ('upcoming', 'active', 'completed'));

-- Back-fill completed races (race was more than 4 hours ago).
update public.races
set status = 'completed'
where race_date < now() - interval '4 hours';

-- Back-fill active races (qualifying started, race not yet done).
update public.races
set status = 'active'
where race_locked = true
  and qualifying_starts_at < now()
  and status = 'upcoming';
