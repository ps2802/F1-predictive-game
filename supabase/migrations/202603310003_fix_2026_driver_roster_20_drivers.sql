-- Fix 2026 F1 driver roster to the correct 20 drivers.
-- Removes Arvid Lindblad, Franco Colapinto, Sergio Perez, Valtteri Bottas.
-- Adds Yuki Tsunoda, Jack Doohan.
-- Also removes Cadillac from constructor list (not an official 2026 team in this game).
-- Applies to all unlocked prediction_options with no submitted answers.

-- ── 1. Update seed_race_questions to the correct 20 drivers ──────────────────
create or replace function public.seed_race_questions(p_race_id text)
returns void
language plpgsql
security definer
as $$
declare
  v_q_id uuid;
  drivers text[] := array[
    'Max Verstappen', 'Liam Lawson', 'Lando Norris', 'Oscar Piastri',
    'Charles Leclerc', 'Lewis Hamilton', 'George Russell', 'Kimi Antonelli',
    'Fernando Alonso', 'Lance Stroll', 'Alexander Albon', 'Carlos Sainz',
    'Oliver Bearman', 'Esteban Ocon', 'Nico Hulkenberg', 'Gabriel Bortoleto',
    'Yuki Tsunoda', 'Isack Hadjar', 'Pierre Gasly', 'Jack Doohan'
  ];
  constructors text[] := array[
    'Red Bull Racing', 'McLaren', 'Ferrari', 'Mercedes', 'Aston Martin',
    'Williams', 'Haas F1 Team', 'Audi', 'Racing Bulls', 'Alpine'
  ];
  d text;
  c text;
  i integer;
begin
  -- Pole Sitter
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

  -- Constructor with Both Cars in Q3
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

  -- Q1 Eliminations
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

  -- Race Winner
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

  -- Podium P2 & P3
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

  -- Fastest Lap
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

  -- Most Positions Gained
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

  -- Top Scoring Constructor
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

  -- Number of Safety Cars
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

  -- P5–P10 Finishers
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

-- ── 2. Fix existing unlocked race options in-place ──────────────────────────
-- For driver questions: remove the 4 wrong drivers, add the 2 missing ones.
-- Only touches questions with no submitted answers (safe to modify).
do $$
declare
  q record;
  i integer;
begin
  for q in
    select pq.id, pq.question_type
    from public.prediction_questions pq
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
      and coalesce(r.is_locked, false) = false
      and pq.question_type in (
        'pole_sitter', 'q1_elimination', 'winner', 'podium',
        'fastest_lap', 'most_positions_gained', 'p5_to_p10'
      )
  loop
    -- Remove the 4 drivers that are not on the 2026 grid
    delete from public.prediction_options
    where question_id = q.id
      and option_type = 'driver'
      and option_value in ('Arvid Lindblad', 'Franco Colapinto', 'Sergio Perez', 'Valtteri Bottas');

    -- Add Yuki Tsunoda if missing
    insert into public.prediction_options (question_id, option_type, option_value, display_order)
    select q.id, 'driver', 'Yuki Tsunoda', 19
    where not exists (
      select 1 from public.prediction_options
      where question_id = q.id and option_type = 'driver' and option_value = 'Yuki Tsunoda'
    );

    -- Add Jack Doohan if missing
    insert into public.prediction_options (question_id, option_type, option_value, display_order)
    select q.id, 'driver', 'Jack Doohan', 20
    where not exists (
      select 1 from public.prediction_options
      where question_id = q.id and option_type = 'driver' and option_value = 'Jack Doohan'
    );
  end loop;

  -- Remove Cadillac from constructor questions on unlocked races
  for q in
    select pq.id
    from public.prediction_questions pq
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
      and coalesce(r.is_locked, false) = false
      and pq.question_type in ('both_cars_q3', 'top_constructor')
  loop
    delete from public.prediction_options
    where question_id = q.id
      and option_type = 'constructor'
      and option_value = 'Cadillac';
  end loop;
end;
$$;
