-- Normalize prediction rosters to the official 2026 Formula 1 grid.
-- This updates future seeding and repairs unlocked question options without
-- breaking already-submitted answers.

-- Rename constructor labels in-place so existing selected options remain valid.
update public.prediction_options
set option_value = case option_value
  when 'Red Bull' then 'Red Bull Racing'
  when 'RB' then 'Racing Bulls'
  when 'Sauber' then 'Audi'
  when 'Haas' then 'Haas F1 Team'
  else option_value
end
where option_type = 'constructor'
  and option_value in ('Red Bull', 'RB', 'Sauber', 'Haas');

-- Normalize driver labels where the official 2026 naming changed.
update public.prediction_options
set option_value = case option_value
  when 'Andrea Kimi Antonelli' then 'Kimi Antonelli'
  when 'Nico Hülkenberg' then 'Nico Hulkenberg'
  else option_value
end
where option_type = 'driver'
  and option_value in ('Andrea Kimi Antonelli', 'Nico Hülkenberg');

create or replace function public.seed_race_questions(p_race_id text)
returns void
language plpgsql
security definer
as $$
declare
  v_q_id uuid;
  drivers text[] := array[
    'Max Verstappen', 'Isack Hadjar', 'Lando Norris', 'Oscar Piastri',
    'Charles Leclerc', 'Lewis Hamilton', 'George Russell', 'Kimi Antonelli',
    'Fernando Alonso', 'Lance Stroll', 'Alexander Albon', 'Carlos Sainz',
    'Oliver Bearman', 'Esteban Ocon', 'Nico Hulkenberg', 'Gabriel Bortoleto',
    'Liam Lawson', 'Arvid Lindblad', 'Pierre Gasly', 'Franco Colapinto',
    'Sergio Perez', 'Valtteri Bottas'
  ];
  constructors text[] := array[
    'Red Bull Racing', 'McLaren', 'Ferrari', 'Mercedes', 'Aston Martin',
    'Williams', 'Haas F1 Team', 'Audi', 'Racing Bulls', 'Alpine', 'Cadillac'
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

do $$
declare
  q record;
  d text;
  c text;
  i integer;
begin
  -- For unlocked races with no submitted answers yet, fully refresh the roster
  -- so users see the official 2026 grid instead of stale options.
  for q in
    select pq.id, pq.question_type
    from public.prediction_questions pq
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
      and coalesce(r.is_locked, false) = false
      and not exists (
        select 1
        from public.prediction_answers pa
        where pa.question_id = pq.id
      )
  loop
    if q.question_type in (
      'pole_sitter',
      'q1_elimination',
      'winner',
      'podium',
      'fastest_lap',
      'most_positions_gained',
      'p5_to_p10'
    ) then
      delete from public.prediction_options
      where question_id = q.id
        and option_type = 'driver';

      i := 1;
      foreach d in array array[
        'Max Verstappen', 'Isack Hadjar', 'Lando Norris', 'Oscar Piastri',
        'Charles Leclerc', 'Lewis Hamilton', 'George Russell', 'Kimi Antonelli',
        'Fernando Alonso', 'Lance Stroll', 'Alexander Albon', 'Carlos Sainz',
        'Oliver Bearman', 'Esteban Ocon', 'Nico Hulkenberg', 'Gabriel Bortoleto',
        'Liam Lawson', 'Arvid Lindblad', 'Pierre Gasly', 'Franco Colapinto',
        'Sergio Perez', 'Valtteri Bottas'
      ] loop
        insert into public.prediction_options (question_id, option_type, option_value, display_order)
        values (q.id, 'driver', d, i);
        i := i + 1;
      end loop;
    elsif q.question_type in ('both_cars_q3', 'top_constructor') then
      delete from public.prediction_options
      where question_id = q.id
        and option_type = 'constructor';

      i := 1;
      foreach c in array array[
        'Red Bull Racing', 'McLaren', 'Ferrari', 'Mercedes', 'Aston Martin',
        'Williams', 'Haas F1 Team', 'Audi', 'Racing Bulls', 'Alpine', 'Cadillac'
      ] loop
        insert into public.prediction_options (question_id, option_type, option_value, display_order)
        values (q.id, 'constructor', c, i);
        i := i + 1;
      end loop;
    end if;
  end loop;

  -- On unlocked races that already have answers, at least add missing current
  -- roster entries so new predictions are not blocked by an incomplete grid.
  for q in
    select pq.id, pq.question_type
    from public.prediction_questions pq
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
      and coalesce(r.is_locked, false) = false
  loop
    if q.question_type in (
      'pole_sitter',
      'q1_elimination',
      'winner',
      'podium',
      'fastest_lap',
      'most_positions_gained',
      'p5_to_p10'
    ) then
      i := 1;
      foreach d in array array[
        'Max Verstappen', 'Isack Hadjar', 'Lando Norris', 'Oscar Piastri',
        'Charles Leclerc', 'Lewis Hamilton', 'George Russell', 'Kimi Antonelli',
        'Fernando Alonso', 'Lance Stroll', 'Alexander Albon', 'Carlos Sainz',
        'Oliver Bearman', 'Esteban Ocon', 'Nico Hulkenberg', 'Gabriel Bortoleto',
        'Liam Lawson', 'Arvid Lindblad', 'Pierre Gasly', 'Franco Colapinto',
        'Sergio Perez', 'Valtteri Bottas'
      ] loop
        insert into public.prediction_options (question_id, option_type, option_value, display_order)
        select q.id, 'driver', d, i
        where not exists (
          select 1
          from public.prediction_options po
          where po.question_id = q.id
            and po.option_type = 'driver'
            and po.option_value = d
        );
        i := i + 1;
      end loop;
    elsif q.question_type in ('both_cars_q3', 'top_constructor') then
      i := 1;
      foreach c in array array[
        'Red Bull Racing', 'McLaren', 'Ferrari', 'Mercedes', 'Aston Martin',
        'Williams', 'Haas F1 Team', 'Audi', 'Racing Bulls', 'Alpine', 'Cadillac'
      ] loop
        insert into public.prediction_options (question_id, option_type, option_value, display_order)
        select q.id, 'constructor', c, i
        where not exists (
          select 1
          from public.prediction_options po
          where po.question_id = q.id
            and po.option_type = 'constructor'
            and po.option_value = c
        );
        i := i + 1;
      end loop;
    end if;
  end loop;
end;
$$;
