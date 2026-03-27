-- =============================================================================
-- SECURITY + PREDICTION INTEGRITY FOLLOW-UP
-- =============================================================================

-- Prevent browser clients from mutating privileged profile columns directly.
revoke update on public.profiles from authenticated, anon;
grant update (username, avatar_url) on public.profiles to authenticated;

-- Backfill prediction_versions so each prediction has a strict version sequence.
with ranked_versions as (
  select
    id,
    row_number() over (
      partition by prediction_id
      order by created_at asc, id asc
    ) as next_version_number
  from public.prediction_versions
)
update public.prediction_versions pv
set version_number = ranked_versions.next_version_number
from ranked_versions
where pv.id = ranked_versions.id
  and pv.version_number is distinct from ranked_versions.next_version_number;

alter table public.prediction_versions
  drop constraint if exists prediction_versions_prediction_id_version_number_key;

alter table public.prediction_versions
  add constraint prediction_versions_prediction_id_version_number_key
  unique (prediction_id, version_number);

-- Only activate draft predictions for races that are still open.
create or replace function public.activate_user_predictions(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.predictions p
  set status = 'active',
      updated_at = now()
  from public.races r
  where p.user_id = p_user_id
    and p.status = 'draft'
    and r.id = p.race_id
    and coalesce(r.race_locked, false) = false
    and (
      r.qualifying_starts_at is null
      or r.qualifying_starts_at > now()
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
