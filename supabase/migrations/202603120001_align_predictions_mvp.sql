alter table public.predictions
  add column if not exists first_driver text,
  add column if not exists second_driver text,
  add column if not exists third_driver text,
  add column if not exists points_awarded integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'predictions_user_id_race_id_key'
      and conrelid = 'public.predictions'::regclass
  ) then
    alter table public.predictions
      add constraint predictions_user_id_race_id_key unique (user_id, race_id);
  end if;
end
$$;
