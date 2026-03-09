insert into public.races (id, round, name, country, race_date, is_locked)
values
  ('australia-2026', 1, 'Australian Grand Prix', 'Australia', '2026-03-15', false),
  ('japan-2026', 2, 'Japanese Grand Prix', 'Japan', '2026-03-29', false),
  ('bahrain-2026', 3, 'Bahrain Grand Prix', 'Bahrain', '2026-04-12', false)
on conflict (id) do update
set
  round = excluded.round,
  name = excluded.name,
  country = excluded.country,
  race_date = excluded.race_date,
  is_locked = excluded.is_locked;
