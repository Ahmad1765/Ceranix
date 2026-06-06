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
  if new.is_verified is distinct from old.is_verified
     or new.is_pro      is distinct from old.is_pro
     or new.rating      is distinct from old.rating
     or new.total_sales is distinct from old.total_sales then
    raise exception 'profile trust fields (is_verified, is_pro, rating, total_sales) are read-only';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_profile_trust on public.profiles;
create trigger trg_guard_profile_trust
  before update on public.profiles
  for each row execute procedure public.guard_profile_trust_fields();

revoke execute on function public.guard_profile_trust_fields() from public, anon, authenticated;

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
