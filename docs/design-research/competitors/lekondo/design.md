# Lekondo — Design System Notes

**Source:** https://lekondo.com/ · extracted 2026-07-23 via `extract-design-system` (headless Chromium, marketing landing page for the App Store app)

## Stack signal

Detected with high confidence as a **Tailwind CSS** build (arbitrary-value classes like `top-[117px]`, responsive/state modifiers) — this is the most Tailwind-idiomatic site of the four, which shows in how clean the extracted scale is below (round numbers, no odd half-pixel values like Vinted/Mercari had).

## Colors

Small, restrained palette — reads as a neutral/grayscale marketing site rather than a brand-color-heavy one:

| Color | Value | Role |
|---|---|---|
| `#4b5563` (Tailwind `gray-600`) | Body text |
| `#111827` (Tailwind `gray-900`) | Headings/dark text |
| `#e5e7eb` (Tailwind `gray-200`) | Dividers/subtle fills — highest raw pixel count |
| `#f3f4f6` (Tailwind `gray-100`) | Section backgrounds |
| `#3b82f6` at 50% alpha (Tailwind `blue-500`) | Focus ring only (`--tw-ring-color`) — no blue appears elsewhere, so this is likely still Tailwind's default focus-ring color, not a customized brand blue |

No custom brand color rose to "high confidence" — either the extraction caught a mostly-grayscale hero section, or the brand leans on imagery/photography rather than a strong accent color on this page.

## Typography

- **Font:** `Outfit` (Google Font, geometric sans) — a distinctly different choice from Vinted/Mercari's Inter/Averta, gives a more modern/rounded feel.
- **Hero heading:** 50px, weight **300** (light) — notably light-weight for a hero, tight line-height (1.05) and slightly negative tracking.
- **Sub-headings:** 23px/300, 19px/400 uppercase with `+0.475px` tracking (an eyebrow/label style).
- **Body/link:** 16–17px/300–400.
- **Captions:** 13–14px/300.
- Weight 300 dominates — this site uses "light" as its default body weight, unusual among the four (others default to 400+).

## Spacing

Clean Tailwind 4px-multiple scale: `1, 4, 8, 12, 16, 20, 24, 32, 40, 64, 96px`. Straightforward `4px` base unit, no odd fractional values.

## Border Radius

- `16px` — dominant (14 occurrences) — soft, card-like rounding on containers.
- `9999px` — Tailwind's `rounded-full` (pills/avatars/badges), 6 occurrences.
Only two radius values total — a tight, disciplined system (2 tokens vs. Vinted's ~7).

## Borders

Single combination: `1px solid #f3f4f6` (gray-100) — very light, barely-there dividers.

## Shadows

One shadow recipe used consistently (6 occurrences): a Tailwind-style layered shadow —
`0 0 0 0 #fff, 0 0 0 1px #fff, 0 1px 3px rgba(0,0,0,.08)` — this is literally Tailwind's `shadow-sm` ring+shadow combo, confirming the Tailwind stack.

## Buttons / Links

No distinct button component states were captured on this page (likely icon-driven CTAs or App Store badge links instead of styled `<button>`s). Two link styles found: `#4b5563` (muted gray, weight 300) and `#000000` (weight 400) — both `text-decoration: none`.

## Breakpoints

Standard, unmodified **Tailwind default breakpoints**: `640, 768, 1024, 1280, 1536px` — no custom breakpoint tuning, unlike Vinted/Mercari's dense custom sets.

## Caveats

- This is an app-marketing/App-Store-landing page, not the Lekondo app's in-product UI — treat as brand/marketing styling only.
- "PrimeReact/Fluent UI" framework flags are false positives (class-name heuristics); Tailwind is the only well-evidenced framework signal here.
- Raw extraction data: `raw.json` / `normalized.json` in this folder.
