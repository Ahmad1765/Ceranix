-- Performance cleanup. Idempotent — safe to re-run.
-- No behavior changes. This migration:
--   1. Wraps auth.uid() in (select ...) on legacy policies so it's evaluated
--      once per query instead of once per row (Postgres initplan optimization).
--   2. Splits the listing_likes "ALL" policy into explicit INSERT/UPDATE/DELETE
--      so the public SELECT policy isn't shadowed by an overlapping one.
--   3. Covers the messages.sender_id foreign key with an index.

-- profiles
drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile" on public.profiles
  for update using ((select auth.uid()) = id);

-- listings
drop policy if exists "Sellers can insert own listings" on public.listings;
create policy "Sellers can insert own listings" on public.listings
  for insert with check ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can update own listings" on public.listings;
create policy "Sellers can update own listings" on public.listings
  for update using ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can delete own listings" on public.listings;
create policy "Sellers can delete own listings" on public.listings
  for delete using ((select auth.uid()) = seller_id);

-- conversations
drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations
  for select using ((select auth.uid()) = buyer_id or (select auth.uid()) = seller_id);

-- messages
drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages" on public.messages
  for select using (
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
  for insert with check (
    (select auth.uid()) = sender_id and
    exists (
      select 1 from public.conversations c
      where c.id = conversation_id
      and ((select auth.uid()) = c.buyer_id or (select auth.uid()) = c.seller_id)
    )
  );

-- listing_likes: drop the catch-all ALL policy and replace with explicit
-- INSERT/UPDATE/DELETE so SELECT is governed only by "Likes viewable by
-- everyone" — eliminates the multiple-permissive-policies warning.
drop policy if exists "Users can manage own likes" on public.listing_likes;
drop policy if exists "Users can insert own likes" on public.listing_likes;
drop policy if exists "Users can update own likes" on public.listing_likes;
drop policy if exists "Users can delete own likes" on public.listing_likes;
create policy "Users can insert own likes" on public.listing_likes
  for insert with check ((select auth.uid()) = user_id);
create policy "Users can update own likes" on public.listing_likes
  for update using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users can delete own likes" on public.listing_likes
  for delete using ((select auth.uid()) = user_id);

-- Cover the messages.sender_id FK.
create index if not exists messages_sender_idx
  on public.messages(sender_id);
