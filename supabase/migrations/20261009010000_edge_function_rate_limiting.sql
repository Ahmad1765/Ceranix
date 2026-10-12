-- ─────────────────────────────────────────────────────────────────────────────
-- MIGRATION: Edge Function & API Rate Limiting Helper
-- Enables server-side Edge Functions (running with service_role) to enforce
-- per-user sliding-window rate limits backed by public.rate_limit_events.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.enforce_user_rate_limit(
  p_user_id uuid,
  p_action text,
  p_limit int,
  p_window interval
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  if p_user_id is null then
    return true;
  end if;

  -- Serialize rate-limit check per user and action to prevent concurrency bypass
  perform pg_advisory_xact_lock(hashtext(p_user_id::text), hashtext(p_action));

  select count(*) into v_count
  from public.rate_limit_events
  where user_id = p_user_id
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'rate_limit_exceeded'
      using
        errcode = 'P0001',
        message = format('Rate limit reached for %s (max %s per %s).', p_action, p_limit, p_window),
        hint    = 'Please slow down and try again shortly.';
  end if;

  insert into public.rate_limit_events (user_id, action) values (p_user_id, p_action);
  return true;
end;
$$;

revoke all on function public.enforce_user_rate_limit(uuid, text, int, interval) from public, anon, authenticated;
grant execute on function public.enforce_user_rate_limit(uuid, text, int, interval) to service_role;
