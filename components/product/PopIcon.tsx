// The Instagram like-button mechanic, verbatim in spirit from the canonical
// Reanimated implementation (vcapretz / swmansion): two stacked glyphs driven by
// one spring value.
//
//   • Filled glyph: scale AND opacity track the spring from 0 → 1. Because the
//     spring is underdamped it overshoots past 1 for a moment on the way up —
//     that overshoot IS the "pop". No separate bounce keyframe; the physics do
//     it, exactly like Instagram.
//   • Outline glyph: scale tracks 1 → 0, so it shrinks away underneath as the
//     filled heart blooms over it.
//
// The animation is imperative (`ref.animateTo(next)`), fired from the tap
// handler, so hydrating an already-liked item just snaps to filled with no pop —
// matching Instagram, which shows a previously-liked post pre-filled and still.
//
// Ionicons gives matched heart / heart-outline and bookmark / bookmark-outline
// silhouettes so the two layers register exactly.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';

export type PopIconHandle = { animateTo: (next: boolean) => void };

// Snappier and a touch less bouncy than Reanimated's default spring — the
// default (damping 10 / stiffness 100) is slow and over-wobbles. This settles
// in ~320ms with a ~12% overshoot: the crisp Instagram pop.
const SPRING = { damping: 11, stiffness: 190, mass: 0.55 } as const;

const CENTER = { alignItems: 'center', justifyContent: 'center' } as const;

export const PopIcon = forwardRef<
  PopIconHandle,
  {
    /** Ionicons base name; outline layer uses `${name}-outline`. */
    name: 'heart' | 'bookmark';
    active: boolean;
    size: number;
    activeColor: string;
    inactiveColor: string;
  }
>(({ name, active, size, activeColor, inactiveColor }, ref) => {
  // 0 = outline, 1 = filled. The spring is free to overshoot outside [0,1];
  // the styles below clamp what they read so a negative/over-unit value never
  // flips or over-inflates a glyph.
  const progress = useSharedValue(active ? 1 : 0);
  // Set by animateTo so the sync effect below doesn't stomp the spring with a
  // hard snap on the same render.
  const animating = useRef(false);

  useEffect(() => {
    if (animating.current) {
      animating.current = false;
      return;
    }
    // Non-interactive change (hydration, optimistic revert): snap, no pop.
    progress.value = active ? 1 : 0;
  }, [active, progress]);

  useImperativeHandle(ref, () => ({
    animateTo: (next: boolean) => {
      animating.current = true;
      progress.value = withSpring(next ? 1 : 0, SPRING);
    },
  }));

  const outlineStyle = useAnimatedStyle(() => ({
    transform: [{ scale: interpolate(progress.value, [0, 1], [1, 0], Extrapolation.CLAMP) }],
    opacity: interpolate(progress.value, [0, 1], [1, 0], Extrapolation.CLAMP),
  }));

  const filledStyle = useAnimatedStyle(() => ({
    // max(…,0) guards the brief undershoot below 0 on the way to un-liked, which
    // would otherwise flip the glyph via a negative scale.
    transform: [{ scale: Math.max(progress.value, 0) }],
    opacity: interpolate(progress.value, [0, 1], [0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View style={[{ width: size, height: size }, CENTER]}>
      <Animated.View style={[StyleSheet.absoluteFill, CENTER, outlineStyle]}>
        <Ionicons name={`${name}-outline` as const} size={size} color={inactiveColor} />
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, CENTER, filledStyle]}>
        <Ionicons name={name} size={size} color={activeColor} />
      </Animated.View>
    </Animated.View>
  );
});

PopIcon.displayName = 'PopIcon';
