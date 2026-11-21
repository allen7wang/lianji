// Browsers get the in-app countdown and vibration only.
export function configureNotifications() {}

export async function ensureNotificationPermission() {
  return false;
}

export async function scheduleTimerNotification(_seconds: number, _title: string, _body: string): Promise<string | null> {
  return null;
}

export async function cancelTimerNotification(_id: string | null) {}
