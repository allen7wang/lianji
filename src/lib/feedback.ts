import * as Haptics from 'expo-haptics';

// Fire-and-forget: devices without haptics simply do nothing.
export const haptic = {
  tap: (enabled: boolean) => { if (enabled) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); },
  select: (enabled: boolean) => { if (enabled) Haptics.selectionAsync().catch(() => {}); },
  success: (enabled: boolean) => { if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); },
  warning: (enabled: boolean) => { if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}); },
};
