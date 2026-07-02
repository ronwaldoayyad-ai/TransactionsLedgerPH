import * as Haptics from 'expo-haptics'

// Thin wrappers so call sites stay one-liners and failures never surface
// (haptics are unavailable on some Android devices / simulators).
const safe = (fn: () => Promise<void>) => {
  fn().catch(() => {})
}

export const tapHaptic = () => safe(() => Haptics.selectionAsync())
export const lightHaptic = () => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light))
export const successHaptic = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success))
export const warningHaptic = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning))
export const errorHaptic = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error))
