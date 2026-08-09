// Carrinex design tokens. Single source of truth.
//
// Strict 3-color system: purple (primary), white (surfaces), black (text/contrast).
// Any "muted" tones are black at reduced opacity. Any "soft" purples are
// purple at reduced opacity. Nothing else lives in this file.

import { Platform } from "react-native";

// ── Raw palette ──────────────────────────────────────────────────────────
// These are the only three hues allowed in the application.
const PURPLE = "#6C47FF";
const PURPLE_DEEP = "#5538D6"; // purple darkened for pressed/hover
const PURPLE_TINT_10 = "rgba(108,71,255,0.10)";
const PURPLE_TINT_18 = "rgba(108,71,255,0.18)";
const PURPLE_TINT_45 = "rgba(108,71,255,0.45)";

const WHITE = "#FFFFFF";

const INK = "#0F0F0F"; // near-pure black for text
const INK_MUTE = "rgba(15,15,15,0.62)"; // ~5.4:1 on white — AA for normal text
// Tertiary tier, bumped 0.45 → 0.55 (~4:1) for legibility. Still lighter than
// INK_MUTE so hierarchy holds; use for secondary captions, icons, placeholders.
// For small informational text that must clear AA (4.5:1), reach for INK_MUTE.
const INK_MUTE_SOFT = "rgba(15,15,15,0.55)";
const INK_HAIRLINE = "rgba(15,15,15,0.08)"; // borders, dividers
const INK_PANEL = "rgba(15,15,15,0.04)"; // subtle surface fill
const INK_OVERLAY = "rgba(15,15,15,0.45)";
const INK_OVERLAY_LIGHT = "rgba(15,15,15,0.18)";

// Selected-state fill for segmented controls / filter chips. Requested
// explicitly as a dark slate rather than ink, so it lives as its own token
// instead of being hardcoded at the call site.
const SLATE_SELECTED = "#f1f2f6";
const BLACK = "#0F0F0F";

// ── Semantic colors ──────────────────────────────────────────────────────
// Consumers should reach for these names; raw values stay above.
// Legacy aliases (pink/coral/amber/lime/sky/red/green) are kept so older
// screens keep compiling — they all collapse to purple/black per the
// 3-color rule. Do NOT add new aliases here; new code must use the
// semantic names directly.
export const colors = {
  // Core 3
  primary: PURPLE,
  primaryDeep: PURPLE_DEEP,
  primarySoft: PURPLE_TINT_10,
  primarySofter: PURPLE_TINT_18,
  white: WHITE,
  ink: INK,

  // Surfaces
  bg: WHITE,
  surface: WHITE,
  panel: INK_PANEL,
  cream: WHITE,
  soft: WHITE,

  // Borders / dividers
  hair: INK_HAIRLINE,
  hairline: INK_HAIRLINE,
  divider: INK_HAIRLINE,

  // Text
  ink2: INK,
  text: INK,
  mute: INK_MUTE,
  muteSoft: INK_MUTE_SOFT,
  ghost: INK_MUTE_SOFT,
  smoke: INK_MUTE,

  // Overlays (black at opacity — palette-compliant)
  overlay: INK_OVERLAY,
  overlayLight: INK_OVERLAY_LIGHT,

  // Selected chip/segment fill + the text color that sits on it.
  selected: SLATE_SELECTED,
  onSelected: BLACK,

  // Legacy aliases — all collapse to purple/black so the 3-color rule holds.
  purple: PURPLE,
  purpleDeep: PURPLE_DEEP,
  purpleSoft: PURPLE_TINT_10,
  pink: PURPLE,
  pinkSoft: PURPLE_TINT_10,
  pinkDeep: PURPLE_DEEP,
  coral: PURPLE,
  amber: PURPLE,
  sky: PURPLE,
  lime: PURPLE,
  gradStart: PURPLE,
  gradMid: PURPLE,
  gradEnd: PURPLE,

  // Feedback states — palette-compliant. Errors/success use purple+ink.
  red: INK,
  redSoft: INK_HAIRLINE,
  green: PURPLE,
  greenSoft: PURPLE_TINT_18,
} as const;

// Gradients are kept for API compatibility but collapse to flat purple so
// nothing ever renders an off-palette interpolation between stops.
export const gradients = {
  story: [PURPLE, PURPLE, PURPLE] as const,
  warm: [PURPLE, PURPLE] as const,
  pinkPeach: [PURPLE, PURPLE] as const,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  "2xl": 20,
  "3xl": 24,
  "4xl": 28,
  pill: 999,
} as const;

