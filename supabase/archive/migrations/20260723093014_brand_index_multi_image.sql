-- Brands tab moves back to a multi-photo hero card (matches the Aesthetics
-- tag cards' collage-capable shape): return up to 3 recent cover shots per
-- brand instead of just the newest one. Return type changes, so drop +
-- recreate rather than CREATE OR REPLACE.
drop function if exists public.get_brand_index(text, integer);

create function public.get_brand_index(p_query text default null, p_limit integer default 60)
returns table(brand text, item_count bigint, images text[])
language sql
stable
set search_path = public
as $$
  with live as (
    select btrim(l.brand) as brand_name,
           l.images[1] as image,
           l.created_at
    from public.listings l
    where l.is_sold = false
      and l.brand is not null
      and btrim(l.brand) <> ''
  ),
  filtered as (
    select *
    from live
    where coalesce(btrim(p_query), '') = ''
       or brand_name ilike
          '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  )
  select
    (array_agg(brand_name order by created_at desc))[1] as brand,
    count(*)::bigint as item_count,
    coalesce(
      (array_agg(image order by created_at desc) filter (where image is not null))[1:3],
      '{}'::text[]
    ) as images
  from filtered
  group by lower(brand_name)
  order by item_count desc, brand asc
  limit least(greatest(coalesce(p_limit, 60), 1), 100);
$$;

revoke execute on function public.get_brand_index(text, integer) from public;
grant execute on function public.get_brand_index(text, integer) to anon, authenticated, service_role;
