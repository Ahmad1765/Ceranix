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
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
