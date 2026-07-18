# Push Notifications — Design

**Date:** 2026-07-17
**Status:** Approved (design), pending spec review
**Scope:** Messaging + sales push notifications, native only (iOS/Android). Web deferred.

## Goal

Deliver remote push notifications for the marketplace's core retention + transactional moments, restoring the notification loop that was removed when the insecure `expo_push_token` column was dropped (migration `20260611222823`). Tokens must be stored securely per that migration's prescription: *"a private table (e.g. `user_devices`) with owner-only RLS."*

## Non-goals (deferred)

- **Web push** (VAPID + service worker) — native-only for this cut; web no-ops.
- **Price-drop / saved-search alerts** — needs batch/scheduled sends; separate slice.
- In-app notification center / history UI.
- Rich notifications (images, action buttons).

## Events in scope

| Trigger (DB change) | Recipient | Copy |
| --- | --- | --- |
| `messages` INSERT, `kind='text'` | other conversation participant | `<sender>`: `<content, truncated>` |
| `messages` INSERT, `kind='offer'` | other conversation participant | `<sender> sent an offer: <formatted amount>` |
| `messages` UPDATE, `offer_status` → `accepted`/`declined` (mapper compares `old_record.offer_status` ≠ `record.offer_status`) | the offer's `sender_id` | `Your offer was <accepted/declined>` |
| `orders` INSERT | `seller_id` | `You sold <listing title>` |
| `orders` INSERT | `buyer_id` | `Payment confirmed — <listing title>` |

For message events, the sender never receives a push for their own message (sender ≠ recipient enforced in the mapper). For `orders` INSERT, both the seller **and** the buyer receive a notification — the buyer's confirmation ("Payment confirmed") is intentionally delivered even though the buyer initiated the purchase.

## Architecture

```
client (native, permission granted)
  └─ registerForPush() ──▶ user_devices  (owner-only RLS; token globally unique)

messages / orders row change
  └─ Supabase Database Webhook (x-webhook-secret header)
       └─ send-push edge function  (--no-verify-jwt)
            ├─ verify secret
            ├─ map row → recipient(s) + copy   (pure, unit-tested)
            ├─ read recipient tokens via SERVICE ROLE (bypasses RLS)
            ├─ POST Expo Push API (https://exp.host/--/api/v2/push/send)
            └─ prune DeviceNotRegistered tokens from user_devices

notification tap
  └─ response listener → expo-router deep link
       message → /conversation/[id] ; order → /product/[id]
```

The client is never trusted to notify other users — a committed row change is the trigger, mirroring the existing service-role `stripe-webhook` pattern.

## Data model — `user_devices`

New migration `supabase/migrations/<ts>_create_user_devices.sql`:

```sql
create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  expo_push_token text not null unique,      -- device maps to exactly one current user
  platform text,                             -- 'ios' | 'android'
  device_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.user_devices enable row level security;

-- Read/delete are owner-only. There is deliberately NO client insert/update
-- policy: all writes go through register_device() below.
create policy "user_devices owner select" on public.user_devices for select using (auth.uid() = user_id);
create policy "user_devices owner delete" on public.user_devices for delete using (auth.uid() = user_id);

create index user_devices_user_id_idx on public.user_devices (user_id);

-- Registration RPC. SECURITY DEFINER so it can atomically REASSIGN a token from
-- a previous owner (shared device / account switch) — a plain owner-only upsert
-- can't touch another user's row. Scoped to auth.uid() internally, so a caller
-- can only ever register the token to THEMSELVES.
create or replace function public.register_device(
  p_token text,
  p_platform text default null,
  p_device_name text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.user_devices (user_id, expo_push_token, platform, device_name)
  values (auth.uid(), p_token, p_platform, p_device_name)
  on conflict (expo_push_token) do update
    set user_id     = auth.uid(),
        platform    = excluded.platform,
        device_name = excluded.device_name,
        updated_at  = now();
end;
$$;

revoke all on function public.register_device(text, text, text) from public;
grant execute on function public.register_device(text, text, text) to authenticated;
```

