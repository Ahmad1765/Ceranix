// Tap feedback, in one place.
//
// This eight-line helper had been copy-pasted into eight files (settings,
// payment, invoice, login, onboarding, profile/edit, SaveListSheet, and the one
// real export in components/product/shared.ts), with the copies already drifting
// — some support a 'selection' style, some don't.
//
// Android is skipped on purpose: expo-haptics maps impactAsync onto the
// platform vibrator there, which reads as a buzz rather than a tap.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const STYLES = {
  light: Haptics.ImpactFeedbackStyle.Light,
  medium: Haptics.ImpactFeedbackStyle.Medium,
} as const;

export function tap(style: keyof typeof STYLES = 'light') {
  if (Platform.OS !== 'ios') return;
  Haptics.impactAsync(STYLES[style]);
}
