-- Carrinex Database Schema
-- Run this in your Supabase SQL editor

-- Users (extends Supabase auth.users)
create table public.profiles (
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

create policy "Profiles are viewable by everyone" on public.profiles
  for select using (true);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create profile on signup
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, full_name)
  values (
    new.id,
    split_part(new.email, '@', 1),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Listings
create table public.listings (
  id uuid default gen_random_uuid() primary key,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text,
  price numeric(10,2) not null, -- in USD
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

alter table public.listings enable row level security;

create policy "Listings viewable by everyone" on public.listings
  for select using (true);

create policy "Sellers can insert own listings" on public.listings
  for insert with check (auth.uid() = seller_id);

create policy "Sellers can update own listings" on public.listings
  for update using (auth.uid() = seller_id);

create policy "Sellers can delete own listings" on public.listings
  for delete using (auth.uid() = seller_id);

-- Messages
create table public.conversations (
  id uuid default gen_random_uuid() primary key,
  listing_id uuid references public.listings(id) on delete set null,
  buyer_id uuid references public.profiles(id) on delete cascade not null,
  seller_id uuid references public.profiles(id) on delete cascade not null,
  last_message text,
  updated_at timestamptz default now(),
  unique (listing_id, buyer_id)
);

alter table public.conversations enable row level security;

create policy "Participants can view conversations" on public.conversations
  for select using (auth.uid() = buyer_id or auth.uid() = seller_id);

create table public.messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references public.conversations(id) on delete cascade not null,
  sender_id uuid references public.profiles(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now()
);

alter table public.messages enable row level security;

create policy "Participants can view messages" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and (auth.uid() = c.buyer_id or auth.uid() = c.seller_id)
    )
  );

create policy "Participants can send messages" on public.messages
  for insert with check (
    auth.uid() = sender_id and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and (auth.uid() = c.buyer_id or auth.uid() = c.seller_id)
    )
  );

-- Likes / Saves
create table public.listing_likes (
  user_id uuid references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  primary key (user_id, listing_id)
);

alter table public.listing_likes enable row level security;

create policy "Users can manage own likes" on public.listing_likes
  for all using (auth.uid() = user_id);

-- Storage buckets
-- Run in Supabase dashboard > Storage
-- Create bucket: listing-images (public)
