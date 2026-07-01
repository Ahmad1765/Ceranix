-- Ceranix — wardrobe (social style discovery). Mirrors follows.sql patterns.
-- Idempotent: safe to re-run.

-- ── posts ────────────────────────────────────────────────────────────────
create table if not exists public.wardrobe_posts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade not null,
  image_url    text not null,
  caption      text,
  tags         text[] not null default '{}',
  face_hidden  boolean not null default false,
  bg_removed   boolean not null default false,
  likes_count  integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists wardrobe_posts_user_idx on public.wardrobe_posts (user_id);
create index if not exists wardrobe_posts_created_idx on public.wardrobe_posts (created_at desc);

alter table public.wardrobe_posts enable row level security;

drop policy if exists "Wardrobe posts are viewable by everyone" on public.wardrobe_posts;
create policy "Wardrobe posts are viewable by everyone"
  on public.wardrobe_posts for select using (true);

drop policy if exists "Users insert their own wardrobe posts" on public.wardrobe_posts;
create policy "Users insert their own wardrobe posts"
  on public.wardrobe_posts for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own wardrobe posts" on public.wardrobe_posts;
create policy "Users update their own wardrobe posts"
  on public.wardrobe_posts for update using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own wardrobe posts" on public.wardrobe_posts;
create policy "Users delete their own wardrobe posts"
  on public.wardrobe_posts for delete using ((select auth.uid()) = user_id);

-- ── swipes ───────────────────────────────────────────────────────────────
create table if not exists public.wardrobe_swipes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references public.wardrobe_posts(id) on delete cascade not null,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  direction  text not null check (direction in ('like','pass')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists wardrobe_swipes_user_idx on public.wardrobe_swipes (user_id);
create index if not exists wardrobe_swipes_post_idx on public.wardrobe_swipes (post_id);

alter table public.wardrobe_swipes enable row level security;

drop policy if exists "Users read their own swipes" on public.wardrobe_swipes;
create policy "Users read their own swipes"
  on public.wardrobe_swipes for select using ((select auth.uid()) = user_id);

drop policy if exists "Users insert their own swipes" on public.wardrobe_swipes;
create policy "Users insert their own swipes"
  on public.wardrobe_swipes for insert with check ((select auth.uid()) = user_id);

drop policy if exists "Users update their own swipes" on public.wardrobe_swipes;
create policy "Users update their own swipes"
  on public.wardrobe_swipes for update using ((select auth.uid()) = user_id);

drop policy if exists "Users delete their own swipes" on public.wardrobe_swipes;
create policy "Users delete their own swipes"
  on public.wardrobe_swipes for delete using ((select auth.uid()) = user_id);

-- ── likes_count trigger ───────────────────────────────────────────────────
create or replace function public.handle_wardrobe_swipe_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (tg_op = 'INSERT') then
    if new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'UPDATE') then
    if old.direction = 'like' and new.direction <> 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = new.post_id;
    elsif old.direction <> 'like' and new.direction = 'like' then
      update public.wardrobe_posts set likes_count = likes_count + 1 where id = new.post_id;
    end if;
    return new;
  elsif (tg_op = 'DELETE') then
    if old.direction = 'like' then
      update public.wardrobe_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists on_wardrobe_swipe_change on public.wardrobe_swipes;
create trigger on_wardrobe_swipe_change
  after insert or update or delete on public.wardrobe_swipes
  for each row execute procedure public.handle_wardrobe_swipe_change();

revoke execute on function public.handle_wardrobe_swipe_change() from public, anon, authenticated;

-- ── storage bucket ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('wardrobe-images', 'wardrobe-images', true)
on conflict (id) do nothing;

drop policy if exists "Wardrobe images are publicly readable" on storage.objects;
create policy "Wardrobe images are publicly readable"
  on storage.objects for select using (bucket_id = 'wardrobe-images');

drop policy if exists "Users upload wardrobe images to their folder" on storage.objects;
create policy "Users upload wardrobe images to their folder"
  on storage.objects for insert
  with check (
    bucket_id = 'wardrobe-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users delete their own wardrobe images" on storage.objects;
create policy "Users delete their own wardrobe images"
  on storage.objects for delete
  using (
    bucket_id = 'wardrobe-images'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
