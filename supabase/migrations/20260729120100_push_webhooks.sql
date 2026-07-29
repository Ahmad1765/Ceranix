-- Database triggers that drive push notifications.
--
-- Each trigger POSTs the changed row to the `send-push` edge function, which
-- decides who (if anyone) should be notified. The client is never the trigger:
-- only a COMMITTED row change can produce a push, which is what stops one user
-- from making the app notify another.
--
-- ── Why this is hand-rolled instead of a Dashboard webhook ──
-- Supabase's Database Webhooks UI generates triggers that call
-- `supabase_functions.http_request(...)`, with the destination URL and the auth
-- header baked into the trigger definition as literals. Two problems:
--   1. `supabase_functions` only exists once the Webhooks feature has been
--      enabled on the project. It is not installed here, so a migration calling
--      it fails outright.
--   2. The shared secret would live in plaintext in `pg_trigger` and in this
--      committed file.
-- So the trigger function below calls `net.http_post` (pg_net) directly and
-- reads both the URL and the secret from Supabase Vault at call time. Nothing
-- sensitive is committed, and rotating the secret is an UPDATE, not a migration.

-- `with schema extensions` is not cosmetic: without it the extension registers
-- against `public` and trips advisor lint 0014_extension_in_public. pg_net is
-- not relocatable, so getting that wrong can only be undone by drop + recreate.
--
-- It does not change how pg_net is CALLED. The install script creates its own
-- `net` schema for the functions regardless of this clause, so the trigger
-- function below always says `net.http_post` — never `extensions.http_post`.
create extension if not exists pg_net with schema extensions;

-- Private schema: never exposed through the Data API, so the trigger function
-- is not reachable as an RPC no matter what the public-schema grants say.
create schema if not exists push;
revoke all on schema push from anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Trigger function
-- ─────────────────────────────────────────────────────────────────────────
-- Builds the same payload shape a native Supabase webhook sends, so the edge
-- function's mapper is identical either way:
--   { type, table, schema, record, old_record }
--
-- SECURITY DEFINER because it reads vault.decrypted_secrets, which the calling
-- user has no access to. It takes no arguments from the caller and returns the
-- row untouched, so there is no injection surface.
create or replace function push.notify_send_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'push_webhook_secret';

  -- Fail OPEN, never closed. If the secrets are missing the feature is simply
  -- not configured yet — raising here would abort the INSERT and take down
  -- messaging and checkout with it. A missing push is an annoyance; a message
  -- that cannot be sent is an outage.
  if v_url is null or v_secret is null then
    raise warning '[push] vault secrets not configured — skipping notification';
    return null;
  end if;

  -- pg_net queues the request and only dispatches it AFTER the transaction
  -- commits, so a slow or down edge function can never delay (or roll back) the
  -- write that triggered it.
  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object(
                 'type',       tg_op,
                 'table',      tg_table_name,
                 'schema',     tg_table_schema,
                 'record',     to_jsonb(new),
                 'old_record', case when tg_op = 'UPDATE' then to_jsonb(old) else null end
               ),
    headers := jsonb_build_object(
                 'Content-Type',     'application/json',
                 'x-webhook-secret', v_secret
               ),
    timeout_milliseconds := 5000
  );
  return null; -- AFTER trigger: return value is ignored
end;
$$;

revoke all on function push.notify_send_push() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────────────────────────────────────

-- New message / new offer.
drop trigger if exists push_on_message_insert on public.messages;
create trigger push_on_message_insert
  after insert on public.messages
  for each row execute function push.notify_send_push();

-- Offer accepted / declined. Scoped to the column so unrelated edits don't wake
-- the function. It still fires on a write that sets offer_status to its current
-- value, so the edge function's mapper compares old_record.offer_status with
-- record.offer_status and stays silent unless the value actually transitioned.
drop trigger if exists push_on_offer_status_update on public.messages;
create trigger push_on_offer_status_update
  after update of offer_status on public.messages
  for each row execute function push.notify_send_push();

-- Sale confirmed → seller and buyer.
drop trigger if exists push_on_order_insert on public.orders;
create trigger push_on_order_insert
  after insert on public.orders
  for each row execute function push.notify_send_push();

-- ─────────────────────────────────────────────────────────────────────────
-- Configuration (run once, NOT part of this migration's committed values)
-- ─────────────────────────────────────────────────────────────────────────
-- The two secrets this function reads are created out-of-band so they never
-- appear in version control. See PUSH_NOTIFICATIONS.md:
--
--   select vault.create_secret(
--     'https://<project-ref>.supabase.co/functions/v1/send-push',
--     'push_function_url', 'send-push edge function endpoint');
--   select vault.create_secret(
--     '<same value as the PUSH_WEBHOOK_SECRET edge function secret>',
--     'push_webhook_secret', 'Shared secret authenticating send-push calls');
--
-- To rotate: update vault.secrets, then re-run `supabase secrets set`.
