-- Security hardening (pre-launch), from get_advisors:
--
-- #1  The `avatars` and `pets` storage buckets each had a single policy
--     (allow_all_avatars / allow_all_pets) defined FOR ALL to the `public`
--     role with only a bucket_id check and NO owner restriction. That let
--     ANY caller — including unauthenticated `anon` — list, upload, overwrite,
--     and DELETE any file in those buckets (enumerate everyone's photos, or
--     wipe/replace another user's pet photo/avatar, or dump junk for cost abuse).
--
--     Both buckets are public, and the app only ever reads them via
--     getPublicUrl() (the public object endpoint bypasses RLS), so we do NOT
--     need a broad SELECT policy for reads to keep working. Uploads use
--     filenames of the form `${userId}/...`, so we scope all write ops (and a
--     narrow SELECT) to the caller's own `${userId}/` folder.
--
-- #2  rls_auto_enable() is a SECURITY DEFINER admin/dev utility that was
--     callable from the public REST API by anon/authenticated. Revoke that.

-- ── #1: storage lockdown ───────────────────────────────────────────────
drop policy if exists "allow_all_avatars" on storage.objects;
drop policy if exists "allow_all_pets" on storage.objects;

-- avatars: owner-scoped (files live under `${auth.uid()}/...`)
create policy "avatars_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (auth.uid())::text);

-- pets: same owner-scoped model
create policy "pets_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'pets' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "pets_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'pets' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "pets_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'pets' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'pets' and (storage.foldername(name))[1] = (auth.uid())::text);
create policy "pets_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'pets' and (storage.foldername(name))[1] = (auth.uid())::text);

-- ── #2: revoke public execute on the admin utility function ────────────
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;
