-- Migration: Ensure Support Bot Profile Exists
-- 1. Ensure the support bot user exists in auth.users so foreign key constraint profiles_id_fkey is satisfied
insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
) values (
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'support@ceranix.internal',
  '',
  now(),
  '{"provider": "system", "providers": ["system"]}'::jsonb,
  '{"full_name": "Ceranix Support"}'::jsonb,
  now(),
  now()
) on conflict (id) do nothing;

-- 2. Inserts or updates the canonical Ceranix Support assistant profile in public.profiles
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
  location = excluded.location,
  rating = excluded.rating,
  total_sales = excluded.total_sales;
