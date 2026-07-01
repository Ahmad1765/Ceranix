# Wardrobe — Social Style Discovery — Design Spec

**Date:** 2026-07-01
**Status:** Approved (design), pending implementation plan
**Author:** Brainstormed with Claude Code

## Summary

A new **Wardrobe** tab: a "Tinder for wardrobes" where users post photos of their
outfits and others swipe through and like them. Purely social style discovery —
one-directional likes, no mutual matching, independent of the marketplace
listings. On upload, a user can optionally **Blur face** and/or **Remove
background** (two independent toggles) to hide themselves, reusing an extended
`lib/photoClean`.

## Locked decisions

Settled during brainstorming; not open for re-litigation in the plan:

1. **Purpose** — social style discovery. Liking is one-directional (no match, no
   chat unlock). Not shop-the-look; not wired to listings in v1.
2. **Navigation** — one new bottom-tab "Wardrobe" with three sections via a
   segmented control: **Swipe**, **My Wardrobe**, **Liked**.
3. **Hide behavior** — two independent upload toggles: **Blur face** and
   **Remove background**. Implemented by parameterizing `lib/photoClean`.
4. **Swipe deck** — built custom with `react-native-reanimated` +
   `react-native-gesture-handler` (already core to this app), not a third-party
   deck library.
5. **v1 scope cuts (YAGNI)** — single photo per post; like-counts only (owners
   do NOT see who liked); no listing/shop linking; no mutual match.

## Data model (Supabase — new)

### Table `wardrobe_posts`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `user_id` | uuid | FK → `profiles.id`, on delete cascade |
| `image_url` | text | public URL in `wardrobe-images` bucket |
| `caption` | text null | optional |
| `tags` | text[] | default `'{}'` |
| `face_hidden` | bool | default false — was Blur face applied |
| `bg_removed` | bool | default false — was Remove background applied |
| `likes_count` | int | default 0, maintained by trigger |
| `created_at` | timestamptz | default `now()` |

RLS: any authenticated user may `select`; `insert`/`update`/`delete` only rows
where `user_id = auth.uid()`.

### Table `wardrobe_swipes`
| column | type | notes |
|---|---|---|
| `id` | uuid pk | |
| `post_id` | uuid | FK → `wardrobe_posts.id`, on delete cascade |
| `user_id` | uuid | FK → `profiles.id` |
| `direction` | text | `'like'` or `'pass'` (check constraint) |
| `created_at` | timestamptz | default `now()` |
| | | `unique (post_id, user_id)` |

RLS: user may `insert`/`select`/`update`/`delete` only rows where
`user_id = auth.uid()`.

### Trigger
`wardrobe_posts.likes_count` maintained by an `AFTER INSERT/UPDATE/DELETE`
trigger on `wardrobe_swipes`: +1 when a row with `direction='like'` appears, -1
when a like is removed or changed to `pass`.

### Storage
New **public** bucket `wardrobe-images`, RLS mirroring `listing-images`
(owner-scoped writes under a `{user_id}/…` path prefix, public read).

## `lib/photoClean` extension

Add an options argument, backward compatible:

```ts
cleanPhoto(
  input: CleanInput,
  options?: { blurFace?: boolean; removeBackground?: boolean },
): Promise<CleanResult>
```

- Default `{ blurFace: true, removeBackground: true }` — so the existing Sell
  upload (which calls `cleanPhoto(input)` with no options) behaves exactly as
  today.
- In the web pipeline: when `removeBackground` is false, skip the confidence-mask
  alpha punch and the white composite — draw the original image to the output
  canvas instead. When `blurFace` is false, skip the face-detection blur loop.
- If both are false the caller should not invoke cleaning; if it does, the
  function returns the original image with `ok:true` (nothing to do).
- The `index.ts` / `index.native.ts` no-op stubs accept and ignore `options`
  (signature parity only).

## Screens & components (new, isolated)

