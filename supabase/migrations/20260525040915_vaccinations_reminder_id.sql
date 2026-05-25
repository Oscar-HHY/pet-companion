-- Track the expo-notifications local identifier per vaccination so we can
-- cancel/reschedule the OS-level reminder when the row is deleted or its
-- next_due_date changes.
--
-- Nullable: existing rows + rows with no next_due_date have no scheduled
-- reminder.

ALTER TABLE public.vaccinations
  ADD COLUMN IF NOT EXISTS reminder_notification_id text;
