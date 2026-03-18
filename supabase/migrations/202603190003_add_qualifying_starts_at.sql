-- Add qualifying_starts_at to races table.
-- Safe to run on DBs that already have the column (IF NOT EXISTS).
-- Also adds grand_prix_name as an alias for races seeded via the seed-races script.
-- The column qualifying_starts_at is used to enforce prediction deadlines automatically
-- without requiring manual admin lock.

alter table public.races
  add column if not exists qualifying_starts_at timestamptz,
  add column if not exists grand_prix_name      text;
