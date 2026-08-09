-- Server-side rate limiting (abuse prevention).
--
-- Counts a user's recent actions in a sliding window and ABORTS the write when
-- over the limit. Enforced via BEFORE INSERT triggers so it cannot be bypassed
-- from the client (unlike any JS-side throttle). Keyed on auth.uid(), so it
-- holds whether the write comes from a direct PostgREST insert or one of the
-- app's SECURITY DEFINER RPCs (e.g. toggle_follow still inserts into
-- user_follows, which the trigger guards).
--
-- Limits follow ROADMAP Phase 9; tune the numbers in section 3 freely.

-- ─────────────────────────────────────────────────────────────────────────
-- 1. Event ledger
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.rate_limit_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);

create index if not exists rate_limit_events_lookup_idx
  on public.rate_limit_events (user_id, action, created_at desc);

-- Internal table: RLS ON with ZERO policies → no direct client (anon /
-- authenticated) access at all. The SECURITY DEFINER functions below reach it
-- as the table owner, which bypasses RLS.
alter table public.rate_limit_events enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. Core enforcement
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.enforce_rate_limit(
  p_action text,
  p_limit  int,
  p_window interval
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  -- Anonymous writes are already blocked by each table's RLS; nothing to limit.
  if v_uid is null then
    return;
  end if;

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = v_uid
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'rate_limit_exceeded'
      using
        errcode = 'P0001',
        message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
        hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (v_uid, p_action);
end;
$$;

-- Not meant to be called directly over the API — only by the triggers below.
revoke execute on function public.enforce_rate_limit(text, int, interval)
  from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 3. Per-table trigger wrappers + triggers
--    (DEFINER so the ledger insert bypasses RLS; triggers fire regardless of
--     EXECUTE grants, so revoking direct access below is safe.)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.tg_rl_listings() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit('listing_insert', 10, interval '1 hour'); return new; end;
$$;

create or replace function public.tg_rl_messages() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit('message_send', 60, interval '1 minute'); return new; end;
$$;

create or replace function public.tg_rl_follows() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit('follow', 60, interval '1 minute'); return new; end;
$$;

create or replace function public.tg_rl_likes() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit('like', 120, interval '1 minute'); return new; end;
$$;

create or replace function public.tg_rl_saves() returns trigger
language plpgsql security definer set search_path = public as $$
begin perform public.enforce_rate_limit('save', 120, interval '1 minute'); return new; end;
$$;

revoke execute on function
  public.tg_rl_listings(), public.tg_rl_messages(), public.tg_rl_follows(),
  public.tg_rl_likes(), public.tg_rl_saves()
  from public, anon, authenticated;

drop trigger if exists rate_limit_listings on public.listings;
create trigger rate_limit_listings before insert on public.listings
  for each row execute function public.tg_rl_listings();

drop trigger if exists rate_limit_messages on public.messages;
create trigger rate_limit_messages before insert on public.messages
  for each row execute function public.tg_rl_messages();

drop trigger if exists rate_limit_follows on public.user_follows;
create trigger rate_limit_follows before insert on public.user_follows
  for each row execute function public.tg_rl_follows();

drop trigger if exists rate_limit_likes on public.listing_likes;
create trigger rate_limit_likes before insert on public.listing_likes
  for each row execute function public.tg_rl_likes();

drop trigger if exists rate_limit_saves on public.save_list_items;
create trigger rate_limit_saves before insert on public.save_list_items
  for each row execute function public.tg_rl_saves();

-- ─────────────────────────────────────────────────────────────────────────
-- 4. Housekeeping: purge old events so the ledger stays small.
--    Longest window above is 1 hour, so retaining 2 hours is plenty.
--    Requires pg_cron (Supabase: Database → Extensions, or the line below).
-- ─────────────────────────────────────────────────────────────────────────
create extension if not exists pg_cron;

do $$
begin
  perform cron.unschedule('purge-rate-limit-events');
exception when others then
  null; -- not scheduled yet; ignore
end $$;

select cron.schedule(
  'purge-rate-limit-events',
  '*/30 * * * *',
  $$ delete from public.rate_limit_events where created_at < now() - interval '2 hours' $$
);
