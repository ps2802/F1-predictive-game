-- Normalize the 2026 calendar to the latest official Formula 1 schedule.
-- This keeps existing race IDs stable where possible and adds the new Madrid
-- round so already-seeded environments can be corrected without a full reset.

insert into public.races (
  id,
  season,
  round,
  name,
  grand_prix_name,
  country,
  race_date,
  is_locked,
  race_locked
)
values
  ('australia-2026', 2026, 1, 'Australian Grand Prix', 'Australian Grand Prix', 'Australia', '2026-03-08', true, true),
  ('china-2026', 2026, 2, 'Chinese Grand Prix', 'Chinese Grand Prix', 'China', '2026-03-15', true, true),
  ('japan-2026', 2026, 3, 'Japanese Grand Prix', 'Japanese Grand Prix', 'Japan', '2026-03-29', false, false),
  ('bahrain-2026', 2026, 4, 'Bahrain Grand Prix', 'Bahrain Grand Prix', 'Bahrain', '2026-04-12', false, false),
  ('saudi-2026', 2026, 5, 'Saudi Arabian Grand Prix', 'Saudi Arabian Grand Prix', 'Saudi Arabia', '2026-04-19', false, false),
  ('miami-2026', 2026, 6, 'Miami Grand Prix', 'Miami Grand Prix', 'United States', '2026-05-03', false, false),
  ('canada-2026', 2026, 7, 'Canadian Grand Prix', 'Canadian Grand Prix', 'Canada', '2026-05-24', false, false),
  ('monaco-2026', 2026, 8, 'Monaco Grand Prix', 'Monaco Grand Prix', 'Monaco', '2026-06-07', false, false),
  ('spain-2026', 2026, 9, 'Barcelona-Catalunya Grand Prix', 'Barcelona-Catalunya Grand Prix', 'Spain', '2026-06-14', false, false),
  ('austria-2026', 2026, 10, 'Austrian Grand Prix', 'Austrian Grand Prix', 'Austria', '2026-06-28', false, false),
  ('britain-2026', 2026, 11, 'British Grand Prix', 'British Grand Prix', 'United Kingdom', '2026-07-05', false, false),
  ('belgium-2026', 2026, 12, 'Belgian Grand Prix', 'Belgian Grand Prix', 'Belgium', '2026-07-19', false, false),
  ('hungary-2026', 2026, 13, 'Hungarian Grand Prix', 'Hungarian Grand Prix', 'Hungary', '2026-07-26', false, false),
  ('netherlands-2026', 2026, 14, 'Dutch Grand Prix', 'Dutch Grand Prix', 'Netherlands', '2026-08-23', false, false),
  ('italy-2026', 2026, 15, 'Italian Grand Prix', 'Italian Grand Prix', 'Italy', '2026-09-06', false, false),
  ('madrid-2026', 2026, 16, 'Spanish Grand Prix', 'Spanish Grand Prix', 'Spain', '2026-09-13', false, false),
  ('azerbaijan-2026', 2026, 17, 'Azerbaijan Grand Prix', 'Azerbaijan Grand Prix', 'Azerbaijan', '2026-09-26', false, false),
  ('singapore-2026', 2026, 18, 'Singapore Grand Prix', 'Singapore Grand Prix', 'Singapore', '2026-10-11', false, false),
  ('usa-2026', 2026, 19, 'United States Grand Prix', 'United States Grand Prix', 'United States', '2026-10-25', false, false),
  ('mexico-2026', 2026, 20, 'Mexico City Grand Prix', 'Mexico City Grand Prix', 'Mexico', '2026-11-01', false, false),
  ('brazil-2026', 2026, 21, 'São Paulo Grand Prix', 'São Paulo Grand Prix', 'Brazil', '2026-11-08', false, false),
  ('las-vegas-2026', 2026, 22, 'Las Vegas Grand Prix', 'Las Vegas Grand Prix', 'United States', '2026-11-21', false, false),
  ('qatar-2026', 2026, 23, 'Qatar Grand Prix', 'Qatar Grand Prix', 'Qatar', '2026-11-29', false, false),
  ('abu-dhabi-2026', 2026, 24, 'Abu Dhabi Grand Prix', 'Abu Dhabi Grand Prix', 'United Arab Emirates', '2026-12-06', false, false)
on conflict (id) do update
set
  season = excluded.season,
  round = excluded.round,
  name = excluded.name,
  grand_prix_name = excluded.grand_prix_name,
  country = excluded.country,
  race_date = excluded.race_date,
  is_locked = public.races.is_locked or excluded.is_locked,
  race_locked = public.races.race_locked or excluded.race_locked,
  updated_at = now();
