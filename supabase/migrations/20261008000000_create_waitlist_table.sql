-- Migration: 20261008000000_create_waitlist_table.sql
-- Description: Create public.waitlist table with RLS for Grabsty private alpha waitlist

create table if not exists public.waitlist (
  id uuid default gen_random_uuid() primary key,
  email text not null unique,
  role text default 'buyer' check (role in ('buyer', 'seller', 'both')),
  ticket_number integer,
  referral_code text,
  referred_by text,
  created_at timestamptz default now()
);

-- Indexes for lightning-fast queries
create index if not exists idx_waitlist_email on public.waitlist (email);
create index if not exists idx_waitlist_referral_code on public.waitlist (referral_code);
create index if not exists idx_waitlist_referred_by on public.waitlist (referred_by);

-- Enable Row Level Security
alter table public.waitlist enable row level security;

-- Drop existing policies if any
drop policy if exists "Allow anonymous waitlist registration" on public.waitlist;
drop policy if exists "Allow anonymous select on waitlist" on public.waitlist;

-- 1. Insert policy for anonymous visitors
create policy "Allow anonymous waitlist registration"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- 2. Select policy for anonymous visitors (to count total entries or check referral position)
create policy "Allow anonymous select on waitlist"
  on public.waitlist
  for select
  to anon, authenticated
  using (true);

comment on table public.waitlist is 'Grabsty Private Alpha Cohort 01 registration list';
