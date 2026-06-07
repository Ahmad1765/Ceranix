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
