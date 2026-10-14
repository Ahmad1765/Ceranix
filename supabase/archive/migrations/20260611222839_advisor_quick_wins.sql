-- 1) RLS initplan fixes: wrap auth.uid() in (select ...) so it's evaluated
--    once per query instead of per row (advisor lint 0003).
drop policy if exists "Users manage own save lists" on public.save_lists;
create policy "Users manage own save lists" on public.save_lists
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users manage own save list items" on public.save_list_items;
create policy "Users manage own save list items" on public.save_list_items
  for all to authenticated
  using (exists (
    select 1 from public.save_lists l
    where l.id = save_list_items.list_id and l.user_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.save_lists l
    where l.id = save_list_items.list_id and l.user_id = (select auth.uid())
  ));

drop policy if exists "Users can view their own saved searches" on public.saved_searches;
create policy "Users can view their own saved searches" on public.saved_searches
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own saved searches" on public.saved_searches;
create policy "Users can insert their own saved searches" on public.saved_searches
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own saved searches" on public.saved_searches;
create policy "Users can update their own saved searches" on public.saved_searches
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own saved searches" on public.saved_searches;
create policy "Users can delete their own saved searches" on public.saved_searches
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- 2) These RPCs are auth-only by design (they all check auth.uid() internally);
--    revoke anon EXECUTE so logged-out clients can't even invoke them
--    (advisor lints 0028/0029). NOTE: superseded by
--    20260611223243_revoke_public_execute_on_rpcs.sql which also revokes the
--    implicit PUBLIC grant.
revoke execute on function public.ensure_save_lists(uuid) from anon;
revoke execute on function public.toggle_follow(uuid) from anon;
revoke execute on function public.get_follow_state(uuid) from anon;
revoke execute on function public.saved_search_new_matches(uuid) from anon;
revoke execute on function public.upsert_shipping_address_with_default(jsonb) from anon;

-- 3) Move pg_trgm out of the exposed public schema (advisor lint 0014).
--    Existing trgm indexes reference operators by OID, so they keep working.
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;
