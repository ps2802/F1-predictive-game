-- Migration: draft → active prediction state machine + league payment enforcement
--
-- 1. Update league_leaderboard view to only include paid members
-- 2. Add helper function to activate draft predictions for a user

-- ============================================================
-- 1. LEAGUE LEADERBOARD: only paid members appear
-- ============================================================
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
where lm.paid = true
group by lm.league_id, pr.id, pr.username, pr.avatar_url
order by total_score desc;

-- ============================================================
-- 2. ACTIVATE DRAFT PREDICTIONS for a user
--    Called after successful league join (paid=true).
--    Flips all 'draft' predictions to 'active' so they are
--    eligible for scoring and popularity calculations.
-- ============================================================
create or replace function public.activate_user_predictions(p_user_id uuid)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.predictions
  set status = 'active',
      updated_at = now()
  where user_id = p_user_id
    and status = 'draft';

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
