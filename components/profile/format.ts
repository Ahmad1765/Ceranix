// Compact count formatting for the profile stats bar (1200 → "1.2K").
//
// Lived as a private copy inside app/user/[id].tsx before the profile
// components were extracted; it moved here so the two profile screens can't
// drift into formatting the same number two different ways.
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n < 1_000) return String(n);
  if (n < 10_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  if (n < 1_000_000) return Math.round(n / 1_000) + 'K';
  return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}
