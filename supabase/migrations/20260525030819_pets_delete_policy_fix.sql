-- The "Enable delete for authenticated users only" policy on public.pets was
-- mislabeled FOR INSERT (same copy-paste bug found earlier on pet_activities).
-- DELETEs against pets were silently rejected by RLS. Drop the broken policy
-- and add a real FOR DELETE policy.
--
-- Audit query that uncovered it (Part 4.4 sweep):
--   SELECT tablename, policyname, cmd FROM pg_policies WHERE schemaname='public';

DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.pets;

CREATE POLICY "pets delete own rows"
  ON public.pets
  FOR DELETE
  TO authenticated
  USING (((auth.uid())::text = user_id));

-- DELETE table grant already exists for authenticated (verified in sweep),
-- so no GRANT statement needed here.
