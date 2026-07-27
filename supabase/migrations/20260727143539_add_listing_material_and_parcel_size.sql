alter table public.listings
  add column material text,
  add column parcel_size text check (parcel_size in ('small', 'medium', 'large'));
