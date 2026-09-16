-- Migration: Add authenticity and taxonomy_version to public.listings
-- Supports App Store compliant 'inspired' as well as 'original', 'replica', 'not_sure'
alter table public.listings
  add column if not exists authenticity text
  check (authenticity in ('original', 'replica', 'inspired', 'not_sure'))
  default null;

alter table public.listings
  add column if not exists taxonomy_version integer;

comment on column public.listings.authenticity is 'Seller-declared authenticity: original, inspired (master copy), replica, or not_sure.';
comment on column public.listings.taxonomy_version is 'Taxonomy version identifier (e.g. 3 for carrinex_taxonomy_v3).';