- `expo_push_token` is **globally unique**: `register_device()` upserts on `expo_push_token`, atomically reassigning the token to `auth.uid()` if it was previously owned by another user. Prevents a shared device from pushing to a previous account, and concurrent registrations resolve without race conditions.
- **No public read, no client insert/update** — closes the harvest hole. Clients register via the definer RPC, read/delete only their own rows; only the service-role edge function reads tokens across users.
- Unregister: the client deletes its own row directly (owner `DELETE` policy allows it).

## Client

### `lib/notifications.ts` (side-effectful wiring)
- `registerForPush(userId)` — returns early on `Platform.OS !== 'ios' && !== 'android'` or when permission not granted. Requires `extra.eas.projectId` for `getExpoPushTokenAsync` → **gracefully no-ops (warn) until `eas init` sets `EAS_PROJECT_ID`**. Calls `supabase.rpc('register_device', { p_token, p_platform, p_device_name })` (the definer RPC handles reassignment atomically).
- `ensurePermissionAndRegister(userId)` — requests permission; on grant, registers. Used by the soft-ask and the settings toggle.
- `unregisterThisDevice()` — deletes this install's token row (called on sign-out and when the settings toggle is turned off).
- `configureNotifications()` — sets the foreground handler (show banner + sound) and the Android default channel. Called once at startup (native only).
- `attachResponseListener(router)` — registers the live notification-response listener for taps while the app is running. Additionally, on first call, reads `Notifications.getLastNotificationResponseAsync()` to handle the notification that launched a terminated app; the initial response is routed once via `routeForNotificationData`, then cleared to prevent re-processing on subsequent mounts.

### `lib/notificationRouting.ts` (pure, unit-tested)
- `routeForNotificationData(data): { pathname; params } | null` — maps `{type:'message', conversationId}` → `/conversation/[id]`, `{type:'order', listingId}` → `/product/[id]`. Unknown/malformed → null (no-op).

### Permission UX
- **Silent register on sign-in:** in `lib/auth.tsx` `onAuthStateChange` SIGNED_IN handler (deferred, native only) — if permission already granted, `registerForPush(uid)`.
- **Sign-out:** `unregisterThisDevice()` is awaited **before** calling `signOut()`, so `auth.uid()` is still available for the owner-only DELETE RLS policy. Device removal is performed in the sign-out handler (e.g. settings screen or sign-out button), **not** in the post-sign-out `SIGNED_OUT` callback. If `unregisterThisDevice()` fails, the error is caught and logged but sign-out proceeds (the orphaned token will be pruned on the next `DeviceNotRegistered` from Expo).
- **Soft-ask on first conversation open:** `app/conversation/[id].tsx` — on first mount, if permission status is `undetermined` and an AsyncStorage flag `push_prompted` is unset, call `ensurePermissionAndRegister` and set the flag. Asks at most once contextually.
- **Settings toggle:** a "Push notifications" row in `app/settings.tsx` (reuses the existing `Switch` pattern). Reflects current permission/registration; ON → `ensurePermissionAndRegister` (if the OS permission is blocked, deep-link to system settings via `Linking.openSettings()`); OFF → `unregisterThisDevice()`.
- **Never** prompt on cold launch.

### Startup
`configureNotifications()` + `attachResponseListener` mounted in `app/_layout.tsx` (native only), alongside the existing `initSentry` / `initAnalytics` / `initOnlineManager` calls.

## Backend — `send-push` edge function

`supabase/functions/send-push/index.ts` (Deno), deployed `--no-verify-jwt`.

