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
