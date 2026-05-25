-- Add duration column for tracking how long a companion activity ran.
-- Older rows have NULL duration (no recorded duration before this migration).
ALTER TABLE public.pet_activities
  ADD COLUMN IF NOT EXISTS duration_seconds integer;

-- The original "Enable delete..." policy was mislabeled FOR INSERT, so DELETEs
-- silently failed. Drop the broken one and add a real DELETE policy.
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON public.pet_activities;

CREATE POLICY "pet_activities delete own rows"
  ON public.pet_activities
  FOR DELETE
  TO authenticated
  USING (((auth.uid())::text = user_id));

-- Ensure DELETE privilege is granted (RLS isn't a substitute for table privileges).
GRANT DELETE ON public.pet_activities TO authenticated;
