-- ════════════════════════════════════════════════════════════════════════
-- Recommendation engine: per-user view tracking + hybrid recommender RPC.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Per-user view history. One row per (user, listing); repeat views bump
--    view_count + last_viewed_at. This is the signal the old `views` counter
--    never captured (nothing ever incremented it).
create table public.listing_views (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  view_count integer not null default 1,
  first_viewed_at timestamptz not null default now(),
  last_viewed_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create index listing_views_user_recent_idx on public.listing_views(user_id, last_viewed_at desc);
create index listing_views_listing_idx on public.listing_views(listing_id);

alter table public.listing_views enable row level security;

-- Own rows only: view history is private browsing data.
create policy "Users read own view history" on public.listing_views
  for select to authenticated
  using ((select auth.uid()) = user_id);
-- No insert/update policies: all writes go through log_listing_view below.

-- 2) View logger. SECURITY DEFINER because it also bumps listings.views,
--    which RLS otherwise only lets the seller update. Pinned caller identity:
--    it only ever writes rows for auth.uid().
create or replace function public.log_listing_view(p_listing_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_fresh boolean := false;
begin
  if v_uid is null then
    return; -- anonymous views aren't tracked
  end if;
  -- Don't count sellers viewing their own listing.
  if exists (select 1 from public.listings l where l.id = p_listing_id and l.seller_id = v_uid) then
    return;
  end if;

  insert into public.listing_views as lv (user_id, listing_id)
  values (v_uid, p_listing_id)
  on conflict (user_id, listing_id) do update
    set view_count = lv.view_count + 1,
        last_viewed_at = now()
    -- 30-min dedupe window: navigating back and forth isn't a new view
    where lv.last_viewed_at < now() - interval '30 minutes';

  -- FOUND is true only when a row was inserted or actually updated, i.e. a
  -- "fresh" view past the dedupe window — only then bump the public counter.
  v_fresh := found;
  if v_fresh then
    update public.listings set views = coalesce(views, 0) + 1 where id = p_listing_id;
  end if;
end;
$$;

revoke execute on function public.log_listing_view(uuid) from public, anon;
grant execute on function public.log_listing_view(uuid) to authenticated, service_role;

-- 3) Hybrid recommender. SECURITY INVOKER on purpose: every read runs under
--    the caller's RLS (own likes/saves/orders/views/searches; public likes
--    and follows power the collaborative part). Signals:
--      • taste profile  — engagement-weighted category/brand/gender/price
--                         affinities with 30-day exponential time decay
--                         (purchase 6 > save 3.5 > like 2.5 > view ≤2)
--      • item-to-item CF — "users who liked what I engaged with also liked…"
--      • social         — listings from sellers the user follows
--      • intent         — matches against the user's saved searches
--      • quality prior  — popularity + freshness decay + seller trust
--      • exploration    — small jitter, stable per day, so the feed varies
--                         day to day without reshuffling on every render
--    Cold start (no signals) degrades gracefully to quality prior + jitter,
--    i.e. a trending feed. Diversity cap: max 2 listings per seller.
create or replace function public.get_recommendations(p_limit integer default 24)
returns table (
  id uuid,
  seller_id uuid,
  title text,
  brand text,
  size text,
  price integer,
  category text,
  gender text,
  condition text,
  images text[],
  is_sold boolean,
  likes integer,
  tags text[],
  created_at timestamptz,
  rec_score numeric,
  rec_reason text
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
with me as (
  select auth.uid() as uid
),
-- ── Raw engagement signals, weighted by type ────────────────────────────
signals as (
  select s.listing_id, s.weight, s.ts
  from me, lateral (
    select ll.listing_id, 2.5::numeric as weight, ll.created_at as ts
    from listing_likes ll where ll.user_id = me.uid
    union all
    select i.listing_id, 3.5, i.created_at
    from save_list_items i
    join save_lists sl on sl.id = i.list_id
    where sl.user_id = me.uid
    union all
    select o.listing_id, 6.0, o.created_at
    from orders o where o.buyer_id = me.uid
    union all
    select v.listing_id, least(v.view_count, 4) * 0.5, v.last_viewed_at
    from listing_views v where v.user_id = me.uid
  ) s
),
-- 30-day exponential time decay: yesterday's like outweighs last month's
engaged as (
  select s.listing_id,
         sum(s.weight * exp(-extract(epoch from (now() - s.ts)) / 86400.0 / 30.0)) as w
  from signals s
  group by 1
),
profile_items as (
  select e.listing_id, e.w, l.category, lower(l.brand) as brand, l.gender, l.price
  from engaged e
  join listings l on l.id = e.listing_id
),
profile_total as (
  select coalesce(sum(w), 0) as tw from profile_items
),
cat_aff as (
  select category, sum(w) as w from profile_items group by 1
),
brand_aff as (
  select brand, sum(w) as w from profile_items where brand is not null group by 1
),
gender_aff as (
  select gender, sum(w) as w from profile_items where gender is not null and gender <> 'all' group by 1
),
price_profile as (
  select case when sum(w) > 0 then sum(price * w) / sum(w) end as avg_price
  from profile_items
),
-- ── Item-to-item collaborative filtering (likes are public-readable) ────
neighbors as (
  select ll.user_id, count(*)::numeric as overlap
  from me, listing_likes ll
  join engaged e on e.listing_id = ll.listing_id
  where ll.user_id is distinct from me.uid
  group by ll.user_id
),
cf as (
  select ll.listing_id, sum(n.overlap) as raw
  from neighbors n
  join listing_likes ll on ll.user_id = n.user_id
  where not exists (select 1 from engaged e where e.listing_id = ll.listing_id)
  group by 1
),
cf_max as (
  select greatest(max(raw), 1) as m from cf
),
-- ── Social + explicit intent ────────────────────────────────────────────
followed as (
  select uf.followee_id from me, user_follows uf where uf.follower_id = me.uid
),
intents as (
  select ss.query, ss.category, ss.gender
  from me, saved_searches ss where ss.user_id = me.uid
),
-- ── Candidates: active, not own, not already engaged; bounded for scale ──
candidates as (
  select l.id, l.seller_id, l.title, l.brand, l.size, l.price, l.category,
         l.gender, l.condition, l.images, l.is_sold, l.likes, l.tags,
         l.created_at, l.views,
         p.is_verified, p.rating as seller_rating
  from me, listings l
  join profiles p on p.id = l.seller_id
  where l.is_sold = false
    and coalesce(p.vacation_mode, false) = false
    and l.seller_id is distinct from me.uid
    and not exists (select 1 from engaged e where e.listing_id = l.id)
  order by l.created_at desc
  limit 500   -- candidate pruning: newest 500; widen if catalog outgrows it
),
scored as (
  select c.*,
    -- taste affinity, each normalized by total profile weight
    coalesce((select ca.w from cat_aff ca where ca.category = c.category), 0)
      / nullif((select tw from profile_total), 0) as s_cat,
    coalesce((select ba.w from brand_aff ba where ba.brand = lower(c.brand)), 0)
      / nullif((select tw from profile_total), 0) as s_brand,
    coalesce((select ga.w from gender_aff ga where ga.gender = c.gender), 0)
      / nullif((select tw from profile_total), 0) as s_gender,
    case when (select avg_price from price_profile) is not null
         then exp(-abs(c.price - (select avg_price from price_profile))
                  / greatest((select avg_price from price_profile), 1))
         else 0 end as s_price,
    -- collaborative
    coalesce((select cf.raw from cf where cf.listing_id = c.id), 0)
      / (select m from cf_max) as s_cf,
    -- social
    case when exists (select 1 from followed f where f.followee_id = c.seller_id)
         then 1 else 0 end as s_social,
    -- explicit intent from saved searches
    case when exists (
      select 1 from intents i
      where (i.category is null or i.category = c.category)
        and (i.gender is null or i.gender = 'all' or i.gender = c.gender)
        and (i.query is null or i.query = ''
             or c.title ilike '%' || i.query || '%'
             or coalesce(c.brand, '') ilike '%' || i.query || '%')
        and not (i.category is null and (i.query is null or i.query = ''))
    ) then 1 else 0 end as s_intent,
    -- quality prior: bounded popularity + engagement rate + freshness + trust
    least(coalesce(c.likes, 0), 50) / 50.0 as s_pop,
    coalesce(c.likes, 0)::numeric / (coalesce(c.views, 0) + 20) as s_rate,
    exp(-extract(epoch from (now() - c.created_at)) / 86400.0 / 21.0) as s_fresh,
    (case when coalesce(c.is_verified, false) then 0.5 else 0 end
     + coalesce(c.seller_rating, 0) / 10.0) as s_trust,
    -- deterministic daily jitter for exploration
    (abs(hashtextextended(c.id::text || to_char(now(), 'YYYY-MM-DD'), 0)) % 1000) / 1000.0 as s_jitter
  from candidates c
),
weighted as (
  select s.*,
    ( 3.00 * s.s_intent
    + 2.50 * s.s_cf
    + 1.50 * coalesce(s.s_cat, 0)
    + 1.50 * coalesce(s.s_brand, 0)
    + 0.50 * coalesce(s.s_gender, 0)
    + 0.75 * s.s_price
    + 1.25 * s.s_social
    + 1.00 * s.s_pop
    + 1.50 * s.s_rate
    + 1.25 * s.s_fresh
    + 0.30 * s.s_trust
    + 0.35 * s.s_jitter
    ) as score,
    case greatest(
           3.00 * s.s_intent,
           2.50 * s.s_cf,
           1.50 * coalesce(s.s_cat, 0) + 1.50 * coalesce(s.s_brand, 0)
             + 0.50 * coalesce(s.s_gender, 0) + 0.75 * s.s_price,
           1.25 * s.s_social,
           1.00 * s.s_pop + 1.50 * s.s_rate + 1.25 * s.s_fresh)
      when 3.00 * s.s_intent then 'intent'
      when 2.50 * s.s_cf then 'cf'
      when 1.25 * s.s_social then 'social'
      when 1.50 * coalesce(s.s_cat, 0) + 1.50 * coalesce(s.s_brand, 0)
             + 0.50 * coalesce(s.s_gender, 0) + 0.75 * s.s_price then 'taste'
      else 'trending'
    end as reason
  from scored s
),
-- Diversity: at most 2 listings per seller in the final ranking
diversified as (
  select w.*,
         row_number() over (partition by w.seller_id order by w.score desc) as seller_rank
  from weighted w
)
select d.id, d.seller_id, d.title, d.brand, d.size, d.price, d.category,
       d.gender, d.condition, d.images, d.is_sold, d.likes, d.tags,
       d.created_at,
       round(d.score, 4) as rec_score,
       d.reason as rec_reason
from diversified d
where d.seller_rank <= 2
order by d.score desc
limit greatest(1, least(coalesce(p_limit, 24), 60));
$$;

-- Anyone may call: signed-out users get the trending cold-start path.
grant execute on function public.get_recommendations(integer) to anon, authenticated, service_role;
