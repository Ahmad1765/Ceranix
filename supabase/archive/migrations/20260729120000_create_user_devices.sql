-- Push notification device registry.
--
-- Restores the notification loop that was removed when the insecure
-- `profiles.expo_push_token` column was dropped (migration 20260611222823).
-- That migration's prescription was "a private table (e.g. user_devices) with
-- owner-only RLS" — this is it.
--
-- Threat model: a push token is a send-anything-to-this-device capability. The
-- old column lived on `profiles`, which is world-readable, so any authenticated
-- client could harvest every token in the database. Here there is no public
-- read at all: a user can see and delete only their own rows, and only the
-- service-role edge function (`send-push`) reads across users.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Device registry
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.user_devices (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  -- Globally unique: a physical device maps to exactly one CURRENT user. When
  -- a second account signs in on the same phone, register_device() reassigns
  -- the row rather than creating a duplicate, so the previous account stops
  -- receiving that device's pushes.
  expo_push_token  text not null unique,
  platform         text,
  device_name      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.user_devices enable row level security;

-- Indexes on every column an RLS policy filters by. Without these Postgres
-- re-evaluates the predicate per row; Supabase's own benchmarks put the
-- difference at ~99.9% on a table of any size. `expo_push_token` is already
-- indexed by its UNIQUE constraint (the client deletes by token).
create index if not exists user_devices_user_id_idx
  on public.user_devices (user_id);

-- Read + delete are owner-only. There is deliberately NO client insert or
-- update policy: every write goes through register_device() below, which pins
-- the row to auth.uid() and cannot be aimed at another user.
--
-- Two details that are easy to get wrong, both per Supabase's RLS performance
-- guide:
--   • `(select auth.uid())` — wrapping it lets Postgres evaluate the function
--     once per statement instead of once per row.
--   • `to authenticated` — without it the policy is also evaluated for `anon`
--     on every request. It is not a security fix here (auth.uid() is null for
--     anon, so the predicate never matches) but it skips the work entirely.
drop policy if exists "user_devices owner select" on public.user_devices;
create policy "user_devices owner select"
  on public.user_devices for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "user_devices owner delete" on public.user_devices;
create policy "user_devices owner delete"
  on public.user_devices for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- Table privileges are a SEPARATE gate from RLS: RLS decides which rows are
-- visible, grants decide whether the table is reachable through the Data API at
-- all. This project has ALTER DEFAULT PRIVILEGES granting ALL on new public
-- tables to anon + authenticated, so without this block `user_devices` would be
-- handed INSERT/UPDATE/TRUNCATE it must never have. Narrow it to exactly the
-- two verbs the client needs, and take anon off the table completely.
revoke all on public.user_devices from anon, authenticated;
grant select, delete on public.user_devices to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Registration RPC
-- ─────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so it can atomically REASSIGN a token away from a previous
-- owner (shared device / account switch) — an owner-scoped upsert cannot touch
-- another user's row, and a delete-then-insert would race. Scoped to auth.uid()
-- internally, so a caller can only ever register a token to THEMSELVES.
--
-- `set search_path = ''` with fully-qualified names everywhere: a SECURITY
-- DEFINER function that resolves names through a caller-controlled search_path
-- is the classic privilege-escalation route, and it is what advisor lint
-- 0011_function_search_path_mutable checks for.
create or replace function public.register_device(
  p_token       text,
  p_platform    text default null,
  p_device_name text default null
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'token required' using errcode = '22023';
  end if;

  insert into public.user_devices (user_id, expo_push_token, platform, device_name)
  values (v_uid, trim(p_token), p_platform, p_device_name)
  on conflict (expo_push_token) do update
    set user_id     = v_uid,
        platform    = excluded.platform,
        device_name = excluded.device_name,
        updated_at  = now();
end;
$$;

-- Postgres grants EXECUTE to PUBLIC on every new function, which would make
-- this definer function callable by `anon` too. Revoke first, then grant only
-- to signed-in users.
revoke all on function public.register_device(text, text, text) from public, anon;
grant execute on function public.register_device(text, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Delivery ledger (idempotency)
-- ─────────────────────────────────────────────────────────────────────────
-- Webhooks fire once per committed row change, but a transient edge-function
-- failure causes a redelivery — which would push the same message twice.
-- `send-push` claims each (source, record, event, recipient) tuple here BEFORE
-- calling the Expo API; the unique constraint is the deduplication point.
create table if not exists public.push_deliveries (
  id                bigint generated always as identity primary key,
  idempotency_key   text not null unique,
  recipient_user_id uuid references auth.users (id) on delete cascade,
  created_at        timestamptz not null default now()
);

-- Internal table: RLS ON with ZERO policies → no anon/authenticated row access,
-- and the grants below remove it from the Data API surface entirely. Only the
-- service role (which bypasses both) touches it.
alter table public.push_deliveries enable row level security;
revoke all on public.push_deliveries from anon, authenticated;

create index if not exists push_deliveries_created_at_idx
  on public.push_deliveries (created_at desc);

-- recipient_user_id references auth.users ON DELETE CASCADE. Without a covering
-- index every account deletion sequentially scans this ledger, which only grows
-- (advisor lint 0001_unindexed_foreign_keys).
create index if not exists push_deliveries_recipient_user_id_idx
  on public.push_deliveries (recipient_user_id);

comment on table public.push_deliveries is
  'Idempotency ledger for send-push. Service-role only. Rows older than ~30 days '
  'can be pruned; webhook redelivery windows are minutes, not weeks.';

comment on table public.user_devices is
  'Expo push tokens, one row per device. Owner-only select/delete; all writes go '
  'through public.register_device(). Read across users only by the service role.';
