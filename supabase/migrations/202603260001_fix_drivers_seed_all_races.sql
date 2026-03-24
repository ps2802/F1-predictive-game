-- Migration: fix driver roster + seed questions for all unseeded races
--
-- 1. Replace Valtteri Bottas (no 2026 seat) with Pierre Gasly (Alpine 2026)
--    in any already-seeded prediction_options rows.
-- 2. Update the seed_race_questions() function to use the correct 2026 roster.
-- 3. Seed questions for every race that currently has 0 questions.

-- ============================================================
-- 1. FIX EXISTING OPTIONS: Bottas → Gasly
-- ============================================================
update public.prediction_options
set option_value = 'Pierre Gasly'
where option_value = 'Valtteri Bottas'
  and option_type = 'driver';

-- ============================================================
-- 2. UPDATE seed_race_questions TO USE CORRECT 2026 ROSTER
-- ============================================================
create or replace function public.seed_race_questions(p_race_id text)
returns void
language plpgsql
security definer
as $$
declare
  v_q_id  uuid;
  drivers text[] := array[
    'Max Verstappen', 'Liam Lawson', 'Lando Norris', 'Oscar Piastri',
    'Charles Leclerc', 'Lewis Hamilton', 'George Russell', 'Andrea Kimi Antonelli',
    'Fernando Alonso', 'Lance Stroll', 'Carlos Sainz', 'Alexander Albon',
    'Nico Hülkenberg', 'Oliver Bearman', 'Yuki Tsunoda', 'Isack Hadjar',
    'Esteban Ocon', 'Jack Doohan', 'Gabriel Bortoleto', 'Pierre Gasly'
  ];
  constructors text[] := array[
    'Red Bull', 'McLaren', 'Ferrari', 'Mercedes',
    'Aston Martin', 'Williams', 'Haas', 'RB', 'Alpine', 'Sauber'
  ];
  d text;
  c text;
  i integer;
begin
  -- ── QUALIFYING ──────────────────────────────────────────

  -- Pole Sitter (single-select driver)
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'qualifying', 'pole_sitter', 'Pole Sitter', 12, 'medium', 1, 1)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- Constructor with Both Cars in Q3 (pick 2 constructors)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'qualifying', 'both_cars_q3', 'Constructor with Both Cars in Q3', 10, 'medium', 2, 2)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach c in array constructors loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'constructor', c, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- Q1 Eliminations (pick 2 drivers)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'qualifying', 'q1_elimination', 'Q1 Eliminations', 8, 'high', 2, 3)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- ── RACE ───────────────────────────────────────────────

  -- Race Winner (single-select driver)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'winner', 'Race Winner', 20, 'medium', 1, 10)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- Podium P2 & P3 (pick 2 drivers)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'podium', 'Podium Finishers (P2 & P3)', 15, 'medium', 2, 11)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- Fastest Lap (single-select driver)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'fastest_lap', 'Fastest Lap', 12, 'high', 1, 12)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- Most Positions Gained (single-select driver)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'most_positions_gained', 'Most Positions Gained', 12, 'high', 1, 13)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- Top Scoring Constructor (single-select constructor)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'race', 'top_constructor', 'Top Scoring Constructor', 10, 'medium', 1, 14)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach c in array constructors loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'constructor', c, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

  -- ── CHAOS ──────────────────────────────────────────────

  -- Number of Safety Cars (single-select numeric)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'chaos', 'safety_cars', 'Number of Safety Cars', 10, 'chaos', 1, 20)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    insert into public.prediction_options (question_id, option_type, option_value, display_order)
    values
      (v_q_id, 'number', '0', 1),
      (v_q_id, 'number', '1', 2),
      (v_q_id, 'number', '2', 3),
      (v_q_id, 'number', '3+', 4)
    on conflict do nothing;
  end if;

  -- P5–P10 Finishers (pick 2 drivers)
  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'chaos', 'p5_to_p10', 'P5–P10 Finishers (pick 2)', 10, 'chaos', 2, 21)
  on conflict do nothing
  returning id into v_q_id;

  if v_q_id is not null then
    i := 1;
    foreach d in array drivers loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      values (v_q_id, 'driver', d, i) on conflict do nothing;
      i := i + 1;
    end loop;
  end if;

end;
$$;

-- ============================================================
-- 3. SEED all races that currently have 0 questions
-- ============================================================
do $$
declare
  r   public.races%rowtype;
  cnt integer;
begin
  for r in select * from public.races loop
    select count(*) into cnt
    from public.prediction_questions
    where race_id = r.id;

    if cnt = 0 then
      perform public.seed_race_questions(r.id);
    end if;
  end loop;
end;
$$;
