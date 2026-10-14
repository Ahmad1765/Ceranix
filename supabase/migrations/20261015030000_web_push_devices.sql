-- Web push: browsers can now receive the same notifications as the native app.
--
-- A browser subscription is stored in user_devices next to Expo tokens:
--   expo_push_token  ← the subscription endpoint (already UNIQUE, so a browser
--                      re-subscribing or changing user is an upsert, exactly
--                      like a phone changing hands)
--   platform         ← 'web'
--   web_push_keys    ← {p256dh, auth}, the keys send-push encrypts payloads with
--
-- Endpoints are restricted to the browsers' real push services. send-push POSTs
-- to whatever endpoint is stored, so an unrestricted URL would let any user
-- point the edge function at an arbitrary host. The same allowlist is enforced
-- again in send-push (supabase/functions/send-push/webPush.ts).

alter table public.user_devices add column if not exists web_push_keys jsonb;

alter table public.user_devices drop constraint if exists user_devices_web_push_keys_check;
alter table public.user_devices add constraint user_devices_web_push_keys_check
  check ((platform = 'web') = (web_push_keys is not null));

create or replace function public.is_allowed_web_push_endpoint(p_endpoint text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_endpoint is not null
     and length(p_endpoint) <= 1000
     and p_endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.notify\.windows\.com)/';
$$;

create or replace function public.register_web_push(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device_name text default null
)
returns void
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
  if not public.is_allowed_web_push_endpoint(p_endpoint) then
    raise exception 'unsupported push endpoint' using errcode = '22023';
  end if;
  if coalesce(length(p_p256dh), 0) not between 40 and 200
     or coalesce(length(p_auth), 0) not between 10 and 100 then
    raise exception 'invalid subscription keys' using errcode = '22023';
  end if;

  insert into public.user_devices (user_id, expo_push_token, platform, device_name, web_push_keys)
  values (v_uid, p_endpoint, 'web', left(p_device_name, 100),
          jsonb_build_object('p256dh', p_p256dh, 'auth', p_auth))
  on conflict (expo_push_token) do update
    set user_id       = v_uid,
        platform      = 'web',
        device_name   = excluded.device_name,
        web_push_keys = excluded.web_push_keys,
        updated_at    = now();
end;
$$;

revoke all on function public.is_allowed_web_push_endpoint(text) from public, anon;
grant execute on function public.is_allowed_web_push_endpoint(text) to authenticated, service_role;
revoke all on function public.register_web_push(text, text, text, text) from public, anon;
grant execute on function public.register_web_push(text, text, text, text) to authenticated, service_role;
