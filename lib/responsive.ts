// Responsive helpers. Eliminates the `width: '48%'` anti-pattern that was
// breaking grids on devices outside the iPhone-12 baseline.
//
// Use `useResponsiveColumns` to pick a column count that adapts to the
// viewport, and `cardWidth` to compute exact pixel widths when you can't
// rely on FlatList's numColumns + columnWrapperStyle.

import { Platform, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const bp = {
  xs: 320, // small Android phones, iPhone SE 1st gen
  sm: 380, // iPhone 12 mini, most small phones
  md: 420, // iPhone Plus, modern Android
  lg: 768, // tablet portrait
  xl: 1024, // tablet landscape / web
} as const;

export type Breakpoint = keyof typeof bp;

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions();
  if (width >= bp.xl) return 'xl';
  if (width >= bp.lg) return 'lg';
  if (width >= bp.md) return 'md';
  if (width >= bp.sm) return 'sm';
  return 'xs';
}

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return width >= bp.lg;
}

export function useIsCompact(): boolean {
  const { width, height } = useWindowDimensions();
  return width < bp.sm || height < 700;
}

// Pick a column count that scales with screen width. The defaults work for
// 4:5 listing tiles: 2 cols on phones, 3 on big phones, 4 on tablets,
// 5 on wide tablets/web. Pass `min` to raise the floor (e.g. 3 for the home
// feed which always wants a dense grid).
export function useResponsiveColumns(opts: {
  min?: number;
  max?: number;
  // Width breakpoint thresholds that bump the column count up by 1
  thresholds?: number[];
} = {}): number {
  const { width } = useWindowDimensions();
  const min = opts.min ?? 2;
  const max = opts.max ?? 5;
  const thresholds = opts.thresholds ?? [bp.md, bp.lg, bp.xl, 1440];
  let cols = min;
  for (const t of thresholds) {
    if (width >= t) cols += 1;
  }
  return Math.min(max, cols);
}

// Compute the exact pixel width of one card in a grid, given the available
// row width, column count, horizontal padding inside the row, and gap
// between cards. Useful when wrapping cards in a flex-row with `gap`
// instead of using FlatList numColumns.
export function cardWidth(args: {
  rowWidth: number;
  columns: number;
  horizontalPadding?: number;
  gap?: number;
}): number {
  const { rowWidth, columns, horizontalPadding = 0, gap = 0 } = args;
  if (columns <= 0) return 0;
  const usable = rowWidth - horizontalPadding * 2;
  const totalGap = gap * (columns - 1);
  return Math.max(0, Math.floor((usable - totalGap) / columns));
}

// Combine the two: derive both the column count and the per-card width
// using the current viewport. Call this from screens that draw their own
// grids (rather than FlatList numColumns).
export function useGridDimensions(opts: {
  min?: number;
  max?: number;
  thresholds?: number[];
  horizontalPadding?: number;
  gap?: number;
} = {}): { columns: number; cardWidth: number; viewportWidth: number } {
  const { width } = useWindowDimensions();
  const columns = useResponsiveColumns(opts);
  const w = cardWidth({
    rowWidth: width,
    columns,
    horizontalPadding: opts.horizontalPadding ?? 0,
    gap: opts.gap ?? 0,
  });
  return { columns, cardWidth: w, viewportWidth: width };
}

// Standard max width for content on large screens — keeps layouts readable
// instead of stretching edge-to-edge on tablets/web.
export const CONTENT_MAX_WIDTH = 720;

// The floating tab bar (components/AnimatedTabBar) is absolutely positioned and
// overlays screen content — it does NOT reserve layout space. Screens inside the
// (tabs) group must pad the bottom of their scroll content (and any sticky CTA
// bar) by this much, or the bar covers the last row / buttons beneath it.
// Mirrors AnimatedTabBar's BAR_HEIGHT (68) + its bottom offset.
export const TAB_BAR_HEIGHT = 68;
export function useTabBarClearance(extra = 12): number {
  const insets = useSafeAreaInsets();
  // Matches AnimatedTabBar: bottom = max(insets.bottom, 16) on iOS, else 24.
  const bottomOffset = Platform.OS === 'ios' ? Math.max(insets.bottom, 16) : 24;
  return bottomOffset + TAB_BAR_HEIGHT + extra;
}

// Hit-slop preset for small icon buttons (improves touch target on phones).
export const HIT_SLOP_8 = { top: 8, bottom: 8, left: 8, right: 8 } as const;
export const HIT_SLOP_12 = { top: 12, bottom: 12, left: 12, right: 12 } as const;
