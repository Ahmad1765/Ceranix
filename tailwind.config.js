/** @type {import('tailwindcss').Config} */
// Strict 3-color palette: purple primary, white surfaces, black ink.
// `brand.*` legacy keys remain but every shade resolves to the primary purple
// so any old `bg-brand-500` etc. classes still compile and render correctly.
const PURPLE = '#6C47FF';
const PURPLE_DEEP = '#5538D6';
const WHITE = '#FFFFFF';
const INK = '#0F0F0F';

module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Semantic
        primary: {
          DEFAULT: PURPLE,
          deep: PURPLE_DEEP,
          soft: 'rgba(108,71,255,0.10)',
          softer: 'rgba(108,71,255,0.18)',
        },
        ink: {
          DEFAULT: INK,
          mute: 'rgba(15,15,15,0.62)',
          soft: 'rgba(15,15,15,0.45)',
          hair: 'rgba(15,15,15,0.08)',
          panel: 'rgba(15,15,15,0.04)',
        },
        surface: WHITE,

        // Legacy `brand-*` aliases — all collapse to the primary purple so the
        // 3-color rule cannot be broken from existing Tailwind class strings.
        brand: {
          50: 'rgba(108,71,255,0.06)',
          100: 'rgba(108,71,255,0.10)',
          200: 'rgba(108,71,255,0.18)',
          300: 'rgba(108,71,255,0.30)',
          400: 'rgba(108,71,255,0.55)',
          500: PURPLE,
          600: PURPLE_DEEP,
          700: PURPLE_DEEP,
          800: PURPLE_DEEP,
          900: INK,
        },
      },
      // Loaded in app/_layout.tsx via expo-google-fonts. React Native needs
      // the exact per-weight font file (no synthetic bolding of a single
      // variable file), so each weight gets its own key — mirrors
      // lib/theme.ts's `type.family` naming exactly.
      fontFamily: {
        sans: ['Inter_400Regular'],
        'sans-medium': ['Inter_500Medium'],
        'sans-semibold': ['Inter_600SemiBold'],
        'sans-bold': ['Inter_700Bold'],
        'sans-bold-italic': ['Inter_700Bold_Italic'],
      },
      // Mirrors lib/theme.ts `type.size` exactly — Tailwind's default scale
      // (sm=14, lg=18, xl=20...) does not match, so `text-sm`/`text-lg`/etc
      // via className were silently off-scale from the StyleSheet-driven
      // (AppText / lib/theme.ts) values used everywhere else.
      fontSize: {
        '2xs': '10px',
        xs: '11px',
        sm: '12px',
        base: '13px',
        md: '14px',
        lg: '15px',
        xl: '16px',
        '2xl': '18px',
        '3xl': '20px',
        '4xl': '24px',
        '5xl': '32px',
        display: '44px',
        hero: '56px',
      },
      // Mirrors lib/theme.ts `spacing` exactly. These numeric steps already
      // equal Tailwind's own defaults (0.5=2px, 1=4px, ... 16=64px) — declared
      // explicitly anyway so this file is the single documented source of
      // truth rather than an implicit coincidence with Tailwind's defaults.
      spacing: {
        0.5: '2px',
        1.5: '6px',
        2.5: '10px',
      },
      // Mirrors lib/theme.ts `radii` exactly — Tailwind's default radius
      // scale (sm=2, lg=8, xl=12...) does not match; `rounded-xl` via
      // className was silently a different radius than `radii.xl` (16) used
      // by StyleSheet-driven components (e.g. Card, Button).
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '14px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
        '4xl': '28px',
        pill: '9999px', // alias of Tailwind's own `rounded-full`; same value
      },
    },
  },
  plugins: [],
};
