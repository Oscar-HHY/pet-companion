-- Grant table privileges on the compliance tables.
-- The previous migration created tables + RLS but didn't grant table privileges
-- to the `authenticated` role, so PostgREST returned "permission denied" before
-- it ever got to evaluate RLS policies. This adds the missing grants so the
-- existing INSERT/SELECT/DELETE policies actually take effect.

GRANT SELECT, INSERT ON public.content_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_users TO authenticated;

-- Identity columns use implicit sequences; grant usage so INSERTs can generate ids.
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Make sure future tables in this schema get the standard grants too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
