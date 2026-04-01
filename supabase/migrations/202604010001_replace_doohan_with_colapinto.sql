-- Replace Jack Doohan with Franco Colapinto as permanent Alpine driver.
-- Colapinto (#43) is the confirmed 2026 Alpine seat after replacing Doohan post-round 1.

-- ── 1. Update seed_race_questions to use Franco Colapinto ────────────────────
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
    'Yuki Tsunoda', 'Isack Hadjar', 'Pierre Gasly', 'Franco Colapinto'
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

-- ── 2. Replace Jack Doohan with Franco Colapinto in all existing options ──────
-- Only touches unlocked races (locked races already have submitted answers).
update public.prediction_options
set option_value = 'Franco Colapinto'
where option_type = 'driver'
  and option_value = 'Jack Doohan'
  and question_id in (
    select po.question_id
    from public.prediction_options po
    join public.prediction_questions pq on pq.id = po.question_id
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
  );
