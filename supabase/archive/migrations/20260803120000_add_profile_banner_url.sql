-- Profile banner image.
--
-- The banner is stored in the EXISTING `avatars` bucket under the owner's own
-- folder (`<user_id>/<uuid>.jpg`), exactly like the avatar. That is deliberate:
-- the bucket's owner-only write policy keys off the first path segment, so a
-- banner written to the same folder is already covered and no new storage
-- policy is needed. A separate bucket would have meant duplicating that policy.
--
-- Row-level policies are row-scoped, not column-scoped, so the existing
-- "owner can update their own profile" policy covers this column too.

alter table public.profiles
  add column if not exists banner_url text;

comment on column public.profiles.banner_url is
  'Public URL of the profile banner image. NULL means no banner uploaded — readers fall back to a purple-tint band. Stored in the existing `avatars` bucket under the owner''s own folder, so the bucket''s existing owner-only write policy covers it without a new storage policy.';
