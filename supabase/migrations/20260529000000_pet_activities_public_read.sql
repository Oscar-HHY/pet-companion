-- Bug fix (follow-up to 20260528000000_pets_public_read): viewing another
-- user's pet profile showed an empty activity/companion history even though
-- that pet HAD logged activities.
--
-- Root cause: same as the pets bug. The pet_activities SELECT policy only let
-- owners read their own rows (auth.uid()::text = user_id), so RLS silently
-- filtered out every other user's activity rows. PetProfileScreen calls
-- getPetActivities(profileUserId) for friends' pets too (the section renders as
-- "pet_activity_log"), so the timeline came back empty.
--
-- Pet profiles are already a public/social surface (pets SELECT is USING(true)),
-- and pet_activities holds only low-sensitivity interaction logs (walked, fed,
-- bathed, played + timestamps/durations) — nothing private. Health data lives in
-- separate owner-only tables and keeps its restrictive policies.
--
-- So: open SELECT to all authenticated users. INSERT/UPDATE/DELETE stay
-- owner-only (auth.uid()::text = user_id), so no one can modify another user's
-- activity log.

DROP POLICY IF EXISTS "Enable select for authenticated users only" ON public.pet_activities;

CREATE POLICY "Authenticated users can view any pet activities"
  ON public.pet_activities
  FOR SELECT
  TO authenticated
  USING (true);
