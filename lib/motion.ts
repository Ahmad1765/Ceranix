// Motion primitives. Spring/timing presets + small animated components for
// list staggers, pressable scale, fade-in, skeleton shimmer.
//
// All animations use reanimated worklets so they run on the UI thread.

import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type WithSpringConfig,
  type WithTimingConfig,
} from 'react-native-reanimated';

// ── Easing / spring presets ────────────────────────────────────────────────
export const spring = {
  // Quick, snappy — for press scale, tab switches.
  snap: { damping: 22, stiffness: 320, mass: 0.6 } satisfies WithSpringConfig,
  // Default — natural feeling, used for entrances.
  natural: { damping: 18, stiffness: 220, mass: 0.7 } satisfies WithSpringConfig,
  // Soft — for hero-style reveals.
  soft: { damping: 16, stiffness: 140, mass: 1 } satisfies WithSpringConfig,
};

export const timing = {
  fast: { duration: 180, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  normal: { duration: 260, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
  slow: { duration: 420, easing: Easing.out(Easing.cubic) } satisfies WithTimingConfig,
};

// ── Hooks ──────────────────────────────────────────────────────────────────

// Staggered entry — pass `index` so list items cascade in. Use as a style
// on the wrapper of each list row.
export function useStaggeredEntrance(index: number, options: { delayStep?: number; offsetY?: number } = {}) {
  const { delayStep = 40, offsetY = 8 } = options;
  const opacity = useSharedValue(0);
  const y = useSharedValue(offsetY);

  useEffect(() => {
    const d = Math.min(index, 12) * delayStep; // cap to avoid huge waits on long lists
    opacity.value = withDelay(d, withTiming(1, timing.normal));
    y.value = withDelay(d, withSpring(0, spring.natural));
  }, [index, delayStep, opacity, y]);

  return useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: y.value }],
  }));
}

// Simple fade-in on mount.
export function useFadeIn(delay = 0, durationMs = 260) {
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: durationMs, easing: Easing.out(Easing.cubic) }));
  }, [delay, durationMs, opacity]);
  return useAnimatedStyle(() => ({ opacity: opacity.value }));
}

// Skeleton shimmer — apply to a placeholder block while content loads.
// Returns an animated style with subtle opacity pulse.
export function useShimmer(enabled = true) {
  const t = useSharedValue(0);
  useEffect(() => {
    if (!enabled) {
      t.value = 0;
      return;
    }
    t.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 900, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    );
  }, [enabled, t]);

  return useAnimatedStyle(() => ({
    opacity: 0.45 + t.value * 0.35, // 0.45 → 0.8 → 0.45
  }));
}
