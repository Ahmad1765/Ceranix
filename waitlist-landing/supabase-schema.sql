-- ==============================================================================
-- Grabsty Lahore Waitlist Schema & RLS Policies for Supabase
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/ttxestvncdynsssmjqhk/sql
-- ==============================================================================

-- 1. Create the waitlist table (or upgrade existing table)
create table if not exists public.waitlist (
  id uuid default gen_random_uuid() primary key,
  name text not null default '',
  phone text not null default '',
  email text unique,
  city text default 'Lahore',
  interest text default 'both' check (interest in ('architecture', 'fashion', 'both')),
  role text default 'buyer' check (role in ('buyer', 'seller', 'both')),
  ticket_number integer,
  referral_code text,
  referred_by text,
  created_at timestamptz default now()
);

-- Migration steps for existing waitlist tables
alter table public.waitlist add column if not exists name text not null default '';
alter table public.waitlist add column if not exists phone text not null default '';
alter table public.waitlist add column if not exists city text default 'Lahore';
alter table public.waitlist add column if not exists interest text default 'both';
alter table public.waitlist alter column email drop not null;

-- 2. Create index on phone, email, and referral_code for fast lookup
create index if not exists idx_waitlist_phone on public.waitlist (phone);
create index if not exists idx_waitlist_email on public.waitlist (email);
create index if not exists idx_waitlist_referral_code on public.waitlist (referral_code);

-- 3. Enable Row Level Security (RLS)
alter table public.waitlist enable row level security;

-- 4. Allow anonymous visitors to join the waitlist (Insert Policy)
drop policy if exists "Allow anonymous waitlist registration" on public.waitlist;
create policy "Allow anonymous waitlist registration"
  on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

-- 5. Allow anonymous visitors to count signups or look up their ticket (Select Policy)
drop policy if exists "Allow anonymous select on waitlist" on public.waitlist;
create policy "Allow anonymous select on waitlist"
  on public.waitlist
  for select
  to anon, authenticated
  using (true);

-- 6. Comment documentation
comment on table public.waitlist is 'Grabsty Lahore Resale & Architecture Design Waitlist';
