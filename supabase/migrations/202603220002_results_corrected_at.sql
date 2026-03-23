-- Add corrected_at to results for audit trail.
-- Set automatically by trigger whenever p1/p2/p3 are updated after initial insert.

alter table public.results
  add column if not exists corrected_at timestamptz;

create or replace function public.set_results_corrected_at()
returns trigger
language plpgsql
as $$
begin
  -- Only stamp corrected_at on updates, not the original insert.
  new.corrected_at = now();
  return new;
end;
$$;

drop trigger if exists results_set_corrected_at on public.results;
create trigger results_set_corrected_at
before update of p1, p2, p3
on public.results
for each row
execute function public.set_results_corrected_at();
