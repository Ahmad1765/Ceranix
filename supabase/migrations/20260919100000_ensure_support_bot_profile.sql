-- Migration: Ensure Support Bot Profile Exists
-- Inserts the canonical Ceranix Support assistant profile into public.profiles

insert into public.profiles (
  id,
  username,
  full_name,
  avatar_url,
  bio,
  location,
  rating,
  total_sales
) values (
  '00000000-0000-0000-0000-000000000001',
  'ceranix_support',
  'Ceranix Support',
  'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=200&auto=format&fit=crop&q=80',
  'Official Ceranix Customer Support & Help Assistant. Available 24/7.',
  'Ceranix Care, PK',
  5.0,
  9999
) on conflict (id) do update set
  username = excluded.username,
  full_name = excluded.full_name,
  avatar_url = excluded.avatar_url,
  bio = excluded.bio,
  location = excluded.location;
