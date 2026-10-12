
-- === supabase/setup.sql ===
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


-- === supabase/profile_features.sql ===
-- Ceranix — profile feature backend (mirrors live).
-- Run after setup.sql. Idempotent: safe to re-run.

-- 1) Extra columns on profiles ------------------------------------------------
alter table public.profiles
  add column if not exists vacation_mode boolean default false not null,
  add column if not exists bundle_discount_pct int default 0 not null
    check (bundle_discount_pct >= 0 and bundle_discount_pct <= 30),
  add column if not exists is_verified boolean default false not null,
  add column if not exists is_pro boolean default false not null,
  add column if not exists expo_push_token text;

-- Case-insensitive unique username (hardens edit flow).
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(username));

-- 2) Shipping addresses -------------------------------------------------------
create table if not exists public.shipping_addresses (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  recipient_name text not null,
  line1 text not null,
  line2 text,
  city text not null,
  state text,
  postal_code text not null,
  country text not null,
  phone text,
  is_default boolean default false not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists shipping_addresses_user_idx on public.shipping_addresses(user_id);
-- At most one default address per user.
create unique index if not exists shipping_addresses_one_default_idx
  on public.shipping_addresses(user_id) where is_default = true;

alter table public.shipping_addresses enable row level security;

drop policy if exists "addresses_select_own" on public.shipping_addresses;
drop policy if exists "addresses_insert_own" on public.shipping_addresses;
drop policy if exists "addresses_update_own" on public.shipping_addresses;
drop policy if exists "addresses_delete_own" on public.shipping_addresses;

create policy "addresses_select_own" on public.shipping_addresses
  for select using ((select auth.uid()) = user_id);
create policy "addresses_insert_own" on public.shipping_addresses
  for insert with check ((select auth.uid()) = user_id);
create policy "addresses_update_own" on public.shipping_addresses
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "addresses_delete_own" on public.shipping_addresses
  for delete using ((select auth.uid()) = user_id);

-- 3) Payout methods -----------------------------------------------------------
create table if not exists public.payout_methods (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  kind text not null check (kind in ('bank','wallet')),
  label text not null,
  account_last4 text not null check (account_last4 ~ '^[0-9]{4}$'),
  is_default boolean default false not null,
  created_at timestamptz default now()
);
create index if not exists payout_methods_user_idx on public.payout_methods(user_id);
-- At most one default payout per user.
create unique index if not exists payout_methods_one_default_idx
  on public.payout_methods(user_id) where is_default = true;

alter table public.payout_methods enable row level security;

drop policy if exists "payouts_select_own" on public.payout_methods;
drop policy if exists "payouts_insert_own" on public.payout_methods;
drop policy if exists "payouts_update_own" on public.payout_methods;
drop policy if exists "payouts_delete_own" on public.payout_methods;

create policy "payouts_select_own" on public.payout_methods
  for select using ((select auth.uid()) = user_id);
create policy "payouts_insert_own" on public.payout_methods
  for insert with check ((select auth.uid()) = user_id);
create policy "payouts_update_own" on public.payout_methods
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "payouts_delete_own" on public.payout_methods
  for delete using ((select auth.uid()) = user_id);

-- 4) Identity verifications ---------------------------------------------------
create table if not exists public.verifications (
  user_id uuid references public.profiles(id) on delete cascade primary key,
  status text not null default 'submitted'
    check (status in ('submitted','approved','rejected')),
  legal_name text not null,
  document_kind text not null check (document_kind in ('passport','national_id','drivers_license')),
  document_number_last4 text,
  notes text,
  submitted_at timestamptz default now() not null,
  reviewed_at timestamptz
);

alter table public.verifications enable row level security;

drop policy if exists "verify_select_own" on public.verifications;
drop policy if exists "verify_insert_own" on public.verifications;
drop policy if exists "verify_update_own" on public.verifications;

create policy "verify_select_own" on public.verifications
  for select using ((select auth.uid()) = user_id);
create policy "verify_insert_own" on public.verifications
  for insert with check ((select auth.uid()) = user_id);
create policy "verify_update_own" on public.verifications
  for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 5) Account deletion request log --------------------------------------------
create table if not exists public.account_deletion_requests (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null,
  email text,
  reason text,
  created_at timestamptz default now() not null
);

alter table public.account_deletion_requests enable row level security;

drop policy if exists "deletion_insert_own" on public.account_deletion_requests;
create policy "deletion_insert_own" on public.account_deletion_requests
  for insert with check ((select auth.uid()) = user_id);

