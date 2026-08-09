-- Discover "Aesthetics" tab moves from a hardcoded style catalog to the
-- live hashtags sellers already attach to listings (public.listings.tags,
-- see supabase/listings_tags.sql). Mirrors get_brand_index's shape/pattern
-- exactly, just unnesting the tags array instead of reading a single column
-- — so the index is created/removed automatically as tags come and go.

create or replace function public.get_tag_index(p_query text default null, p_limit integer default 100)
returns table(tag text, item_count bigint, image text)
language sql
stable
set search_path = public
as $$
  with live as (
    select t as tag_name, l.images[1] as image, l.created_at
    from public.listings l, unnest(l.tags) as t
    where l.is_sold = false
  ),
  filtered as (
    select *
    from live
    where coalesce(btrim(p_query), '') = ''
       or tag_name ilike
          '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select
    tag_name as tag,
    count(*)::bigint as item_count,
    (array_agg(image order by created_at desc) filter (where image is not null))[1] as image
  from filtered
  group by tag_name
  order by item_count desc, tag asc
  limit least(greatest(coalesce(p_limit, 100), 1), 200);
$$;

create or replace function public.get_tag_listings(p_tag text, p_limit integer default 60)
returns setof listings
language sql
stable
set search_path = public
as $$
  select l.*
  from public.listings l
  where p_tag is not null
    and btrim(p_tag) <> ''
    and lower(btrim(p_tag)) = any(l.tags)
    and l.is_sold = false
  order by l.likes desc nulls last, l.created_at desc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;

revoke execute on function public.get_tag_index(text, integer) from public;
revoke execute on function public.get_tag_listings(text, integer) from public;
grant execute on function public.get_tag_index(text, integer) to anon, authenticated, service_role;
grant execute on function public.get_tag_listings(text, integer) to anon, authenticated, service_role;

-- Superseded by get_tag_index / get_tag_listings above.
drop function if exists public.get_aesthetic_index(jsonb);
drop function if exists public.get_aesthetic_listings(jsonb, integer);
