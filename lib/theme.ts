// Ceranix design tokens. Single source of truth.
//
// Pulled from the home + product pages (the "perfect" reference) and the
// already-polished settings/login screens. Other screens should consume
// these constants — no more ad-hoc #4338ca / gray-900 sprinkled around.

import { Platform } from 'react-native';

export const colors = {
  // Brand
  ink: '#0a0a0a',
  lime: '#d8f53a',
  purple: '#6C47FF',
  purpleSoft: '#f1edff',

  // Surfaces
  white: '#ffffff',
  soft: '#f5f4ef', // off-white app background
  cream: '#fafaf7',
  hair: '#e8e6e0', // hairline borders
  divider: '#f1f1f1',

  // Text
  mute: '#6b7280',
  muteSoft: '#9ca3af',
  ghost: '#a8a59c',

  // Feedback
  red: '#ef4444',
  redSoft: 'rgba(239,68,68,0.18)',
  green: '#15803d',
  greenSoft: 'rgba(34,197,94,0.18)',

  // Overlays
  overlay: 'rgba(0,0,0,0.45)',
  overlayLight: 'rgba(0,0,0,0.18)',
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  '4xl': 28,
  pill: 999,
} as const;

export const spacing = {
  0: 0,
  '0.5': 2,
  1: 4,
  '1.5': 6,
  2: 8,
  '2.5': 10,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  7: 28,
  8: 32,
  10: 40,
  12: 48,
  14: 56,
  16: 64,
} as const;

export const type = {
  family: {
    sans: 'Inter_400Regular',
    sansMedium: 'Inter_500Medium',
    sansSemibold: 'Inter_600SemiBold',
    sansBold: 'Inter_700Bold',
    serif: 'Fraunces_400Regular',
    serifBold: 'Fraunces_700Bold',
    serifItalic: 'Fraunces_400Regular_Italic',
  },
  size: {
    '2xs': 10,
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 15,
    xl: 16,
    '2xl': 18,
    '3xl': 20,
    '4xl': 24,
    '5xl': 32,
    display: 44,
    hero: 56,
  },
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
    extrabold: '800' as const,
    black: '900' as const,
  },
} as const;

// Subtle shadows — iOS uses real shadow, Android falls back to elevation.
export const shadow = {
  none: {},
  sm: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    android: { elevation: 1 },
    default: {},
  })!,
  md: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    android: { elevation: 2 },
    default: {},
  })!,
  lg: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 8 } },
    android: { elevation: 4 },
    default: {},
  })!,
  // Inverse shadow used by fixed top bars on iOS (shadow above the bar).
  topBar: Platform.select({
    ios: { shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12, shadowOffset: { width: 0, height: -3 } },
    android: { elevation: 4 },
    default: {},
  })!,
} as const;

// Standard eyebrow label styling: small caps, wide tracking, used above hero text.
export const eyebrow = {
  fontSize: type.size.xs,
  fontWeight: type.weight.bold,
  color: colors.ink,
  letterSpacing: 1.4,
  textTransform: 'uppercase' as const,
};

// A muted version for descriptions.
export const eyebrowMute = {
  ...eyebrow,
  color: colors.mute,
  letterSpacing: 1.2,
};
