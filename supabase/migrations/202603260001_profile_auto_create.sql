-- Auto-create a profiles row when a new auth.users entry is inserted.
-- Without this trigger, new sign-ups have no profile row and the dashboard
-- query (.single()) errors with PGRST116 — showing a blank error screen.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username, points, balance_usdc, is_admin)
  VALUES (NEW.id, NULL, 0, 0, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Fire after every new signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
