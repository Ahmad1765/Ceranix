-- ─────────────────────────────────────────────────────────────────────────────
-- Restore admin RPCs + close the waitlist email leak.
--
-- 20261009020000_foolproof_security_privilege_and_admin_rpcs.sql was never
-- applied to the live project, and is NOT safe to apply as written:
--   • its admin_get_verifications / admin_review_kyc read columns that do not
--     exist live (full_name, id_number, document_*_url, rejection_reason) and
--     write profiles.updated_at, which does not exist either;
--   • it revokes listing_price_history from `authenticated`, which My Feed
--     reads (lib/myFeed.ts).
-- This migration is the live-schema-correct, additive subset. Every statement
-- is idempotent (create or replace / drop … if exists).
--
-- Deploy order: ship waitlist-landing (uses waitlist_referral_count) first,
-- then apply this. Applying it first only makes the landing page's referral
-- counter fall back to its local count until the page is redeployed.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. is_admin() — called by admin_get_support_* (live) and the RPCs below.
create or replace function public.is_admin()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return false;
  end if;

  return exists (
    select 1 from public.profiles where id = v_uid and is_admin = true
  ) or coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false);
end;
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- 2. Let reviewer RPCs change verification status. Previously only
--    service_role could, so an admin approve/reject always raised. Same
--    transaction-local override pattern as guard_profile_trust_fields;
--    set_config is not reachable through PostgREST.
create or replace function public.guard_verification_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') = 'service_role'
     or coalesce(current_setting('app.auth_override_verification_status', true), '') = 'authorized' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status is distinct from 'submitted' then
      raise exception 'new verifications must start as submitted';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      raise exception 'verification status may only be changed by reviewers';
    end if;
  end if;
  return new;
end;
$$;

-- 3. Admin RPCs used by app/admin/index.tsx. Shapes match types/index.ts.
-- Drop first: on a fresh replay 20261009020000 created this with a different
-- return shape, which `create or replace` cannot change. No-op on live.
drop function if exists public.admin_get_verifications(text);
create or replace function public.admin_get_verifications(p_status text default 'all')
returns table (
  user_id uuid,
  status text,
  legal_name text,
  document_kind text,
  document_number_last4 text,
  notes text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  username text,
  avatar_url text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select v.user_id, v.status, v.legal_name, v.document_kind, v.document_number_last4,
         v.notes, v.submitted_at, v.reviewed_at, p.username, p.avatar_url
    from public.verifications v
    left join public.profiles p on p.id = v.user_id
   where p_status = 'all' or v.status = p_status
   order by v.submitted_at desc;
end;
$$;

revoke all on function public.admin_get_verifications(text) from public, anon;
grant execute on function public.admin_get_verifications(text) to authenticated, service_role;

create or replace function public.admin_review_kyc(
  p_user_id uuid,
  p_decision text,
  p_rejection_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Invalid decision: must be approved or rejected' using errcode = '22000';
  end if;

  perform set_config('app.auth_override_verification_status', 'authorized', true);
  update public.verifications
     set status = p_decision,
         notes = coalesce(p_rejection_reason, notes),
         reviewed_at = now()
   where user_id = p_user_id;
  if not found then
    raise exception 'No verification submitted for this user' using errcode = 'P0002';
  end if;
  perform set_config('app.auth_override_verification_status', 'off', true);

  perform set_config('app.auth_override_is_verified', 'authorized', true);
  update public.profiles set is_verified = (p_decision = 'approved') where id = p_user_id;
  perform set_config('app.auth_override_is_verified', 'off', true);
end;
$$;

revoke all on function public.admin_review_kyc(uuid, text, text) from public, anon;
grant execute on function public.admin_review_kyc(uuid, text, text) to authenticated, service_role;

create or replace function public.admin_toggle_pro_seller(p_user_id uuid, p_is_pro boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  perform set_config('app.auth_override_is_pro', 'authorized', true);
  update public.profiles set is_pro = p_is_pro where id = p_user_id;
  perform set_config('app.auth_override_is_pro', 'off', true);
end;
$$;

revoke all on function public.admin_toggle_pro_seller(uuid, boolean) from public, anon;
grant execute on function public.admin_toggle_pro_seller(uuid, boolean) to authenticated, service_role;

create or replace function public.admin_get_users(p_search text default null, p_limit int default 100)
returns table (
  id uuid,
  username text,
  full_name text,
  avatar_url text,
  rating numeric,
  total_sales integer,
  is_verified boolean,
  is_pro boolean,
  is_admin boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Forbidden: caller is not an administrator' using errcode = '42501';
  end if;

  return query
  select p.id, p.username, p.full_name, p.avatar_url, p.rating, p.total_sales,
         p.is_verified, p.is_pro, p.is_admin, p.created_at
    from public.profiles p
   where p_search is null
      or length(trim(p_search)) = 0
      or p.username ilike '%' || p_search || '%'
      or p.full_name ilike '%' || p_search || '%'
      or p.id::text ilike '%' || p_search || '%'
   order by p.created_at desc
   limit least(coalesce(p_limit, 100), 200);
end;
$$;

revoke all on function public.admin_get_users(text, int) from public, anon;
grant execute on function public.admin_get_users(text, int) to authenticated, service_role;

-- 4. Waitlist: anon could SELECT every row (names, emails, phones).
--    Sign-up uses `Prefer: return=minimal`, so INSERT keeps working without
--    SELECT. The landing page's only read was a referral count — served by
--    this aggregate instead, which exposes no row data.
create or replace function public.waitlist_referral_count(p_code text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.waitlist
   where length(p_code) between 1 and 64
     and referred_by in (ltrim(p_code, '#'), '#' || ltrim(p_code, '#'));
$$;

revoke all on function public.waitlist_referral_count(text) from public;
grant execute on function public.waitlist_referral_count(text) to anon, authenticated, service_role;

drop policy if exists "Allow anonymous select on waitlist" on public.waitlist;
drop policy if exists "Admins can view waitlist" on public.waitlist;
create policy "Admins can view waitlist"
  on public.waitlist
  for select
  to authenticated
  using (public.is_admin());
