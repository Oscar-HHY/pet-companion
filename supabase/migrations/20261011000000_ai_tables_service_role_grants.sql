-- Fix for 20261010000000_pet_assistant: this project's default privileges do
-- NOT grant table privileges to service_role on newly created tables (only
-- REFERENCES/TRIGGER/TRUNCATE). So the Edge Functions' service-role client got
-- permission errors on:
--   - ai_usage_events  (quota check in pet-assistant-chat / extract-medical-report
--                       → every assistant request returned 500)
--   - ai_chat_messages + ai_usage_events (delete-account cleanup → account
--                       deletion failed with table_delete_failed)
grant select, insert, delete on public.ai_usage_events to service_role;
grant select, insert, delete on public.ai_chat_messages to service_role;
