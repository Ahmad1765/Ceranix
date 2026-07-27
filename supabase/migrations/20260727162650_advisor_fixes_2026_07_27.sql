-- 1. Close an object-enumeration hole on the wardrobe-images bucket. The
--    bucket is public (storage.buckets.public = true), so plain object GETs
--    already work with no RLS policy at all — same as avatars/listing-images,
--    neither of which has a SELECT policy. This broad policy only enabled the
--    Storage API's list/metadata endpoints, which the app never calls
--    (lib/upload.ts only uses getPublicUrl/remove), so it did nothing but let
--    any client enumerate every uploaded filename (including other users'
--    upload paths) via /storage/v1/object/list/wardrobe-images.
drop policy if exists "Wardrobe images are publicly readable" on storage.objects;

-- 2. Two FK columns on reports had no covering index (flagged by the
--    performance advisor) — moderator/admin lookups by reporter or reported
--    user would do a seq scan as the table grows.
create index if not exists reports_reporter_id_idx on public.reports (reporter_id);
create index if not exists reports_reported_user_id_idx on public.reports (reported_user_id);

-- 3. reports_insert_own / reports_select_own re-evaluated auth.uid() per row
--    instead of once per query (auth_rls_initplan advisor warning). Wrap in a
--    scalar subselect so the planner caches it.
drop policy if exists reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert
  with check ((select auth.uid()) = reporter_id);

drop policy if exists reports_select_own on public.reports;
create policy reports_select_own on public.reports
  for select
  using ((select auth.uid()) = reporter_id);
