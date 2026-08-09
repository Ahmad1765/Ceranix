-- Ceranix — base schema snapshot (mirrors live project ttxestvncdynsssmjqhk).
-- Idempotent: safe to re-run.
--
-- Run this in the Supabase SQL editor (Project → SQL → New query → paste → Run).
-- After running, the storage buckets `listing-images` and `avatars` will both
-- exist as PUBLIC.
--
-- This file contains only the *base* objects:
--   - profiles, listings, conversations, messages, listing_likes
--   - handle_new_user trigger on auth.users
--   - bump_listing_likes trigger
--   - Storage buckets + their RLS policies
--
-- Feature-specific objects (saves, follows, saved searches, chat offers,
-- price history, tags, address upsert, perf indexes) live in their own
-- migration files and run AFTER this one.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────────────────────
-- profiles
-- (Extra trust columns vacation_mode / bundle_discount_pct / is_verified /
-- is_pro / expo_push_token / followers_count / following_count are added in
-- their own migrations — profile_features.sql and follows.sql — so this file
-- stays minimal.)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  full_name text,
  avatar_url text,
  bio text,
  location text,
  rating numeric(3,2) default 0,
  total_sales integer default 0,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "Profiles are viewable by everyone" on public.profiles;
create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

-- Auto-create a profile row on signup. Username defaults to email prefix +
-- a 12-char uniqueness suffix. On 5 consecutive collisions, fall through to
-- a guaranteed-unique fallback derived from the new user's UUID so we never
-- orphan an auth.users row.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  base_username text;
  candidate text;
  attempts int := 0;
begin
  base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9_]', '', 'g'));
  if base_username is null or length(base_username) = 0 then
    base_username := 'user';
  end if;

  loop
    candidate := base_username || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
    begin
      insert into public.profiles (id, username, full_name)
      values (
        new.id,
        candidate,
        coalesce(new.raw_user_meta_data->>'full_name', base_username)
      )
      on conflict (id) do nothing;
      return new;
    exception when unique_violation then
      attempts := attempts + 1;
      if attempts >= 5 then
        insert into public.profiles (id, username, full_name)
        values (
          new.id,
          'user_' || replace(new.id::text, '-', ''),
          coalesce(new.raw_user_meta_data->>'full_name', base_username)
        )
        on conflict (id) do nothing;
        return new;
      end if;
    end;
  end loop;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- listings
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.listings (
  id uuid default gen_random_uuid() primary key,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  price integer not null,
  category text not null check (category in ('clothing','shoes','bags','accessories','electronics','beauty','other')),
  gender text not null check (gender in ('all','men','women','unisex')),
  brand text,
  size text,
  condition text not null check (condition in ('new_with_tags','like_new','good','fair')),
  images text[] not null default '{}',
  is_sold boolean default false,
  views integer default 0,
  likes integer default 0,
  created_at timestamptz default now()
);

-- The `tags` text[] column and its GIN index are added in listings_tags.sql.
-- Active-feed partial indexes live in perf_cleanup.sql.

create index if not exists listings_seller_idx on public.listings(seller_id);
create index if not exists listings_created_at_idx on public.listings(created_at desc);
create index if not exists listings_likes_idx on public.listings(likes desc, created_at desc);

alter table public.listings enable row level security;

drop policy if exists "Listings viewable by everyone" on public.listings;
create policy "Listings viewable by everyone" on public.listings
  for select using (true);

drop policy if exists "Sellers can insert own listings" on public.listings;
create policy "Sellers can insert own listings" on public.listings
  for insert with check ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can update own listings" on public.listings;
create policy "Sellers can update own listings" on public.listings
  for update using ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can delete own listings" on public.listings;
create policy "Sellers can delete own listings" on public.listings
  for delete using ((select auth.uid()) = seller_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- conversations + messages (base shape)
-- Extra columns (last_sender_id, message kind/metadata/offer_status/updated_at)
-- and the offer-specific RLS + triggers live in chat_offers.sql.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.conversations (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references public.listings(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  last_message text,
  updated_at timestamptz default now(),
  unique (listing_id, buyer_id)
);

alter table public.conversations enable row level security;

drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations
  for select using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

create table if not exists public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
  for insert with check (
    (select auth.uid()) = sender_id and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- listing_likes
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.listing_likes (
  user_id uuid references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (user_id, listing_id)
);

create index if not exists listing_likes_listing_idx on public.listing_likes(listing_id);
create index if not exists listing_likes_user_idx on public.listing_likes(user_id, created_at desc);

alter table public.listing_likes enable row level security;

drop policy if exists "Likes viewable by everyone" on public.listing_likes;
create policy "Likes viewable by everyone" on public.listing_likes
  for select using (true);

drop policy if exists "Users can insert own likes" on public.listing_likes;
create policy "Users can insert own likes" on public.listing_likes
  for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update own likes" on public.listing_likes;
create policy "Users can update own likes" on public.listing_likes
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete own likes" on public.listing_likes;
create policy "Users can delete own likes" on public.listing_likes
  for delete using ((select auth.uid()) = user_id);

-- Keep listings.likes denormalized counter in sync.
create or replace function public.bump_listing_likes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if tg_op = 'INSERT' then
    update public.listings set likes = coalesce(likes, 0) + 1 where id = new.listing_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.listings set likes = greatest(coalesce(likes, 0) - 1, 0) where id = old.listing_id;
    return old;
  end if;
  return null;
end;
$$;

revoke execute on function public.bump_listing_likes() from public, anon, authenticated;

drop trigger if exists on_listing_like_change on public.listing_likes;
create trigger on_listing_like_change
  after insert or delete on public.listing_likes
  for each row execute procedure public.bump_listing_likes();

-- ─────────────────────────────────────────────────────────────────────────────
-- Storage buckets + policies
-- ─────────────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('listing-images', 'listing-images', true)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

drop policy if exists "Public read listing-images" on storage.objects;
create policy "Public read listing-images" on storage.objects
  for select using (bucket_id = 'listing-images');

drop policy if exists "Authenticated upload listing-images" on storage.objects;
create policy "Authenticated upload listing-images" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner update listing-images" on storage.objects;
create policy "Owner update listing-images" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner delete listing-images" on storage.objects;
create policy "Owner delete listing-images" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'listing-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "Authenticated upload avatars" on storage.objects;
create policy "Authenticated upload avatars" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner update avatars" on storage.objects;
create policy "Owner update avatars" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "Owner delete avatars" on storage.objects;
create policy "Owner delete avatars" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
