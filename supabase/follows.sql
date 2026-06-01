-- Ceranix Follows (real social media follow graph)
-- Run once in the Supabase SQL editor.

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
  on public.user_follows for insert with check (auth.uid() = follower_id);

drop policy if exists "Users can unfollow" on public.user_follows;
create policy "Users can unfollow"
  on public.user_follows for delete using (auth.uid() = follower_id);

-- Denormalized counts on the profile for cheap reads.
alter table public.profiles
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0;

create or replace function public.handle_follow_change()
returns trigger as $$
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
$$ language plpgsql security definer;

drop trigger if exists on_follow_change on public.user_follows;
create trigger on_follow_change
  after insert or delete on public.user_follows
  for each row execute procedure public.handle_follow_change();