-- 5b) Block users from forging trust/status fields ---------------------------
-- Owner-RLS policies on profiles & verifications allow owner UPDATEs at the
-- row level. These triggers add column-level guards so owners can't promote
-- themselves to verified/pro or mark their own verification approved. The
-- service_role bypass lets edge functions / admin RPCs still mutate.
create or replace function public.guard_profile_trust_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified then
    if coalesce(current_setting('app.auth_override_is_verified', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_verified) is read-only';
    end if;
  end if;

  if new.is_pro is distinct from old.is_pro then
    if coalesce(current_setting('app.auth_override_is_pro', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_pro) is read-only';
    end if;
  end if;

  if new.rating is distinct from old.rating then
    if coalesce(current_setting('app.auth_override_rating', true), '') <> 'authorized' then
      raise exception 'profile trust field (rating) is read-only';
    end if;
  end if;

  if new.total_sales is distinct from old.total_sales then
    if coalesce(current_setting('app.auth_override_total_sales', true), '') <> 'authorized' then
      raise exception 'profile trust field (total_sales) is read-only';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_trust on public.profiles;
create trigger trg_guard_profile_trust
  before update on public.profiles
  for each row execute procedure public.guard_profile_trust_fields();

revoke execute on function public.guard_profile_trust_fields() from public, anon, authenticated;

-- 5c) Verified seller program subscription RPC ------------------------------
create or replace function public.update_seller_subscription(p_user_id uuid, p_is_pro boolean)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Permission denied: update_seller_subscription may only be called by service_role';
  end if;

  perform set_config('app.auth_override_is_pro', 'authorized', true);

  update public.profiles
     set is_pro = p_is_pro,
         updated_at = now()
   where id = p_user_id
  returning * into v_profile;

  perform set_config('app.auth_override_is_pro', 'off', true);

  if v_profile.id is null then
    raise exception 'profile not found';
  end if;

  return v_profile;
end;
$$;

revoke execute on function public.update_seller_subscription(uuid, boolean) from public, anon, authenticated;
grant  execute on function public.update_seller_subscription(uuid, boolean) to service_role;

create or replace function public.guard_verification_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'submitted' then
      raise exception 'new verifications must start as submitted';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      raise exception 'verification status may only be changed by reviewers';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_verification_status on public.verifications;
create trigger trg_guard_verification_status
  before insert or update on public.verifications
  for each row execute procedure public.guard_verification_status();

revoke execute on function public.guard_verification_status() from public, anon, authenticated;

-- 6) Auto-update updated_at on shipping_addresses ----------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_addresses_touch on public.shipping_addresses;
create trigger trg_addresses_touch
  before update on public.shipping_addresses
  for each row execute procedure public.touch_updated_at();


-- === supabase/chat_offers.sql ===
-- Ceranix — chat + offers backend (mirrors live).
-- Run after setup.sql. Idempotent: safe to re-run.

-- ─────────────────────────────────────────────────────────────────────────────
-- conversations: track last sender, allow buyers to start + participants to update
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.conversations
  add column if not exists last_sender_id uuid references public.profiles(id) on delete set null;

create index if not exists conversations_buyer_idx
  on public.conversations(buyer_id, updated_at desc);
create index if not exists conversations_seller_idx
  on public.conversations(seller_id, updated_at desc);
create index if not exists conversations_last_sender_idx
  on public.conversations(last_sender_id);
-- Deduplicate any existing direct conversations between the same participant pair before creating the unique index
do $$
declare
  has_offer_trigger boolean;
  has_reactions_table boolean;
begin
  -- Serialize direct-conversation deduplication and unique index creation against concurrent inserts
  lock table public.conversations in share row exclusive mode;

  drop table if exists _conv_duplicates;
  create temp table _conv_duplicates on commit drop as
  with ranked as (
    select
      id,
      least(buyer_id, seller_id) as p1,
      greatest(buyer_id, seller_id) as p2,
      row_number() over (
        partition by least(buyer_id, seller_id), greatest(buyer_id, seller_id)
        order by
          (exists (select 1 from public.messages m where m.conversation_id = c.id)) desc,
          updated_at desc nulls last,
          id asc
      ) as rn,
      first_value(id) over (
        partition by least(buyer_id, seller_id), greatest(buyer_id, seller_id)
        order by
          (exists (select 1 from public.messages m where m.conversation_id = c.id)) desc,
          updated_at desc nulls last,
          id asc
      ) as canonical_id
    from public.conversations c
    where listing_id is null
  )
  select id as duplicate_id, canonical_id
  from ranked
  where rn > 1;

  if exists (select 1 from _conv_duplicates) then
    select exists (
      select 1
      from pg_trigger
      where tgname = 'trg_validate_offer_status_update'
        and tgrelid = 'public.messages'::regclass
    ) into has_offer_trigger;

    if has_offer_trigger then
      execute 'alter table public.messages disable trigger trg_validate_offer_status_update';
    end if;

    update public.messages m
    set conversation_id = d.canonical_id
    from _conv_duplicates d
    where m.conversation_id = d.duplicate_id;

    if has_offer_trigger then
      execute 'alter table public.messages enable trigger trg_validate_offer_status_update';
    end if;

    select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = 'message_reactions'
    ) into has_reactions_table;

    if has_reactions_table then
      execute '
        update public.message_reactions mr
        set conversation_id = d.canonical_id
        from _conv_duplicates d
        where mr.conversation_id = d.duplicate_id';
    end if;

    delete from public.conversations c
    using _conv_duplicates d
    where c.id = d.duplicate_id;

    update public.conversations c
    set
      updated_at = sub.latest_created_at,
      last_message = left(sub.content, 140),
      last_sender_id = sub.sender_id
    from (
      select distinct on (conversation_id)
        conversation_id, content, sender_id, created_at as latest_created_at
      from public.messages
      where conversation_id in (select canonical_id from _conv_duplicates)
      order by conversation_id, created_at desc
    ) sub
    where c.id = sub.conversation_id
      and (c.updated_at is null or sub.latest_created_at > c.updated_at);
  end if;

  -- Create unique index while retaining the table lock within the same transaction
  execute 'create unique index if not exists direct_conversations_participants_idx
    on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id))
    where listing_id is null';
end $$;

create unique index if not exists direct_conversations_participants_idx
  on public.conversations (least(buyer_id, seller_id), greatest(buyer_id, seller_id))
  where listing_id is null;

