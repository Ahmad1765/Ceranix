# Mercari — Design System Notes

**Source:** https://www.mercari.com/ · extracted 2026-07-23 via `extract-design-system` (headless Chromium, marketing/landing page)

## Colors

Mercari exposes an actual CSS-variable palette (`:root` custom properties) — rare among the sites checked, and the most reliable signal in this extraction:

| Variable | Value | Likely role |
|---|---|---|
| `--color-mktg-turquoise` | `#00cfac` | Marketing accent |
| `--color-primary-light` | `#87a7ff` | Primary tint |
| `--color-secondary` | `#f47900` | Secondary/CTA accent (orange) |
| `--color-secondary-light` | `#f69433` | Secondary hover/tint |
| `--color-red` | `#d4001a` | Error/destructive |
| `--color-green` | `#3eb1c8` | (named "green" but renders teal) — success/positive |
| `--color-gold` | `#f7cc4a` | Ratings/badges |
| `--color-gray-dark` | `#222222` | Primary text |
| `--color-white` / `--color-black` | `#fff` / `#000` | Base |

On-page dominant colors (by pixel count): `#222222` (text), `#5356ee` (a periwinkle-blue — used on primary buttons, distinct from the `--color-primary-light` token), `#ffffff`, `#6b6b6b` (secondary text).

There's a visible mismatch between the CSS-variable "design tokens" and what's actually painted on this page (`#5356ee` isn't in the variable list) — suggests this marketing page uses a separate component library/theme (styled-components, per class names below) from the token set.

## Typography

- **Font:** `Averta` (custom/licensed font, no Google Fonts fallback declared).
- **Headings:** 32px/400, 26px/600, 20px/600 — tight negative letter-spacing throughout (-0.24px to -1px), giving a condensed, confident heading style.
- **Body/link/button:** 16px and 14px, weights 400/600 only (no in-between weights, unlike Vinted's variable-font approach).
- **Captions:** 12px/600 and 10px/400, also with negative tracking.

## Spacing

8px-based but wide-ranging, including large layout gaps: `4, 6, 8, 10, 12, 13.73, 16, 20, 24, 28, 30, 32, 40, 48, 56, 76, 80, 152px`. The 152px value is almost certainly a section/hero vertical rhythm value, not a component-level token.

## Border Radius

- `8px` — dominant for images/cards (15 occurrences).
- `4px` — buttons.
- `50%` — circular (avatars, icon buttons, search) — 20 occurrences, notably common.
- No large "soft card" radius — Mercari's marketing page reads more squared-off than Vinted's.

## Borders

Minimal — mostly hairline dividers (`1px solid #ececf1`) and an inset border on embedded iframes. Borders are not a primary structuring device here; likely does more work with background-color blocks and radius.

## Shadows

Very sparse (4 low-confidence declarations, e.g. `0 4px 8px rgba(51,51,51,.2)`), all likely tooltip/dropdown elevation, not card elevation.

## Buttons

- Primary CTA: bg `#5356ee` (periwinkle), white text, `4px` radius, transitions to `opacity: 0.8` + gray bg on hover (color fades out rather than darkening — an unusual hover treatment).
- Neutral/utility button: light gray bg (`#ecedf1`), dark text, same `4px` radius and hover pattern.
- Icon system: Font Awesome (icon font, not SVG sprite).

## Breakpoints

`320, 479, 480, 550, 600, 601, 750, 767, 768, 1023, 1024, 1452px` — Bootstrap-adjacent breakpoint values (480/768/1024) with extra fine-tuning steps.

## Caveats

- Extracted page is the **public marketing/SEO landing page**, not the app's actual listing/search/PDP UI — treat colors and type as brand-level, not component-level, ground truth.
- 0 "semantic" colors were auto-classified (primary/secondary roles) — the CSS variables above are the more trustworthy source than the heuristic palette.
- "PrimeReact/Vue/NG" framework detection is a false positive (class-name coincidence); actual stack shows styled-components (`sc-` hashed class names).
- Raw extraction data: `raw.json` / `normalized.json` in this folder.
