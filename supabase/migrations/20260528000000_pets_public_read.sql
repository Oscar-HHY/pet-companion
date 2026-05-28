-- Bug fix: viewing another user's pet (from a friend chat, or by tapping an
-- avatar in the community) showed "no pet profile" even when that user HAD a pet.
--
-- Root cause: the pets SELECT policy only allowed owners to read their own row
-- (auth.uid() = user_id), so RLS silently filtered out every other user's pet.
-- getPetProfile() then got null and the screen rendered its empty state.
--
-- Pet profiles are a social/public surface: the community feed and friend
-- profiles let ANY authenticated user open them. The pets row holds only
-- name/breed/age/bio/photo/avatar/status — nothing sensitive. Health data lives
-- in separate owner-only tables (health_questionnaires, medical_records,
-- vaccinations, weight_records), which keep their own restrictive policies.
--
-- So: open SELECT to all authenticated users. INSERT/UPDATE/DELETE stay
-- owner-only (auth.uid() = user_id), so no one can modify another user's pet.

DROP POLICY IF EXISTS "Enable select for authenticated users only" ON public.pets;

CREATE POLICY "Authenticated users can view any pet profile"
  ON public.pets
  FOR SELECT
  TO authenticated
  USING (true);
