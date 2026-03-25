create table if not exists waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

-- Index for fast lookups
create index if not exists waitlist_email_idx on waitlist (email);

-- Row level security
alter table waitlist enable row level security;

-- Only service role can read waitlist entries
create policy "service_role_only" on waitlist
  using (false);
