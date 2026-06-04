-- Per-listing tags (hashtags). Free-form seller input; normalised to lowercase
-- words on insert via the upload screen. The GIN index supports tag-array
-- containment queries (e.g. `tags && ARRAY['arcteryx']::text[]`) from discover
-- and saved-search match logic.
--
-- Safe to re-run.

alter table public.listings
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists listings_tags_gin_idx
  on public.listings using gin (tags);
