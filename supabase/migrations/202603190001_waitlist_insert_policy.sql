-- The existing "service_role_only" policy has no FOR clause, which means
-- it applies to ALL commands (including INSERT) with USING (false).
-- This silently blocks every anon insert.  Add an explicit insert policy.

create policy "allow_public_insert" on waitlist
  for insert
  with check (true);
