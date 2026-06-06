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
