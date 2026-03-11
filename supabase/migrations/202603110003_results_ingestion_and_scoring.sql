-- Results ingestion + automatic scoring

create table if not exists public.results (
  race_id text primary key references public.races(id) on delete cascade,
  p1 text not null,
  p2 text not null,
  p3 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backward compatibility: if old column names exist, rename them.
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'first_driver'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'p1'
  ) then
    alter table public.results rename column first_driver to p1;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'second_driver'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'p2'
  ) then
    alter table public.results rename column second_driver to p2;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'third_driver'
  ) and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'results'
      and column_name = 'p3'
  ) then
    alter table public.results rename column third_driver to p3;
  end if;
end
$$;

alter table public.results
  add column if not exists p1 text,
  add column if not exists p2 text,
  add column if not exists p3 text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.results
set updated_at = now()
where updated_at is null;

alter table public.results
  alter column p1 set not null,
  alter column p2 set not null,
  alter column p3 set not null,
  alter column updated_at set not null;

alter table public.predictions
  add column if not exists points_awarded integer not null default 0;

alter table public.results
  drop constraint if exists results_distinct_podium;

alter table public.results
  add constraint results_distinct_podium
  check (p1 <> p2 and p1 <> p3 and p2 <> p3);

create or replace function public.apply_result_scores()
returns trigger
language plpgsql
as $$
begin
  update public.predictions p
  set
    points_awarded = (
      case
        when p.first_driver = new.p1 then 3
        when p.first_driver in (new.p2, new.p3) then 1
        else 0
      end
      +
      case
        when p.second_driver = new.p2 then 3
        when p.second_driver in (new.p1, new.p3) then 1
        else 0
      end
      +
      case
        when p.third_driver = new.p3 then 3
        when p.third_driver in (new.p1, new.p2) then 1
        else 0
      end
    ),
    updated_at = now()
  where p.race_id = new.race_id;

  return new;
end;
$$;

drop trigger if exists results_apply_scores on public.results;
create trigger results_apply_scores
after insert or update of p1, p2, p3
on public.results
for each row
execute function public.apply_result_scores();

-- Recompute all existing scored predictions in case this migration is run after data already exists.
update public.predictions p
set
  points_awarded = (
    case
      when p.first_driver = r.p1 then 3
      when p.first_driver in (r.p2, r.p3) then 1
      else 0
    end
    +
    case
      when p.second_driver = r.p2 then 3
      when p.second_driver in (r.p1, r.p3) then 1
      else 0
    end
    +
    case
      when p.third_driver = r.p3 then 3
      when p.third_driver in (r.p1, r.p2) then 1
      else 0
    end
  ),
  updated_at = now()
from public.results r
where r.race_id = p.race_id;

drop view if exists public.leaderboard;

create view public.leaderboard as
select
  pr.id as user_id,
  pr.username,
  coalesce(sum(p.points_awarded), 0)::integer as total_points
from public.profiles pr
left join public.predictions p on p.user_id = pr.id
group by pr.id, pr.username
order by total_points desc, pr.id;
