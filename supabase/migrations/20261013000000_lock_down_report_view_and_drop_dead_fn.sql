-- 1. content_reports_with_content is a SECURITY DEFINER moderation view (it
--    bypasses RLS and shows reporter names plus up to 300 chars of the reported
--    post / comment / PRIVATE chat message). It was readable by every signed-in
--    user. The app never queries it; only the dashboard (postgres) needs it.
revoke all on public.content_reports_with_content from anon, authenticated;

-- 2. mark_messages_as_read(reader_id, sender_id) is unused by the app and
--    broken (`sender_id = sender_id` is an ambiguous plpgsql reference, so every
--    call errors). Drop it rather than leave a mutable-search_path function.
drop function if exists public.mark_messages_as_read(text, text);
