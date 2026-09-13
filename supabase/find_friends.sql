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

-- 3) Match Contacts RPC (SECURITY DEFINER) -----------------------------------
-- Given an array of up to 500 peppered hashes from the viewer's device address
-- book, returns matching registered profiles.
-- NOTE: Never returns the hashes themselves or any raw contact details.
create or replace function public.match_contacts(p_hashes text[])
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  is_verified boolean,
  followers_count integer
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

  if p_hashes is null or array_length(p_hashes, 1) = 0 then
    return;
  end if;

  return query
  select distinct
    p.id,
    p.username,
    p.full_name,
    p.avatar_url,
    coalesce(p.is_verified, false) as is_verified,
    coalesce(p.followers_count, 0) as followers_count
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

  -- Insert or ignore phone hashes
  if p_phone_hashes is not null then
    foreach v_hash in array p_phone_hashes loop
      if v_hash is not null and length(trim(v_hash)) > 0 then
        insert into public.user_contact_hashes (user_id, hash_type, hash_value)
        values (v_viewer_id, 'phone', trim(v_hash))
        on conflict (user_id, hash_type, hash_value) do nothing;
      end if;
    end loop;
  end if;

  -- Insert or ignore email hashes
  if p_email_hashes is not null then
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
