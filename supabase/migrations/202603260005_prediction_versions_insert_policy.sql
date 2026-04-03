-- Allow authenticated users to persist immutable version snapshots
-- for predictions they own. Without this policy, the v2 submit path
-- can read version history but not append new snapshots under RLS.
alter table public.prediction_versions enable row level security;

drop policy if exists "pv_insert_own" on public.prediction_versions;
create policy "pv_insert_own" on public.prediction_versions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.predictions p
      where p.id = prediction_id
        and p.user_id = auth.uid()
    )
  );
