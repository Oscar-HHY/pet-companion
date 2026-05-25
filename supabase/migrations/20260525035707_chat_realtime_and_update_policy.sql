-- Part-5 streaming/realtime fixes.
--
-- 1) chat_messages had no FOR UPDATE policy. markMessagesAsRead in the client
--    runs `UPDATE chat_messages SET is_read=true WHERE receiver_id=me AND
--    sender_id=friend AND is_read=false` — RLS silently filters every row, so
--    is_read never flips and the unread badge sticks even after reading. Add
--    a real UPDATE policy scoped to the receiver.
--
-- 2) Add chat_messages and friendships to the supabase_realtime publication
--    so the client can subscribe to postgres_changes events. Realtime still
--    respects RLS, so SELECT policies already control who can see each event.

CREATE POLICY "chat_messages receiver update"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING ((auth.uid())::text = receiver_id)
  WITH CHECK ((auth.uid())::text = receiver_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