-- The "Participants can view" policy already exists in setup.sql; INSERT/UPDATE
-- are added here so the client can create and bump conversations from the app.
-- auth.uid() is wrapped in (select ...) so it's evaluated once per query.
drop policy if exists "Buyers can create conversations" on public.conversations;
create policy "Buyers can create conversations" on public.conversations
  for insert with check ((select auth.uid()) = buyer_id);

drop policy if exists "Participants can update conversations" on public.conversations;
create policy "Participants can update conversations" on public.conversations
  for update using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id)
  with check ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- messages: support text + offer messages
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists kind text not null default 'text'
    check (kind in ('text','offer','system')),
  add column if not exists metadata jsonb,
  add column if not exists offer_status text
    check (offer_status in ('pending','accepted','declined','expired','withdrawn')),
  add column if not exists updated_at timestamptz default now() not null;

create index if not exists messages_conversation_created_idx
  on public.messages(conversation_id, created_at);
create index if not exists messages_sender_idx
  on public.messages(sender_id);

-- Allow participants to update offer_status on offer messages (accept / decline).
-- The policy is just an authorization gate; the BEFORE UPDATE trigger below
-- enforces who can change what and that no other columns are mutated.
drop policy if exists "Participants can update offer status" on public.messages;
create policy "Participants can update offer status" on public.messages
  for update using (
    kind = 'offer' and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  ) with check (
    kind = 'offer' and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Validate offer_status updates: only counterparty accepts/declines, only
-- sender withdraws, only service_role can mark expired, no other columns may
-- be mutated, valid transitions only.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.validate_offer_status_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  buyer  uuid;
  seller uuid;
  counterparty uuid;
begin
  if old.kind <> 'offer' then
    return new;
  end if;

  -- Block mutation of any column other than offer_status / updated_at.
  if new.conversation_id is distinct from old.conversation_id
     or new.sender_id      is distinct from old.sender_id
     or new.content        is distinct from old.content
     or new.kind           is distinct from old.kind
     or new.metadata       is distinct from old.metadata
     or new.created_at     is distinct from old.created_at then
    raise exception 'offer messages: only offer_status may be updated';
  end if;

  -- Short-circuit on metadata-only no-op.
  if new.offer_status is not distinct from old.offer_status then
    return new;
  end if;

  -- Only pending offers may transition.
  if old.offer_status is distinct from 'pending' then
    raise exception 'offer is no longer pending (current: %)', old.offer_status;
  end if;

  -- Valid target states.
  if new.offer_status not in ('accepted','declined','expired','withdrawn') then
    raise exception 'invalid offer_status transition: % -> %',
      old.offer_status, new.offer_status;
  end if;

  select c.buyer_id, c.seller_id
    into buyer, seller
    from public.conversations c
    where c.id = old.conversation_id;

  if buyer is null then
    raise exception 'conversation not found for message';
  end if;

  -- Counterparty = whichever participant did NOT send the offer.
  counterparty := case when old.sender_id = buyer then seller else buyer end;

  if new.offer_status = 'withdrawn' then
    if caller is distinct from old.sender_id then
      raise exception 'only the offer sender may withdraw';
    end if;
  elsif new.offer_status in ('accepted','declined') then
    if caller is distinct from counterparty then
      raise exception 'only the counterparty may accept or decline this offer';
    end if;
  elsif new.offer_status = 'expired' then
    -- Reserved for service / scheduled jobs (auth.uid() is null). Authenticated
    -- callers must use withdrawn/declined instead.
    if caller is not null then
      raise exception 'only service role may mark offers expired';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_offer_status_update on public.messages;
create trigger trg_validate_offer_status_update
  before update on public.messages
  for each row execute procedure public.validate_offer_status_update();

revoke execute on function public.validate_offer_status_update() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bump conversation.last_message + updated_at when a new message lands
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.bump_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  preview text;
begin
  if new.kind = 'offer' then
    preview := 'Offer: Rs ' || coalesce((new.metadata->>'amount'), '?');
  else
    preview := left(new.content, 140);
  end if;
  update public.conversations
    set last_message = preview,
        last_sender_id = new.sender_id,
        updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists on_message_insert_bump_conversation on public.messages;
create trigger on_message_insert_bump_conversation
  after insert on public.messages
  for each row execute procedure public.bump_conversation_on_message();

revoke execute on function public.bump_conversation_on_message() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Touch messages.updated_at on any update (offer accept/decline tracking)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_message_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_messages_touch on public.messages;
create trigger trg_messages_touch
  before update on public.messages
  for each row execute procedure public.touch_message_updated_at();

revoke execute on function public.touch_message_updated_at() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Realtime: make sure conversations + messages publish change events
-- ─────────────────────────────────────────────────────────────────────────────
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      execute 'alter publication supabase_realtime add table public.messages';
    exception when duplicate_object then null;
    end;
    begin
      execute 'alter publication supabase_realtime add table public.conversations';
    exception when duplicate_object then null;
    end;
  end if;
end$$;


-- === supabase/listing_price_history.sql ===
-- Ceranix — listing price history (mirrors live).
-- Captures every price change on `listings` so we can surface
-- "items you liked got cheaper" on the My Feed tab.
-- Run after setup.sql. Idempotent: safe to re-run.

create table if not exists public.listing_price_history (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  old_price numeric(10,2) not null,
  new_price numeric(10,2) not null,
  changed_at timestamptz not null default now()
);

create index if not exists listing_price_history_listing_changed_idx
  on public.listing_price_history (listing_id, changed_at desc);

create or replace function public.log_listing_price_change()
returns trigger language plpgsql security definer
set search_path = public, pg_temp
as $$
begin
  if new.price is distinct from old.price then
    insert into public.listing_price_history (listing_id, old_price, new_price)
    values (new.id, old.price, new.price);
  end if;
  return new;
end$$;

drop trigger if exists listings_price_change_trg on public.listings;
create trigger listings_price_change_trg
  after update on public.listings
  for each row execute function public.log_listing_price_change();

revoke execute on function public.log_listing_price_change() from public, anon, authenticated;

alter table public.listing_price_history enable row level security;

drop policy if exists "price history readable when listing readable"
  on public.listing_price_history;
create policy "price history readable when listing readable"
  on public.listing_price_history for select
  using (
    exists (
      select 1 from public.listings l
      where l.id = listing_price_history.listing_id
    )
  );


-- === supabase/follows.sql ===
-- Ceranix — follow graph + atomic RPCs (mirrors live).
-- Run after setup.sql. Idempotent: safe to re-run.

create table if not exists public.user_follows (
  follower_id uuid references public.profiles(id) on delete cascade not null,
  followee_id uuid references public.profiles(id) on delete cascade not null,
  created_at  timestamptz default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create index if not exists user_follows_followee_idx on public.user_follows (followee_id);
create index if not exists user_follows_follower_idx on public.user_follows (follower_id);

alter table public.user_follows enable row level security;

-- Follow graph is public-readable (so we can render follower counts, "X
-- follows you" etc.). Only the authenticated user can insert/delete rows
-- where they themselves are the follower.
drop policy if exists "Follows are viewable by everyone" on public.user_follows;
create policy "Follows are viewable by everyone"
  on public.user_follows for select using (true);

drop policy if exists "Users can follow others" on public.user_follows;
create policy "Users can follow others"
  on public.user_follows for insert with check ((select auth.uid()) = follower_id);

drop policy if exists "Users can unfollow" on public.user_follows;
create policy "Users can unfollow"
  on public.user_follows for delete using ((select auth.uid()) = follower_id);

-- Denormalized counts on the profile for cheap reads.
alter table public.profiles
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0;

-- ─────────────────────────────────────────────────────────────────────────────
-- Counter trigger
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.handle_follow_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where id = old.followee_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where id = old.follower_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_follow_change on public.user_follows;
create trigger on_follow_change
  after insert or delete on public.user_follows
  for each row execute procedure public.handle_follow_change();

revoke execute on function public.handle_follow_change() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_follow_state — { is_following, followers_count, following_count }
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.get_follow_state(p_followee uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'is_following', exists (
      select 1 from public.user_follows
      where follower_id = auth.uid() and followee_id = p_followee
    ),
    'followers_count', coalesce((select followers_count from public.profiles where id = p_followee), 0),
    'following_count', coalesce((select following_count from public.profiles where id = p_followee), 0)
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: toggle_follow — atomic follow/unfollow, returns new state
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.toggle_follow(p_followee uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_follower uuid := auth.uid();
  v_exists boolean;
  v_is_following boolean;
  v_followers int;
  v_following int;
begin
  if v_follower is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if v_follower = p_followee then
    raise exception 'cannot_follow_self' using errcode = '22023';
  end if;

  select exists (
    select 1 from public.user_follows
    where follower_id = v_follower and followee_id = p_followee
  ) into v_exists;

  if v_exists then
    delete from public.user_follows
    where follower_id = v_follower and followee_id = p_followee;
    v_is_following := false;
  else
    -- ON CONFLICT DO NOTHING absorbs the race where two concurrent toggle
    -- calls both saw v_exists = false. Whichever insert lost the race
    -- becomes a no-op; the row exists either way, so the post-state is
    -- "is_following = true" for both callers.
    insert into public.user_follows (follower_id, followee_id)
    values (v_follower, p_followee)
    on conflict do nothing;
    v_is_following := true;
  end if;

  select followers_count, following_count
    into v_followers, v_following
  from public.profiles where id = p_followee;

  return jsonb_build_object(
    'is_following', v_is_following,
    'followers_count', coalesce(v_followers, 0),
    'following_count', coalesce(v_following, 0)
  );
end;
$$;


-- === supabase/saved_searches.sql ===
-- Saved searches.
-- Run this in the Supabase SQL editor (or via `supabase db push`) once. The
-- News > Saved tab reads from this table; the Discover screen writes to it.

create extension if not exists "pgcrypto";

-- Reusable updated_at trigger. Safe to re-run.
-- search_path is pinned so a privileged caller can't shadow now() from a
-- user-controlled schema.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- Free-text query — what the user typed in the Discover search box.
  -- Nullable so a category-only or gender-only search can still be saved.
  query text,
  -- Category enum mirrors the listings table, but we don't enforce it via a
  -- check constraint here so the UI can save a "trending" pseudo-category.
  category text,
  gender text,
  -- A human-friendly label the user sees in the Saved tab. Falls back to
  -- query/category/gender in the UI when null.
  label text,
  -- When this search row was last surfaced to the user. Used to compute a
  -- "new matches" badge (count of listings created after this timestamp).
  last_seen_at timestamptz default now(),
  -- Whether the user wants push / email alerts for new matches. We don't
  -- send alerts yet (that's a follow-up feature); the flag lives here so the
  -- UI can toggle it without another migration.
  notify boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Drop the legacy plain-UNIQUE constraint if a prior migration installed it.
-- The plain unique() treated NULLs as distinct, so duplicate all-NULL saves
-- (e.g. category-only with no query/gender) slipped through.
alter table public.saved_searches
  drop constraint if exists saved_searches_user_query_unique;

-- Soft uniqueness: one saved search per (user, normalised query+filters)
-- combination. NULL filters compare equal via coalesce so a duplicate
-- "shirt + clothing" never appears twice.
create unique index if not exists saved_searches_user_query_unique_idx
  on public.saved_searches (
    user_id,
    coalesce(query, ''),
    coalesce(category, ''),
    coalesce(gender, '')
  );

alter table public.saved_searches enable row level security;

drop policy if exists "Users can view their own saved searches" on public.saved_searches;
create policy "Users can view their own saved searches"
  on public.saved_searches
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their own saved searches" on public.saved_searches;
create policy "Users can insert their own saved searches"
  on public.saved_searches
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their own saved searches" on public.saved_searches;
create policy "Users can update their own saved searches"
  on public.saved_searches
  for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete their own saved searches" on public.saved_searches;
create policy "Users can delete their own saved searches"
  on public.saved_searches
  for delete
  using (auth.uid() = user_id);

drop trigger if exists set_saved_searches_updated_at on public.saved_searches;
create trigger set_saved_searches_updated_at
  before update on public.saved_searches
  for each row execute procedure public.set_updated_at();

-- Index for the dashboard query (list user's searches newest-first).
create index if not exists saved_searches_user_created_at_idx
  on public.saved_searches (user_id, created_at desc);

-- Optional helper RPC: given a saved search, count listings created since
-- last_seen_at that match it. Lets the Saved tab show "3 new" badges
-- without round-tripping the full match list. SECURITY DEFINER so the user
-- doesn't need direct read on listings (RLS already permits this, but the
-- RPC pins the user_id check).
create or replace function public.saved_search_new_matches(p_search_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  s public.saved_searches%rowtype;
  c integer;
  escaped_query text;
begin
  select * into s from public.saved_searches where id = p_search_id;
  if not found or s.user_id <> auth.uid() then
    return 0;
  end if;

  -- Escape LIKE metacharacters so a saved query containing '%' or '_'
  -- matches them literally instead of acting as wildcards.
  escaped_query := replace(replace(replace(coalesce(s.query, ''),
                                           '\', '\\'),
                                   '%', '\%'),
                           '_', '\_');

  select count(*) into c
    from public.listings l
    where l.is_sold = false
      and (s.category is null or l.category = s.category)
      and (s.gender is null or l.gender = s.gender)
      and (
        s.query is null or s.query = ''
        or l.title ilike '%' || escaped_query || '%' escape '\'
        or coalesce(l.brand, '') ilike '%' || escaped_query || '%' escape '\'
      )
      and l.created_at > coalesce(s.last_seen_at, '1970-01-01'::timestamptz);
  return coalesce(c, 0);
end;
$$;

-- The RPC is for authenticated callers only — anon has no saved searches to
-- count. Revoke + grant explicitly so a future GRANT TO PUBLIC can't leak it.
revoke execute on function public.saved_search_new_matches(uuid) from anon;
revoke execute on function public.saved_search_new_matches(uuid) from public;
grant execute on function public.saved_search_new_matches(uuid) to authenticated;


-- === supabase/listings_tags.sql ===
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


-- === supabase/save_lists.sql ===
-- Ceranix — Pinterest-style save lists (mirrors live).
-- Run after setup.sql. Idempotent: safe to re-run.
--
-- save_lists       — collections the user creates (default "Saved" + presets).
-- save_list_items  — listings the user has saved into a list.
-- ensure_save_lists — RPC the client calls on first session to seed defaults.

-- ─────────────────────────────────────────────────────────────────────────────
-- save_lists
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.save_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  emoji text not null default '🔖',
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists save_lists_user_idx
  on public.save_lists (user_id, created_at desc);

-- At most one default list per user.
create unique index if not exists save_lists_user_default_idx
  on public.save_lists (user_id) where is_default;

alter table public.save_lists enable row level security;

drop policy if exists "Users manage own save lists" on public.save_lists;
create policy "Users manage own save lists" on public.save_lists
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- save_list_items
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.save_list_items (
  list_id uuid not null references public.save_lists(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (list_id, listing_id)
);

create index if not exists save_list_items_listing_idx
  on public.save_list_items (listing_id);

alter table public.save_list_items enable row level security;

-- Authorize via the parent list's ownership rather than copying user_id onto
-- every row — the list_id FK already pins the owner.
drop policy if exists "Users manage own save list items" on public.save_list_items;
create policy "Users manage own save list items" on public.save_list_items
  for all
  using (
    exists (
      select 1 from public.save_lists l
      where l.id = save_list_items.list_id
        and l.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.save_lists l
      where l.id = save_list_items.list_id
        and l.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: ensure_save_lists — idempotently seed the default + preset lists
-- for a user on first session. Safe to call on every app load.
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.ensure_save_lists(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SECURITY DEFINER bypasses RLS, so a misbehaving client could pass any
  -- p_user_id and seed lists on another user's behalf. Pin the caller and
  -- service_role to be the only writers; everyone else must operate on
  -- their own user_id. service_role is exempt so admin scripts can backfill.
  if coalesce(auth.role(), '') <> 'service_role'
     and (auth.uid() is null or auth.uid() <> p_user_id) then
    raise exception 'ensure_save_lists may only seed the caller''s own user_id';
  end if;

  -- Default "Saved" list — protected, always exists.
  insert into public.save_lists (user_id, name, emoji, is_default)
  select p_user_id, 'Saved', '🔖', true
  where not exists (
    select 1 from public.save_lists where user_id = p_user_id and is_default
  );
  -- Mock presets — only added if the user has no non-default lists yet, so
  -- a returning user with their own lists isn't re-polluted.
  if not exists (
    select 1 from public.save_lists where user_id = p_user_id and not is_default
  ) then
    insert into public.save_lists (user_id, name, emoji)
    values
      (p_user_id, 'Wishlist', '⭐'),
      (p_user_id, 'Gift ideas', '🎁'),
      (p_user_id, 'Saved for later', '🔖');
  end if;
end;
$$;


-- === supabase/perf_cleanup.sql ===
-- Ceranix — performance cleanup (mirrors live).
-- Idempotent: safe to re-run.
--
-- Two purposes:
--   1) Wrap auth.uid() in (select ...) on legacy policies so it's evaluated
--      once per query instead of once per row (Postgres initplan optimization).
--   2) Add partial indexes that target the common "active feed" / "active
--      sellers" queries so they don't have to scan over sold listings or
--      vacation-mode profiles.
--
-- The base setup.sql already creates the new-style policies; this file is
-- still safe to run because the DROP IF EXISTS / CREATE pair is a no-op when
-- the policy is already in its target shape.

-- ─────────────────────────────────────────────────────────────────────────────
-- Policy rewrites (auth.uid() → (select auth.uid()))
-- ─────────────────────────────────────────────────────────────────────────────

-- profiles
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

-- listings
drop policy if exists "Sellers can insert own listings" on public.listings;
create policy "Sellers can insert own listings" on public.listings
  for insert with check ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can update own listings" on public.listings;
create policy "Sellers can update own listings" on public.listings
  for update using ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can delete own listings" on public.listings;
create policy "Sellers can delete own listings" on public.listings
  for delete using ((select auth.uid()) = seller_id);

-- conversations
drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations
  for select using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

-- messages
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

-- listing_likes: drop the catch-all ALL policy and replace with explicit
-- INSERT/UPDATE/DELETE so SELECT is governed only by "Likes viewable by
-- everyone" — eliminates the multiple-permissive-policies warning.
drop policy if exists "Users can manage own likes" on public.listing_likes;
drop policy if exists "Users can insert own likes" on public.listing_likes;
drop policy if exists "Users can update own likes" on public.listing_likes;
drop policy if exists "Users can delete own likes" on public.listing_likes;
create policy "Users can insert own likes" on public.listing_likes
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own likes" on public.listing_likes
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own likes" on public.listing_likes
  for delete using ((select auth.uid()) = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Partial indexes for the "active feed" hot paths
-- ─────────────────────────────────────────────────────────────────────────────

-- Cover the messages.sender_id FK.
create index if not exists messages_sender_idx
  on public.messages(sender_id);

-- For-you feed: newest active listings.
create index if not exists listings_active_created_idx
  on public.listings (created_at desc)
  where is_sold = false;

-- Popular feed: highest-liked active listings.
create index if not exists listings_active_likes_idx
  on public.listings (likes desc, created_at desc)
  where is_sold = false;

-- Category browse on active listings.
create index if not exists listings_active_category_idx
  on public.listings (category, created_at desc)
  where is_sold = false;

-- Seller storefront: a profile's active listings newest-first.
create index if not exists listings_active_seller_idx
  on public.listings (seller_id, created_at desc)
  where is_sold = false;

-- Skip vacation-mode profiles in similarity / surface queries.
create index if not exists profiles_active_idx
  on public.profiles (id)
  where vacation_mode = false;


-- === supabase/upsert_shipping_address.sql ===
-- Carrinex — upsert + default-flag management for shipping_addresses.
-- Idempotent: safe to re-run.
--
-- SECURITY:
--   - SECURITY DEFINER with `set search_path = ''` and schema-qualified
--     identifiers to block search-path hijack.
--   - Derives the owner from `auth.uid()`, NOT the caller-supplied payload,
--     so the function cannot be coerced into rewriting another user's row.
--   - Execute revoked from `public`/`anon`; granted to `authenticated`.
--
-- ORDERING:
--   The partial unique index `shipping_addresses_one_default_idx`
--   (UNIQUE user_id WHERE is_default = true) means only one default row per
--   user can exist at any moment. We clear other defaults BEFORE the upsert
--   so the new/updated row doesn't collide with the previous default. The
--   caller's transaction rolls the clear back automatically if the upsert
--   raises.

create or replace function public.upsert_shipping_address_with_default(p_payload jsonb)
returns public.shipping_addresses
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_address public.shipping_addresses;
  v_user_id uuid := auth.uid();
  v_id uuid := nullif(p_payload->>'id', '')::uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;

  update public.shipping_addresses
     set is_default = false
   where user_id = v_user_id
     and is_default = true
     and (v_id is null or id <> v_id);

  if v_id is not null then
    update public.shipping_addresses
       set recipient_name = p_payload->>'recipient_name',
           line1          = p_payload->>'line1',
           line2          = p_payload->>'line2',
           city           = p_payload->>'city',
           state          = p_payload->>'state',
           postal_code    = p_payload->>'postal_code',
           country        = p_payload->>'country',
           phone          = p_payload->>'phone',
           is_default     = true
     where id = v_id and user_id = v_user_id
    returning * into v_address;

    if v_address.id is null then
      raise exception 'address not found or not owned by caller';
    end if;
  else
    insert into public.shipping_addresses (
      user_id, recipient_name, line1, line2, city, state, postal_code, country, phone, is_default
    ) values (
      v_user_id,
      p_payload->>'recipient_name',
      p_payload->>'line1',
      p_payload->>'line2',
      p_payload->>'city',
      p_payload->>'state',
      p_payload->>'postal_code',
      p_payload->>'country',
      p_payload->>'phone',
      true
    )
    returning * into v_address;
  end if;

  return v_address;
end;
$$;

revoke execute on function public.upsert_shipping_address_with_default(jsonb) from public, anon;
grant  execute on function public.upsert_shipping_address_with_default(jsonb) to authenticated;


-- === supabase/find_friends.sql ===
-- ─────────────────────────────────────────────────────────────────────────────
-- FIND FRIENDS & CONTACT SYNC SCHEMA & RPCS
-- ─────────────────────────────────────────────────────────────────────────────
-- Isolated, privacy-first contact hash storage.
-- Phone and email hashes are peppered client-side and never stored in plain text.
-- Direct table SELECT is denied to all roles; only SECURITY DEFINER RPCs access it.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Isolated Private Table ---------------------------------------------------
create table if not exists public.user_contact_hashes (
  user_id uuid references auth.users(id) on delete cascade not null,
  hash_type text not null check (hash_type in ('phone', 'email')),
  hash_value text not null,
  created_at timestamptz default now(),
  primary key (user_id, hash_type, hash_value)
);

create index if not exists user_contact_hashes_val_idx
  on public.user_contact_hashes (hash_value);

create index if not exists user_contact_hashes_user_idx
  on public.user_contact_hashes (user_id);

-- 2) Row Level Security (RLS) -------------------------------------------------
alter table public.user_contact_hashes enable row level security;

-- Users may only view or manage their own registered contact hashes.
-- Crucially, no policy allows reading another user's contact hashes directly.
drop policy if exists "Users manage own contact hashes" on public.user_contact_hashes;
create policy "Users manage own contact hashes"
  on public.user_contact_hashes
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Ensure project's rate_limit_events table exists for call accounting
create table if not exists public.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (user_id, action, created_at desc);

alter table public.rate_limit_events enable row level security;

create or replace function public.enforce_rate_limit(
  p_action text,
  p_limit  int,
  p_window interval
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    return;
  end if;

  -- Serialize rate-limit check per user and action to prevent race conditions
  perform pg_advisory_xact_lock(hashtext(v_uid::text), hashtext(p_action));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'rate_limit_exceeded'
      using
        errcode = 'P0001',
        message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
        hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
end;
$$;

revoke all on function public.enforce_rate_limit(text, int, interval) from public;

-- 3) Match Contacts RPC (SECURITY DEFINER) -----------------------------------
-- Given an array of up to 500 peppered hashes from the viewer's device address
-- book, returns matching registered profiles and the matched hash value.
create or replace function public.match_contacts(p_hashes text[])
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_verified boolean,
  followers_count integer,
  matched_hash text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_viewer_id uuid;
begin
  v_viewer_id := auth.uid();
  if v_viewer_id is null then
    return;
  end if;

  -- 1) Retain existing null / empty array handling
  if p_hashes is null or array_length(p_hashes, 1) = 0 then
    return;
  end if;

  -- 2) Enforce documented 500-hash payload limit before performing any scan
  if array_length(p_hashes, 1) > 500 then
    raise exception 'Payload exceeds maximum limit of 500 hashes per request (got %)', array_length(p_hashes, 1)
      using
        errcode = '22000',
        hint = 'Batch contact hashes into chunks of 500 or fewer.';
  end if;

  -- 3) Enforce per-authenticated-user rate limit (max 30 match calls per 1 minute)
  perform public.enforce_rate_limit('match_contacts', 30, interval '1 minute');

  return query
  select distinct
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    coalesce(p.is_verified, false) as is_verified,
    coalesce(p.followers_count, 0) as followers_count,
    h.hash_value as matched_hash
  from public.user_contact_hashes h
  join public.profiles p on p.id = h.user_id
  where h.user_id <> v_viewer_id
    and h.hash_value = any(p_hashes)
  order by followers_count desc, p.username asc
  limit 250;
end;
$$;

revoke all on function public.match_contacts(text[]) from public;
grant execute on function public.match_contacts(text[]) to authenticated;

-- 4) Register Caller's Own Contact Hashes RPC --------------------------------
-- When a user syncs contacts or updates their account, they register their own
-- phone and/or email hash so friends can discover them in reciprocal syncs.
create or replace function public.register_my_contact_hashes(
  p_phone_hashes text[] default null,
  p_email_hashes text[] default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_viewer_id uuid;
  v_hash text;
begin
  v_viewer_id := auth.uid();
  if v_viewer_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1) Enforce per-authenticated-user rate limit before processing arrays or mutating rows
  perform public.enforce_rate_limit('register_my_contact_hashes', 30, interval '1 minute');

  -- 2) Enforce small maximum size for each hash array
  if p_phone_hashes is not null and coalesce(array_length(p_phone_hashes, 1), 0) > 10 then
    raise exception 'Payload exceeds maximum limit of 10 phone hashes per request (got %)', array_length(p_phone_hashes, 1)
      using
        errcode = '22000',
        hint = 'Provide 10 or fewer phone hashes.';
  end if;

  if p_email_hashes is not null and coalesce(array_length(p_email_hashes, 1), 0) > 10 then
    raise exception 'Payload exceeds maximum limit of 10 email hashes per request (got %)', array_length(p_email_hashes, 1)
      using
        errcode = '22000',
        hint = 'Provide 10 or fewer email hashes.';
  end if;

  -- 3) Replace existing phone hashes for current user if phone hashes are supplied
  if p_phone_hashes is not null then
    delete from public.user_contact_hashes
     where user_id = v_viewer_id
       and hash_type = 'phone';

    foreach v_hash in array p_phone_hashes loop
      if v_hash is not null and length(trim(v_hash)) > 0 then
        insert into public.user_contact_hashes (user_id, hash_type, hash_value)
        values (v_viewer_id, 'phone', trim(v_hash))
        on conflict (user_id, hash_type, hash_value) do nothing;
      end if;
    end loop;
  end if;

  -- 4) Replace existing email hashes for current user if email hashes are supplied
  if p_email_hashes is not null then
    delete from public.user_contact_hashes
     where user_id = v_viewer_id
       and hash_type = 'email';

    foreach v_hash in array p_email_hashes loop
      if v_hash is not null and length(trim(v_hash)) > 0 then
        insert into public.user_contact_hashes (user_id, hash_type, hash_value)
        values (v_viewer_id, 'email', trim(v_hash))
        on conflict (user_id, hash_type, hash_value) do nothing;
      end if;
    end loop;
  end if;
end;
$$;

revoke all on function public.register_my_contact_hashes(text[], text[]) from public;
grant execute on function public.register_my_contact_hashes(text[], text[]) to authenticated;


-- === supabase/wardrobe.sql ===
-- Ceranix — wardrobe (social style discovery). Mirrors follows.sql patterns.
-- Idempotent: safe to re-run.

-- ── posts ────────────────────────────────────────────────────────────────
create table if not exists public.wardrobe_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade not null,
  image_url    text not null,
  caption      text,
  tags         text[] not null default '{}',
  face_hidden  boolean not null default false,
  bg_removed   boolean not null default false,
  likes_count  integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists wardrobe_posts_user_idx on public.wardrobe_posts (user_id);
create index if not exists wardrobe_posts_created_idx on public.wardrobe_posts (created_at desc);

alter table public.wardrobe_posts enable row level security;

drop policy if exists "Wardrobe posts are viewable by everyone" on public.wardrobe_posts;
create policy "Wardrobe posts are viewable by everyone"
  on public.wardrobe_posts for select using (true);

drop policy if exists "Users insert their own wardrobe posts" on public.wardrobe_posts;
create policy "Users insert their own wardrobe posts"
  on public.wardrobe_posts for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own wardrobe posts" on public.wardrobe_posts;
create policy "Users update their own wardrobe posts"
  on public.wardrobe_posts for update using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own wardrobe posts" on public.wardrobe_posts;
create policy "Users delete their own wardrobe posts"
  on public.wardrobe_posts for delete using ((select auth.uid()) = user_id);

-- ── swipes ───────────────────────────────────────────────────────────────
create table if not exists public.wardrobe_swipes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.wardrobe_posts(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  direction  text not null check (direction in ('like','pass')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists wardrobe_swipes_user_idx on public.wardrobe_swipes (user_id);
create index if not exists wardrobe_swipes_post_idx on public.wardrobe_swipes (post_id);

alter table public.wardrobe_swipes enable row level security;

drop policy if exists "Users read their own swipes" on public.wardrobe_swipes;
create policy "Users read their own swipes"
  on public.wardrobe_swipes for select using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own swipes" on public.wardrobe_swipes;
create policy "Users insert their own swipes"
  on public.wardrobe_swipes for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own swipes" on public.wardrobe_swipes;
create policy "Users update their own swipes"
  on public.wardrobe_swipes for update using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own swipes" on public.wardrobe_swipes;
create policy "Users delete their own swipes"
  on public.wardrobe_swipes for delete using ((select auth.uid()) = user_id);

-- ── likes_count trigger ───────────────────────────────────────────────────
create or replace function public.handle_wardrobe_swipe_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    if new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.direction = 'like' and new.direction <> 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = new.post_id;
    elsif old.direction <> 'like' and new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.direction = 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_wardrobe_swipe_change on public.wardrobe_swipes;
create trigger on_wardrobe_swipe_change
  after insert or update or delete on public.wardrobe_swipes
  for each row execute procedure public.handle_wardrobe_swipe_change();

revoke execute on function public.handle_wardrobe_swipe_change() from public, anon, authenticated;

-- ── storage bucket ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;

drop policy if exists "Wardrobe images are publicly readable" on storage.objects;
create policy "Wardrobe images are publicly readable"
  on storage.objects for select using (bucket_id = 'wardrobe-images');

drop policy if exists "Users upload wardrobe images to their folder" on storage.objects;
create policy "Users upload wardrobe images to their folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wardrobe-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete their own wardrobe images" on storage.objects;
create policy "Users delete their own wardrobe images"
  on storage.objects for delete
  using (
    bucket_id = 'wardrobe-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
