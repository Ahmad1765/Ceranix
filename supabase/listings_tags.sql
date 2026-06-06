-- Ceranix — listing tags + similarity RPCs (mirrors live).
-- Run after setup.sql. Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- Per-listing tags (hashtags). Free-form seller input; normalised to lowercase
-- words on insert via the upload screen. The GIN index supports tag-array
-- containment queries (e.g. `tags && ARRAY['arcteryx']::text[]`) from discover
-- and saved-search match logic.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.listings
  add column if not exists tags text[] not null default '{}'::text[];

create index if not exists listings_tags_gin_idx
  on public.listings using gin (tags);

-- Trigram search on titles. pg_trgm lives in the public schema on the live
-- project — keeping that for parity. The advisor flags this as "extension in
-- public" (WARN); reshuffling it to `extensions` is a separate cleanup.
create extension if not exists pg_trgm;

create index if not exists listings_title_trgm_idx
  on public.listings using gin (title gin_trgm_ops);

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: find_seller_other_listings — "more from this seller"
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.find_seller_other_listings(
  p_seller_id uuid,
  p_exclude_id uuid,
  p_limit integer default 6
)
returns setof public.listings
language sql
stable
set search_path = public
as $$
  select l.*
  from public.listings l
  where l.seller_id = p_seller_id
    and l.is_sold = false
    and (p_exclude_id is null or l.id <> p_exclude_id)
  order by
    coalesce(l.likes, 0) desc,
    l.created_at desc
  limit greatest(1, least(p_limit, 24))
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: find_similar_listings — composite-scored recommendations
-- Scoring uses brand match, title trigram similarity, category, gender,
-- size, condition, price closeness, recent likes, and a recency boost.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.find_similar_listings(
  p_listing_id uuid,
  p_limit integer default 6
)
returns setof public.listings
language sql
stable
set search_path = public
as $$
  with target as (
    select id, seller_id, category, gender, brand, size, condition, price, title
    from public.listings
    where id = p_listing_id
  )
  select l.*
  from public.listings l
  join target t on true
  join public.profiles p on p.id = l.seller_id
  where l.id <> t.id
    and l.is_sold = false
    and coalesce(p.vacation_mode, false) = false
  order by
    (
      (case when l.category = t.category then 30 else 0 end)
      + (case when l.seller_id <> t.seller_id then 15 else 0 end)
      + (case when l.brand is not null and t.brand is not null
              and lower(l.brand) = lower(t.brand) then 40 else 0 end)
      + (case when l.gender = t.gender or l.gender = 'all' or t.gender = 'all' then 12 else 0 end)
      + (case when l.size is not null and t.size is not null
              and lower(l.size) = lower(t.size) then 10 else 0 end)
      + (case when l.condition = t.condition then 8 else 0 end)
      + greatest(
          0,
          (20 - (abs(l.price - t.price)::numeric / nullif(t.price, 0)) * 40)::int
        )
      + coalesce((similarity(coalesce(l.title,''), coalesce(t.title,'')) * 25)::int, 0)
      + least(8, coalesce(l.likes, 0))
      + (case when l.created_at > now() - interval '14 days' then 4 else 0 end)
    ) desc,
    l.likes desc nulls last,
    l.created_at desc
  limit greatest(1, least(p_limit, 24))
$$;
