-- Sync Gridlock to the official 2026 F1 grid:
-- 22 drivers, 11 teams, Cadillac included, Yuki Tsunoda removed.

create or replace function public.seed_race_questions(p_race_id text)
returns void
language plpgsql
security definer
as $$
declare
  v_q_id uuid;
  drivers text[] := array[
    'Lando Norris', 'Oscar Piastri', 'George Russell', 'Kimi Antonelli',
    'Max Verstappen', 'Isack Hadjar', 'Charles Leclerc', 'Lewis Hamilton',
    'Carlos Sainz', 'Alexander Albon', 'Liam Lawson', 'Arvid Lindblad',
    'Fernando Alonso', 'Lance Stroll', 'Esteban Ocon', 'Oliver Bearman',
    'Nico Hulkenberg', 'Gabriel Bortoleto', 'Pierre Gasly', 'Franco Colapinto',
    'Sergio Perez', 'Valtteri Bottas'
  ];
  constructors text[] := array[
    'McLaren', 'Mercedes', 'Red Bull Racing', 'Ferrari', 'Williams',
    'Racing Bulls', 'Aston Martin', 'Haas F1 Team', 'Audi', 'Alpine',
    'Cadillac'
  ];
  d text;
  c text;
  i integer;
begin
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

  v_q_id := null;
  insert into public.prediction_questions
    (race_id, category, question_type, label, base_points, confidence_tier, multi_select, display_order)
  values
    (p_race_id, 'chaos', 'p5_to_p10', 'P5-P10 Finishers (pick 2)', 10, 'chaos', 2, 21)
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
  driver_names text[] := array[
    'Lando Norris', 'Oscar Piastri', 'George Russell', 'Kimi Antonelli',
    'Max Verstappen', 'Isack Hadjar', 'Charles Leclerc', 'Lewis Hamilton',
    'Carlos Sainz', 'Alexander Albon', 'Liam Lawson', 'Arvid Lindblad',
    'Fernando Alonso', 'Lance Stroll', 'Esteban Ocon', 'Oliver Bearman',
    'Nico Hulkenberg', 'Gabriel Bortoleto', 'Pierre Gasly', 'Franco Colapinto',
    'Sergio Perez', 'Valtteri Bottas'
  ];
  constructor_names text[] := array[
    'McLaren', 'Mercedes', 'Red Bull Racing', 'Ferrari', 'Williams',
    'Racing Bulls', 'Aston Martin', 'Haas F1 Team', 'Audi', 'Alpine',
    'Cadillac'
  ];
  q record;
  item record;
begin
  for q in
    select pq.id
    from public.prediction_questions pq
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
      and coalesce(r.is_locked, false) = false
      and pq.question_type in (
        'pole_sitter', 'q1_elimination', 'winner', 'podium',
        'fastest_lap', 'most_positions_gained', 'p5_to_p10'
      )
  loop
    update public.prediction_options
    set option_value = 'Arvid Lindblad'
    where question_id = q.id
      and option_type = 'driver'
      and option_value = 'Yuki Tsunoda';

    delete from public.prediction_options po
    where po.question_id = q.id
      and po.option_type = 'driver'
      and po.option_value not in (select unnest(driver_names))
      and not exists (
        select 1 from public.prediction_answers pa where pa.option_id = po.id
      );

    for item in select * from unnest(driver_names) with ordinality as t(name, ord) loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      select q.id, 'driver', item.name, item.ord::integer
      where not exists (
        select 1 from public.prediction_options
        where question_id = q.id and option_type = 'driver' and option_value = item.name
      );

      update public.prediction_options
      set display_order = item.ord::integer
      where question_id = q.id and option_type = 'driver' and option_value = item.name;
    end loop;
  end loop;

  for q in
    select pq.id
    from public.prediction_questions pq
    join public.races r on r.id = pq.race_id
    where coalesce(r.race_locked, false) = false
      and coalesce(r.is_locked, false) = false
      and pq.question_type in ('both_cars_q3', 'top_constructor')
  loop
    for item in select * from unnest(constructor_names) with ordinality as t(name, ord) loop
      insert into public.prediction_options (question_id, option_type, option_value, display_order)
      select q.id, 'constructor', item.name, item.ord::integer
      where not exists (
        select 1 from public.prediction_options
        where question_id = q.id and option_type = 'constructor' and option_value = item.name
      );

      update public.prediction_options
      set display_order = item.ord::integer
      where question_id = q.id and option_type = 'constructor' and option_value = item.name;
    end loop;
  end loop;
end;
$$;
