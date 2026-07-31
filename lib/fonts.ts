// Font-loading helpers.
//
// ── Why `font-display` matters here ─────────────────────────────────────────
//
// expo-font's generated `@font-face` blocks default to `font-display: auto`,
// which lets the browser paint text in a *fallback* face while the real file is
// still in flight. For this app that produced two visible defects on web, both
// reproducible by throttling bandwidth to ~500 kbps on a cold cache:
//
//   • Icon fonts rendered as tofu boxes. Ionicons is 381 KB, so on a slow link
//     it loses the race, and every <Ionicons> in the tab bar painted as □
//     because the fallback face has no glyph at those code points.
//   • Body text painted in the system serif and then snapped to Inter — the
//     classic flash of unstyled text.
//
// `FontDisplay.BLOCK` is the fix for both. Per expo-font's own docs it means
// "the text will be invisible until the font has loaded", so nothing is ever
// painted in the wrong face. The CSS spec caps that block period at ~3s and
// then falls back, so a font that genuinely never arrives degrades to the old
// behaviour instead of hiding text forever.
//
// This is a web-only concern — `display` is documented `@platform web`, and
// native ignores the field entirely. Applying it costs nothing on iOS/Android.
import * as Font from 'expo-font';

/**
 * Re-tag a font map with an explicit `font-display`.
 *
 * `Ionicons.font`, `@expo-google-fonts/*` exports and friends hand back bare
 * module IDs, which expo-font resolves but which carry no display hint. This
 * rewraps each entry as a `FontResource` so the hint survives into the emitted
 * `@font-face`. Entries that are already resource objects keep their `uri`.
 */
export function withFontDisplay(
  fonts: Record<string, Font.FontSource>,
  display: Font.FontDisplay,
): Record<string, Font.FontResource> {
  return Object.fromEntries(
    Object.entries(fonts).map(([family, source]) => {
      const uri =
        typeof source === 'object' && source !== null && 'uri' in source
          ? (source as Font.FontResource).uri
          : (source as string | number);
      return [family, { uri, display }];
    }),
  );
}
