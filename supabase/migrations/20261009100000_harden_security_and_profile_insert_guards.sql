-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Harden Profile Trust Field Guards (Insert & Update Defense)
-- Date: 2026-10-09
-- Purpose:
--   1. Expands guard_profile_trust_fields trigger from UPDATE-only to
--      BEFORE INSERT OR UPDATE, completely preventing client injection of
--      is_admin = true, is_verified = true, or is_pro = true on account creation.
--   2. Explicitly locks search_path = '' to prevent schema poisoning.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.guard_profile_trust_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Allow bypass for database administrators, service role, or direct SQL editor sessions
  if coalesce(auth.role(), '') in ('service_role', 'supabase_admin')
     or session_user in ('postgres', 'supabase_admin', 'dashboard_user') then
    return new;
  end if;

  -- 1. INSERT PROTECTION: Prevent setting privileged flags on account registration
  if tg_op = 'INSERT' then
    if coalesce(new.is_admin, false) is true then
      if coalesce(current_setting('app.auth_override_is_admin', true), '') <> 'authorized' then
        raise exception 'profile trust field (is_admin) cannot be set on insert';
      end if;
    end if;

    if coalesce(new.is_verified, false) is true then
      if coalesce(current_setting('app.auth_override_is_verified', true), '') <> 'authorized' then
        raise exception 'profile trust field (is_verified) cannot be set on insert';
      end if;
    end if;

    if coalesce(new.is_pro, false) is true then
      if coalesce(current_setting('app.auth_override_is_pro', true), '') <> 'authorized' then
        raise exception 'profile trust field (is_pro) cannot be set on insert';
      end if;
    end if;

    return new;
  end if;

  -- 2. UPDATE PROTECTION: Guard trust fields against unauthorized mutation
  if new.is_admin is distinct from old.is_admin then
    if coalesce(current_setting('app.auth_override_is_admin', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_admin) is read-only';
    end if;
  end if;

  if new.is_verified is distinct from old.is_verified then
    if coalesce(current_setting('app.auth_override_is_verified', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_verified) is read-only';
    end if;
  end if;

  if new.is_pro is distinct from old.is_pro then
    if coalesce(current_setting('app.auth_override_is_pro', true), '') <> 'authorized' then
      raise exception 'profile trust field (is_pro) is read-only';
    end if;
  end if;

  if new.rating is distinct from old.rating then
    if coalesce(current_setting('app.auth_override_rating', true), '') <> 'authorized' then
      raise exception 'profile trust field (rating) is read-only';
    end if;
  end if;

  if new.total_sales is distinct from old.total_sales then
    if coalesce(current_setting('app.auth_override_total_sales', true), '') <> 'authorized' then
      raise exception 'profile trust field (total_sales) is read-only';
    end if;
  end if;

  return new;
end;
$$;

-- Drop and recreate trigger to cover both INSERT and UPDATE
drop trigger if exists trg_guard_profile_trust on public.profiles;
create trigger trg_guard_profile_trust
  before insert or update on public.profiles
  for each row execute procedure public.guard_profile_trust_fields();

revoke execute on function public.guard_profile_trust_fields() from public, anon, authenticated;
grant execute on function public.guard_profile_trust_fields() to service_role, postgres;
