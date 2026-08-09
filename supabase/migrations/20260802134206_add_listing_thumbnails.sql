-- listings.thumbnails — small, card-sized copies of listings.images.
--
-- Why: the feed renders each photo into a ~194px-wide tile, but every card was
-- downloading the full stored upload. Measured on the home feed: 10 images,
-- 20.3 MB, natural sizes up to 4284x5712 for a 194x258 tile. Even a correctly
-- compressed upload (1440px long edge, ~260 KB) is ~8x more bytes than the tile
-- needs, and that overhead is permanent — it is paid on every feed impression.
--
-- Supabase's own image transformation CDN would solve this on the serving side,
-- but it is a Pro-plan feature billed per 1,000 origin images, so the sizes are
-- generated once at upload time instead (see lib/upload.ts) and stored here.
--
-- Nullable on purpose, with no default:
--   * NULL          — a row created before this column existed. Readers fall
--                     back to images[i], i.e. exactly today's behaviour.
--   * text[]        — index-aligned with images; thumbnails[i] is the small
--                     copy of images[i].
--
-- Index alignment is safe to rely on because listings.images is only ever
-- written once, at insert (components/sell/SellSheet.tsx). Nothing in the app
-- mutates the array afterwards — the only later UPDATE on a listing is
-- is_sold — so the two arrays cannot drift. If an image-editing flow is ever
-- added it must write both arrays together.
alter table public.listings
  add column if not exists thumbnails text[];

comment on column public.listings.thumbnails is
  'Card-sized copies of images[], index-aligned. NULL on rows predating the column; readers fall back to images[i].';
