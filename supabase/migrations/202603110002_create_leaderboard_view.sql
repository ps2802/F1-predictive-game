drop view if exists public.leaderboard;

create view public.leaderboard as
with scored_predictions as (
  select
    p.user_id,
    (
      case
        when p.first_driver = r.first_driver then 3
        when p.first_driver in (r.second_driver, r.third_driver) then 1
        else 0
      end
      +
      case
        when p.second_driver = r.second_driver then 3
        when p.second_driver in (r.first_driver, r.third_driver) then 1
        else 0
      end
      +
      case
        when p.third_driver = r.third_driver then 3
        when p.third_driver in (r.first_driver, r.second_driver) then 1
        else 0
      end
    )::integer as race_points
  from public.predictions p
  join public.results r on r.race_id = p.race_id
  where r.is_final = true
)
select
  sp.user_id,
  pr.username,
  coalesce(sum(sp.race_points), 0)::integer as total_points
from scored_predictions sp
left join public.profiles pr on pr.id = sp.user_id
group by sp.user_id, pr.username
order by total_points desc, sp.user_id;
