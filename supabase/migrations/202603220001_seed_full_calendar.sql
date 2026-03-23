-- Seed the complete 2026 F1 calendar (23 rounds) so every race in lib/races.ts
-- has a corresponding DB row. ON CONFLICT DO NOTHING is safe to re-run.

insert into public.races (id, round, name, country, race_date, is_locked)
values
  ('australia-2026',   1,  'Australian Grand Prix',   'Australia',    '2026-03-15', true),
  ('china-2026',       2,  'Chinese Grand Prix',       'China',        '2026-03-22', true),
  ('japan-2026',       3,  'Japanese Grand Prix',      'Japan',        '2026-04-05', false),
  ('bahrain-2026',     4,  'Bahrain Grand Prix',       'Bahrain',      '2026-04-19', false),
  ('saudi-2026',       5,  'Saudi Arabian Grand Prix', 'Saudi Arabia', '2026-05-03', false),
  ('miami-2026',       6,  'Miami Grand Prix',         'USA',          '2026-05-17', false),
  ('monaco-2026',      7,  'Monaco Grand Prix',        'Monaco',       '2026-05-31', false),
  ('spain-2026',       8,  'Spanish Grand Prix',       'Spain',        '2026-06-14', false),
  ('canada-2026',      9,  'Canadian Grand Prix',      'Canada',       '2026-06-21', false),
  ('austria-2026',     10, 'Austrian Grand Prix',      'Austria',      '2026-07-05', false),
  ('britain-2026',     11, 'British Grand Prix',       'Britain',      '2026-07-12', false),
  ('belgium-2026',     12, 'Belgian Grand Prix',       'Belgium',      '2026-07-26', false),
  ('hungary-2026',     13, 'Hungarian Grand Prix',     'Hungary',      '2026-08-02', false),
  ('netherlands-2026', 14, 'Dutch Grand Prix',         'Netherlands',  '2026-08-30', false),
  ('italy-2026',       15, 'Italian Grand Prix',       'Italy',        '2026-09-06', false),
  ('azerbaijan-2026',  16, 'Azerbaijan Grand Prix',    'Azerbaijan',   '2026-09-20', false),
  ('singapore-2026',   17, 'Singapore Grand Prix',     'Singapore',    '2026-10-04', false),
  ('usa-2026',         18, 'United States Grand Prix', 'USA',          '2026-10-18', false),
  ('mexico-2026',      19, 'Mexico City Grand Prix',   'Mexico',       '2026-11-01', false),
  ('brazil-2026',      20, 'São Paulo Grand Prix',     'Brazil',       '2026-11-15', false),
  ('las-vegas-2026',   21, 'Las Vegas Grand Prix',     'USA',          '2026-11-22', false),
  ('qatar-2026',       22, 'Qatar Grand Prix',         'Qatar',        '2026-11-29', false),
  ('abu-dhabi-2026',   23, 'Abu Dhabi Grand Prix',     'UAE',          '2026-12-06', false)
on conflict (id) do nothing;
