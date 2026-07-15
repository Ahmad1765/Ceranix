# Product page polish — design

Date: 2026-07-15
Surface: `app/product/[id].tsx`, `components/product/*`

## Goals

1. Brand reads as a link (underlined) in the meta line, per reference screenshot.
2. Details box stops feeling "uneven" — description moves below the detail rows.
3. `Report` sits at true page centre.
4. Offer / Buy now bar simplifies to Plick/Vinted level, with an inline-expanding
   offer input replacing the modal sheet.

## 1. Brand as link

- Meta line brand segment gains `textDecorationLine: 'underline'`. It is already
  `BRAND_PURPLE` + `Inter_600SemiBold`; the underline is what makes it read as
  tappable rather than as emphasis.
- `Brand` row value in the details box becomes `BRAND_PURPLE` (was `INK_700`),
  because the row is tappable. Non-tappable rows (Size, Color, Uploaded) keep
  `INK_700`.

## 2. Detail row structure

Rows currently render as one `Text` node: label + three literal space characters
+ value. Values therefore begin at a different x-offset on every row.

New structure per row: label left (`Inter_600SemiBold`, `BRAND_INK`), value
right-aligned (`Inter_400Regular`), trailing affordance last. This matches the
reference and the existing `Category` row.

## 3. Details box layout

Order becomes: Category → Brand → Size → Condition → Color → Uploaded →
divider → description.

- The purple-dot `ITEM DESCRIPTION` eyebrow is removed.
- `Uploaded` is added as a row (was meta-line only).
- Section `paddingTop` 22 → 10.

Net gap from seller card: 38px → ~26px. Because the box now opens with
fixed-height rows, its top edge is identical across listings regardless of
description length — this is what fixes the unevenness.

## 4. Report centering

Three `flex: 1` columns do not guarantee equal widths here: `flexBasis` is 0 and
`flexShrink` is 1, so a column whose content exceeds its third (`ID · a1b2c3d4`
is wider than `Share`) grows at its neighbours' expense, drifting the middle
column off-centre.

Fix: `Report` is absolutely positioned and centred against the row; `Share` and
the ID sit in the normal flow at the edges. Centring is then against the screen,
independent of neighbour widths.

## 5. Bottom action bar

### Back-out

Current bar extracted verbatim to `components/product/ProductActionBar.legacy.tsx`.
`components/product/OfferSheet.tsx` is left on disk but unimported. Backing out =
import the legacy bar instead of the new one, and restore the `OfferSheet` call
site. No other file changes.

Note: `app/conversation/[id].tsx` defines its own local `OfferSheet` (line ~320).
It is a different component and is untouched.

### New bar

- Trust line (`Secure checkout · Buyer Protection included`) removed. Buyer
  Protection is already stated at the price, and neither Plick nor Vinted carries
  a line here.
- Collapsed: `[Offer]  [Buy now · <total>]`. No icons.
- Tap `Offer` → expands rightward to fill the bar: currency prefix, autofocused
  number field, send button. `Buy now` fades out.
- Collapse via close control, tap-away, or keyboard dismiss.
- Submit path is unchanged: `router.push('/conversation/new', { mode: 'offer',
  amount })` — same backend contract the sheet used.

### Accepted loss

Quick-offer chips (-10/-15/-20%) retire with the sheet. Vinted has no
equivalent. Called out to the user and accepted.

## 6. OfferSheet

`SafetyBanner context="offer"` removed (`OfferSheet.tsx:310`), per explicit
request, even though the sheet is no longer mounted on this screen.

## Out of scope

- Bundle collage / BundleSection (see memory: never remove).
- Price block, hero carousel, seller card internals.