export const spacing = {
  0: 0,
  "0.5": 2,
  1: 4,
  "1.5": 6,
  2: 8,
  "2.5": 10,
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
    sans: "Inter_400Regular",
    sansMedium: "Inter_500Medium",
    sansSemibold: "Inter_600SemiBold",
    sansBold: "Inter_700Bold",
    sansBoldItalic: "Inter_700Bold_Italic",
  },
  size: {
    "2xs": 10,
    xs: 11,
    sm: 12,
    base: 13,
    md: 14,
    lg: 15,
    xl: 16,
    "2xl": 18,
    "3xl": 20,
    "4xl": 24,
    "5xl": 32,
    display: 44,
    hero: 56,
  },
  weight: {
    regular: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    extrabold: "800" as const,
    black: "900" as const,
  },
} as const;

// Shadows are pure black at low opacity — palette-compliant.
// Uses modern boxShadow (RN 0.76+). Android elevation kept as supplement.
export const shadow = {
  none: {},
  sm: Platform.select({
    android: { boxShadow: "0px 2px 6px rgba(0,0,0,0.04)", elevation: 1 },
    default: { boxShadow: "0px 2px 6px rgba(0,0,0,0.04)" },
  })!,
  md: Platform.select({
    android: { boxShadow: "0px 4px 12px rgba(0,0,0,0.06)", elevation: 2 },
    default: { boxShadow: "0px 4px 12px rgba(0,0,0,0.06)" },
  })!,
  lg: Platform.select({
    android: { boxShadow: "0px 8px 20px rgba(0,0,0,0.1)", elevation: 4 },
    default: { boxShadow: "0px 8px 20px rgba(0,0,0,0.1)" },
  })!,
  topBar: Platform.select({
    android: { boxShadow: "0px -3px 12px rgba(0,0,0,0.06)", elevation: 4 },
    default: { boxShadow: "0px -3px 12px rgba(0,0,0,0.06)" },
  })!,
} as const;

export const eyebrow = {
  fontSize: type.size.xs,
  fontWeight: type.weight.bold,
  color: colors.ink,
  letterSpacing: 1.4,
  textTransform: "uppercase" as const,
};

export const eyebrowMute = {
  ...eyebrow,
  color: colors.mute,
  letterSpacing: 1.2,
};

export const tintedPurple = PURPLE_TINT_45;

// ── Typography tokens ────────────────────────────────────────────────────
// Ready-to-spread text styles encoding the Inter type scale and AA-safe
// default colours. Prefer these (or the <AppText variant> primitive that
// wraps them) over ad-hoc fontSize/fontWeight so type stays consistent
// app-wide. Colours can be overridden per use. Inter-only — no serif.
export const textStyles = {
  display: {
    fontFamily: type.family.sansBold,
    fontSize: type.size.display,
    color: colors.ink,
    letterSpacing: -1,
    lineHeight: 48,
  },
  h1: {
    fontFamily: type.family.sansBold,
    fontSize: type.size["5xl"],
    color: colors.ink,
    letterSpacing: -0.6,
    lineHeight: 38,
  },
  h2: {
    fontFamily: type.family.sansBold,
    fontSize: type.size["4xl"],
    color: colors.ink,
    letterSpacing: -0.4,
    lineHeight: 30,
  },
  title: {
    fontFamily: type.family.sansBold,
    fontSize: type.size["2xl"],
    color: colors.ink,
    letterSpacing: -0.2,
  },
  body: {
    fontFamily: type.family.sans,
    fontSize: type.size.lg,
    color: colors.ink,
    lineHeight: 22,
  },
  bodyStrong: {
    fontFamily: type.family.sansSemibold,
    fontSize: type.size.lg,
    color: colors.ink,
  },
  bodyMuted: {
    fontFamily: type.family.sans,
    fontSize: type.size.md,
    color: colors.mute, // AA-safe muted (0.62)
    lineHeight: 20,
  },
  caption: {
    fontFamily: type.family.sansMedium,
    fontSize: type.size.sm,
    color: colors.mute, // AA-safe muted (0.62)
  },
  label: {
    fontFamily: type.family.sansBold,
    fontSize: type.size.base,
    color: colors.ink,
    letterSpacing: 0.1,
  },
  eyebrow: { ...eyebrow },
} as const;