- `app/(tabs)/wardrobe.tsx` — tab shell; segmented control (reuse
  `components/ui/Tabs` or `Chip`) switching Swipe / My Wardrobe / Liked.
- `components/wardrobe/SwipeDeck.tsx` — the card stack + pan gestures
  (reanimated); renders the top ~3 cards, handles like/pass, requests more when
  low, shows an empty state when exhausted.
- `components/wardrobe/WardrobeCard.tsx` — one outfit card (image, caption,
  like/pass visual affordance).
- `components/wardrobe/WardrobeGrid.tsx` — grid of posts, reused by My Wardrobe
  (with delete) and Liked.
- `app/wardrobe/new.tsx` — upload flow: pick one photo → live preview with the
  **Blur face** / **Remove background** toggles (re-runs `cleanPhoto` on change)
  → optional caption/tags → post.
- `lib/wardrobe.ts` — data layer over Supabase + TanStack Query:
  `fetchDeck(userId)`, `swipe(postId, direction)`, `createPost(...)`,
  `deletePost(id)`, `fetchMyPosts(userId)`, `fetchLiked(userId)`, plus
  `uploadWardrobeImage(image, userId)` following the `lib/upload.ts` pattern.
- `components/AnimatedTabBar.tsx` + `app/(tabs)/_layout.tsx` — register the 6th
  tab: Ionicons `shirt-outline` / `shirt`, ghost label `WARDROBE`.

## Data flow

- **Swipe:** `fetchDeck` selects `wardrobe_posts` where `user_id != me` and
  `id NOT IN (my swipes)`, newest first, limited (e.g. 20). Render top ~3 cards.
  Right swipe → insert `{direction:'like'}` (optimistic: pop card, count++);
  left swipe → insert `{direction:'pass'}` (pop card). Prefetch the next page as
  the stack runs low.
- **Upload:** pick image → run `cleanPhoto` with the chosen toggles for the
  preview → on post, upload the resulting (processed or original) image to
  `wardrobe-images` → insert a `wardrobe_posts` row with `face_hidden` /
  `bg_removed` flags → it appears in My Wardrobe.
- **Liked:** `fetchLiked` = `wardrobe_swipes` where `direction='like'` joined to
  the posts.

## Error handling

- Cleaning is best-effort (same fallback contract as today: failure/timeout →
  original image, never blocks posting).
- Optimistic swipes revert on insert failure.
- Uploads guarded; failed upload surfaces a toast and does not create a row.
- Empty deck → friendly empty state. RLS enforces all ownership rules.

## Testing

- **vitest (pure logic):** deck exclusion filter (own + already-swiped removed);
  a swipe-state reducer for the deck; the new `photoClean` option gating (both
  toggles off/on combinations choose the right compositing path — tested via the
  pure decision logic, not the canvas).
- **Playwright (web):** Wardrobe tab renders the three sections; upload screen
  shows the two toggles and posts.
- **Migrations** applied to the Supabase project; RLS verified with the advisors.

## Implementation phasing (for the plan)

1. Data model — migrations (tables, trigger, RLS, bucket) + `lib/wardrobe.ts`
   queries.
2. `lib/photoClean` options extension (+ unit tests).
3. Wardrobe upload flow (`app/wardrobe/new.tsx` + `uploadWardrobeImage`).
4. Swipe deck (`SwipeDeck` + `WardrobeCard`) and `fetchDeck`/`swipe` wiring.
5. My Wardrobe + Liked grids (`WardrobeGrid`).
6. Tab registration (`_layout` + `AnimatedTabBar`).

## Out of scope (v1)

- Mutual matching / chat unlock.
- Shop-the-look / linking a post to marketplace listings.
- Multiple photos per post.
- Showing a post owner the list of users who liked (counts only).
- Comments, follows-based wardrobe feeds, reporting/moderation UI.
- Native on-device hide (depends on the separate Phase-2 native photoClean work).
