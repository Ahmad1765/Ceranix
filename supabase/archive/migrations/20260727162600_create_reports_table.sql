-- public.reports — trust & safety reports raised from the product page.
--
-- WHY THIS FILE EXISTS
-- This table has been live since the trust & safety work, but its DDL was never
-- committed: 20260727162650_advisor_fixes_2026_07_27.sql adds indexes and RLS
-- policies to it, and nothing in the repository ever created it. Applying this
-- project's SQL to an empty Postgres therefore failed with
-- `relation "public.reports" does not exist` — which is exactly what the
-- supabase-check workflow is for, and it had been unable to reach this point
-- because it died earlier on missing Supabase roles.
--
-- Reconstructed from the live schema (columns, defaults, nullability and all
-- four constraints), so applying it to production is a no-op via IF NOT EXISTS.
-- Timestamped 50 seconds before the advisor migration so it sorts ahead of the
-- file that depends on it.
--
-- RLS policies and indexes are deliberately NOT repeated here — they already
-- live in 20260727162650, which runs immediately after this.

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  -- A report can target a listing, a user, or both; hence both nullable.
  listing_id uuid references public.listings(id) on delete cascade,
  -- SET NULL rather than CASCADE: if the reported account is deleted the report
  -- itself must survive as a record that it was made.
  reported_user_id uuid references auth.users(id) on delete set null,
  reason text not null,
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

alter table public.reports enable row level security;