- **Auth:** requires header `x-webhook-secret` === `Deno.env.get('PUSH_WEBHOOK_SECRET')`. Missing/wrong → 401 before any DB access.
- **Input:** Supabase Database Webhook JSON — `{ type: 'INSERT'|'UPDATE', table, record, old_record }`.
- **Mapping (pure `buildPushNotifications(payload, lookups)` in `supabase/functions/send-push/mapper.ts`):** returns `Array<{ userId, title, body, data }>`. For `messages` it needs the conversation's participants (service-role lookup by `conversation_id`) to find the recipient; for `orders` the seller/buyer ids are on the record. The mapper takes already-fetched conversation/listing data as `lookups`, so it is pure and unit-testable without a DB. It imports nothing Deno-specific, so vitest can load it directly.
- **Send:** resolve each recipient's tokens from `user_devices` (service role), POST batched messages to Expo Push API. Parse the ticket response; on `DeviceNotRegistered`, delete that token from `user_devices`.
- **Resilience:** any failure logs and returns 200 where a retry wouldn't help (bad payload) and 500 only for transient send failures. Never throws unhandled.
- **Secrets:** `PUSH_WEBHOOK_SECRET` (set via `supabase secrets set`); inherits `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## DB webhooks

Migration `<ts>_push_webhooks.sql` creates triggers via `supabase_functions.http_request` on:
- `messages` AFTER INSERT
- `messages` AFTER UPDATE OF `offer_status` — the webhook fires on any write to the column; the **mapper** guards against no-op updates by comparing `old_record.offer_status` with `record.offer_status` and sending only when the value actually transitions to `accepted` or `declined`.
- `orders` AFTER INSERT

Each posts to `https://<project-ref>.supabase.co/functions/v1/send-push` with header `x-webhook-secret: <secret>`. The project ref + secret are **environment-specific placeholders** in the committed SQL, with equivalent Dashboard (Database → Webhooks) setup steps documented in the runbook. This mirrors how `stripe-webhook` documents its dashboard wiring.

## Web / platform behavior

- All `lib/notifications.ts` entry points early-return on web. No web push, no errors.
- Settings toggle hidden (or shown disabled with "Not available on web") on `Platform.OS === 'web'`.

## Verification

**Automated (in this environment):**
- `tsc --noEmit` clean.
- Unit tests: `lib/notificationRouting.test.ts` (deep-link routing incl. malformed payloads) and `supabase/functions/send-push/mapper.test.ts` (recipient/copy mapping for every event row; sender==recipient suppression). `vitest.config.ts` `include` is extended to `supabase/functions/**/*.test.ts` so the Deno-free mapper is covered by the same runner.
- `expo export -p web` regression (no-op path bundles cleanly).

**Manual — requires a dev build + configured Supabase project (documented, NOT testable here):**
1. `eas init` → `EAS_PROJECT_ID` set.
2. Dev build installed on a physical device.
3. `send-push` deployed; `PUSH_WEBHOOK_SECRET` set; webhooks configured.
4. Send a message from account B → account A (backgrounded) receives a push; tap → opens the conversation.
5. Complete a checkout → seller + buyer receive pushes.
6. Force-kill the app entirely (terminated state). Send a push from account B. Tap the notification in the OS tray → the app cold-starts and navigates to the correct conversation/product screen.

A `PUSH_NOTIFICATIONS.md` runbook captures the setup + manual checklist.

## Risks / notes

- **Untestable end-to-end here** — delivery depends on a native build and the user's Supabase project. Slice lands as fully-built, unit-tested, documented code that activates on first build. `registerForPush` no-ops safely until then.
- **expo-notifications** is a new native dependency → must re-run the web-export regression.
- **Payload size / batching** — Expo Push API accepts up to 100 messages per request; recipients here are 1–2 per event, well within limits.
- **Duplicate sends** — DB webhooks fire once per committed row change, but transient edge-function failures or Supabase retry policies can re-deliver the same payload. The `send-push` function must enforce **idempotent delivery**: persist an idempotency key derived from `(source_table, record.id, event_type, recipient_user_id)` — either in a lightweight `push_deliveries` table or via an insert-if-not-exists check — and skip sending when the key already exists. The notification is marked sent only after a successful Expo Push API response. (Stripe-originated `orders` INSERT events are additionally deduplicated upstream by the orders unique constraint.)

## Dependencies

- `expo-notifications` (client), `expo-device` (device name / physical-device check).
- Existing: `expo-constants` (projectId), `@react-native-async-storage/async-storage` (prompt flag), Supabase service role (edge fn).
