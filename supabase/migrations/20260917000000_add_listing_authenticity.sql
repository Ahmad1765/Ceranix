-- Migration: Add authenticity and taxonomy_version to public.listings
-- Supports App Store compliant 'inspired' as well as 'original', 'replica', 'not_sure'
alter table public.listings
  add column if not exists authenticity text default null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'listings_authenticity_check'
      and conrelid = 'public.listings'::regclass
  ) then
    alter table public.listings
      add constraint listings_authenticity_check
      check (authenticity in ('original', 'replica', 'inspired', 'not_sure'));
  end if;
end $$;

alter table public.listings
  add column if not exists taxonomy_version integer;

comment on column public.listings.authenticity is 'Seller-declared authenticity: original, inspired (master copy), replica, or not_sure.';
comment on column public.listings.taxonomy_version is 'Taxonomy version identifier (e.g. 3 for carrinex_taxonomy_v3).';
