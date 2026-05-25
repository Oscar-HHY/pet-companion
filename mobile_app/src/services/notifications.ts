// Local push notifications for vaccination reminders.
// Behaves like an iOS Reminders alert at the scheduled time — banner on lock
// screen + entry in notification center.

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Foreground presentation: show banner + sound even if user is in the app.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  // Always re-check — a cached `denied` would stick even after the user
  // re-enables in Settings → Pet Companion → Notifications.
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  if (existing === 'denied') return false; // Re-prompting after denial is a no-op on iOS; let the caller surface a Settings link.
  const { status } = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: false, allowSound: true },
  });
  return status === 'granted';
}

export interface VaccinationReminderInput {
  petName: string;
  doseNumber: string;
  nextDueDate: string; // 'YYYY-MM-DD'
  /** Localized strings supplied from the caller so the notification respects user language. */
  titleTemplate: string; // e.g. "Vaccination due"
  bodyTemplate: string;  // e.g. "{pet}'s dose {dose} is due today"
}

/**
 * Schedule a local notification at 9:00 AM on `nextDueDate`.
 * Returns the notification identifier (store it on the row to cancel later)
 * or null if scheduling failed (permission denied, date in the past, etc.).
 */
export async function scheduleVaccinationReminder(
  input: VaccinationReminderInput,
): Promise<string | null> {
  const ok = await ensureNotificationPermission();
  if (!ok) return null;

  const parts = input.nextDueDate.split('-');
  if (parts.length !== 3) return null;
  const [y, m, d] = parts.map((p) => Number(p));
  if (!y || !m || !d) return null;

  // Local 9:00 AM on the due date.
  const fireAt = new Date(y, m - 1, d, 9, 0, 0, 0);
  if (fireAt.getTime() <= Date.now() + 60_000) return null; // past or imminent — skip

  const body = input.bodyTemplate
    .replace('{pet}', input.petName || 'pet')
    .replace('{dose}', input.doseNumber || '?');

  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: input.titleTemplate,
        body,
        sound: Platform.OS === 'ios' ? 'default' : undefined,
        data: { kind: 'vaccination', nextDueDate: input.nextDueDate },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireAt,
      },
    });
    return id;
  } catch (e) {
    console.warn('[notifications] schedule failed:', (e as Error).message);
    return null;
  }
}

export async function cancelReminder(notificationId: string | null | undefined): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('[notifications] cancel failed:', (e as Error).message);
  }
}

/**
 * Dev helper: fire a notification 15s out so you can verify the permission
 * prompt + lock-screen alert path without waiting until 9 AM tomorrow.
 * Returns true if scheduled, false if permission denied.
 */
export async function scheduleTestReminder(title: string, body: string): Promise<boolean> {
  const ok = await ensureNotificationPermission();
  if (!ok) return false;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: Platform.OS === 'ios' ? 'default' : undefined },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 15,
        repeats: false,
      },
    });
    return true;
  } catch (e) {
    console.warn('[notifications] test schedule failed:', (e as Error).message);
    return false;
  }
}
