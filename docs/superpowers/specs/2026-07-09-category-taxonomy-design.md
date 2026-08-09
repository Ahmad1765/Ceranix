# Category taxonomy overhaul — design

Date: 2026-07-09
Status: approved (verbal), implementation in progress

## Problem

The category taxonomy is duplicated across four places and has drifted:

- `types/index.ts` — `Category` union (7 values)
- `components/product/shared.ts` — `CATEGORY_LABELS` (7, no icons)
- `app/(tabs)/upload.tsx` — `CATEGORIES` (7, with icons)
- `app/(tabs)/discover.tsx` — `CATEGORY_TILES` (only **4** + trending, different icons)

Consequences: icons and labels disagree between upload and browse (e.g. Shoes uses
`compass` in Discover but `package` in upload; Electronics shows as "Tech"); the
taxonomy can drift out of sync silently on any edit; and listings carry only a
single flat category, so buyers cannot narrow within a category.

## Decision

Adopt the modern eBay / Vinted pattern: **one** subcategory level (not a deep tree)
plus existing listing fields treated as facets. Deep multi-level trees are explicitly
rejected as friction that fights the app's simple-layout design rule.

## Single source of truth

New module `lib/categories.ts` is the only place categories live. All surfaces import
from it. Shape:

```ts
export const CATEGORIES = [
  { id: 'clothing', label: 'Clothing', icon: 'shopping-bag', subs: [ { id, label }, ... ] },
  ...
] as const;
```

Helpers: `getCategory(id)`, `getSubcategory(catId, subId)`, `categoryLabel(id)`,
`subcategoryLabel(catId, subId)`, `CATEGORY_IDS`, and `suggestSubcategory(title)` for
the keyword-based upload hint.

`types/index.ts` keeps the `Category` union (re-derived from the module) and adds
`subcategory?: string | null` to `Listing`.

## Taxonomy (one level)

- **Clothing:** Tops, T-shirts, Shirts, Hoodies & Sweats, Knitwear, Dresses, Skirts, Trousers, Jeans, Shorts, Outerwear, Activewear, Suits & Blazers
- **Shoes:** Sneakers, Boots, Heels, Flats, Sandals, Loafers, Formal
- **Bags:** Handbags, Shoulder, Crossbody, Totes, Backpacks, Clutches, Wallets
- **Accessories:** Jewelry, Watches, Belts, Hats, Scarves, Sunglasses, Gloves, Hair
- **Electronics:** Phones, Laptops, Tablets, Audio, Cameras, Gaming, Wearables, Accessories
- **Beauty:** Makeup, Skincare, Fragrance, Haircare, Tools & Brushes, Nails
- **Other:** *(no subs)*

## Database

- `ALTER TABLE listings ADD COLUMN subcategory TEXT NULL`.
- Stored as a slug, validated in-app against the taxonomy. No DB enum/check constraint,
  so future subcategory edits require no migration.
- Existing rows stay `null` → they display only their top category. **No backfill.**
- Index on `(category, subcategory)` for browse filtering.

## Per-surface changes

- **Upload** (`app/(tabs)/upload.tsx`): two-step picker — category, then a searchable
  subcategory sheet. Subcategory **required** when the chosen category has subs (Other
  excepted). Lightweight title-based suggestion chip via `suggestSubcategory`. Persist
  `subcategory` in the insert + cached `Listing`.
- **Discover tiles** (`app/(tabs)/discover.tsx`): tiles now derive icons/labels from
  the shared taxonomy (was hardcoded and drifting). Item counts already existed.
- **Discover category browse:** subcategory chips under the header + sort
  (Newest / Price ↑ / Price ↓ / Popular), threaded through `useFeedListingsQuery`.
  Condition / size / brand / color facets are a deliberate phase 2.
- **Product page** (`app/product/[id].tsx`): Category row becomes a breadcrumb
  `Clothing ▸ Hoodies & Sweats`, both segments searchable (sub taps into that sub).

## Data layer

- `lib/listings.ts`: add `subcategory` to `FEED_LISTING_COLS`; extend
  `fetchListingsResult` / `searchListings` opts with `subcategory` + `sort`.
- `lib/queries.ts`: thread `subcategory` + `sort` through `useFeedListingsQuery`.

## Out of scope (guardrails)

Deep multi-level tree; facets beyond subcategory + condition + sort; photo-based
category detection; per-category custom aspect forms.
