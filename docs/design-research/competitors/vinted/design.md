# Vinted — Design System Notes

**Source:** https://www.vinted.com/ · extracted 2026-07-23 via `extract-design-system` (headless Chromium, single page: locale-selection landing page, not a logged-in listing/browse view)

## Colors

| Role | Value | Notes |
|---|---|---|
| Primary / brand | `#007782` (teal) | Used on links, outlined buttons, focus rings, cookie-banner CTAs |
| Text (dark) | `#15191a` (near-black, often at 8–12% alpha for hairline borders) | |
| Body text (muted) | `#5a6566` (slate gray) | Highest raw pixel count on page — dominant body/caption color |
| Surface | `#ffffff` | Cards, hero block background |
| Hover accent | `#2285f7` (blue) | Link hover state — brighter blue than the brand teal |

No CSS custom properties were exposed (colors are compiled into CSS module classes, not `:root` variables).

## Typography

- **Font family:** `V_INTER` / `V-Inter` (self-hosted Inter variant), falling back to `Helvetica Neue, Arial`.
- **Heading sizes seen:** 34px/500, 24px/500, 22px/580 (note the unusual 580 weight), 18px/500.
- **Body/link/button:** mostly 16px, 15px, 14px at weights 375–500.
- **Caption sizes:** step down to 13px, 12px, and micro sizes (10px, 9.3px, 8.5px) for legal/fine print.
- Weight `375` shows up repeatedly as a "regular" — this is a variable-font instance weight, not a standard 400.

## Spacing

8px-family scale, but with several odd half-steps mixed in (likely from icon-driven sizing rather than a strict token scale): `1, 2, 3, 4, 5, 6, 6.25, 6.5, 7, 8, 10, 12, 14, 15, 16, 20, 24, 25, 30, 32px`.

## Border Radius

- `6px` — dominant, used on buttons, inputs, menus (151 occurrences) — this is the primary "control" radius.
- `1px`, `2px`, `3px` — hairline/near-square elements.
- `20px`, `24px` — pill-ish badges (favorite counts).
- `12px` — dialogs/modals.

## Borders

- `1px solid` in a near-black low-alpha (`rgba(21,25,26,.08–.12)`) is the default card/divider border.
- `1px solid #007782` on outlined buttons.
- Light gray (`#f2f2f2`, `#d8d8d8`) for secondary dividers.

## Shadows

Sparse — only 4 shadow declarations detected, all low-confidence/low-usage:
- `0 0 18px rgba(0,0,0,.2)` — likely a modal/overlay shadow.
- `0 4px 16px rgba(21,25,26,.24)` — dropdown/menu elevation.

Overall the UI leans on borders + flat surfaces rather than shadow-driven elevation.

## Buttons (from computed states)

- **Filled/primary:** bg `#007782`, white text, `6px` radius, `12–16px` horizontal padding.
- **Outlined:** transparent bg, `1px solid #007782` border, teal text.
- All sampled buttons converge on hover → `opacity: 0.6` + color shift toward blue (`#2285f7`), and a `1px solid black` focus outline (accessibility focus ring, not brand-colored).

## Breakpoints

`400, 425, 426, 500, 530, 550, 600, 768, 769, 890, 896, 897, 1023, 1024, 1280px` — dense set, consistent with component-level (not just page-level) responsive breakpoints.

## Caveats

- This run hit Vinted's **country/locale landing page**, not the authenticated browse/listing UI — card, filter, and listing-grid styling from the actual marketplace is not represented here.
- The tool's "frameworks detected" heuristic (PrimeReact/Fluent UI/Element Plus) is almost certainly a false positive from class-name pattern matching — Vinted is a Next.js app with custom CSS Modules (`web_ui__Button__...`), not those UI kits. Ignored in this summary.
- Raw extraction data: `raw.json` / `normalized.json` in this folder.
