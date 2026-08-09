# Push notifications — setup & runbook

Remote push for messages, offers, and sales. Native only (iOS/Android); web push
is deliberately out of scope for this slice and no-ops cleanly.

**Nothing here is active until the steps below are run.** Every client entry
point degrades to a warning, so the app works normally with none of it done.

---

## Why you cannot test this in Expo Go

Remote push notifications do not work in Expo Go on Android from **SDK 53**
onward, and `getExpoPushTokenAsync` fails there by design. You need a
**development build**. Local notifications still work in Expo Go, but this
feature does not use them.

```bash
eas build --profile development --platform android
```

Install that on a **physical device** — an emulator has no FCM/APNs registration
and `Device.isDevice` is false, so registration is skipped.

---

## Architecture

```
client (native, permission granted)
  └─ registerForPush() ──▶ register_device() RPC ──▶ user_devices
                                                     (owner-only RLS)

messages / orders row change
  └─ trigger → push.notify_send_push()   (private schema, SECURITY DEFINER)
       ├─ reads URL + secret from Supabase Vault
       └─ net.http_post (pg_net, fires AFTER COMMIT)
            └─ send-push edge function  (verify_jwt off)
                 ├─ verify secret (constant-time)
                 ├─ map row → recipient(s) + copy      ← pure, unit-tested
                 ├─ claim idempotency key in push_deliveries
                 ├─ read recipient tokens (SERVICE ROLE, bypasses RLS)
                 ├─ POST Expo Push API
                 └─ prune DeviceNotRegistered tokens

notification tap
  └─ response listener → routeForNotificationData() → expo-router
       message → /conversation/[id]   order → /product/[id]
```

### Why a hand-rolled trigger instead of a Dashboard webhook

Supabase's Database Webhooks UI generates triggers that call
`supabase_functions.http_request(...)` with the URL and auth header baked into
the trigger definition as literals. Two problems: that schema only exists once
the Webhooks feature has been enabled (it was not, on this project), and the
shared secret would sit in plaintext in `pg_trigger` and in a committed
migration. `push.notify_send_push()` calls `net.http_post` directly and reads
both values from Vault at call time instead.

Two properties worth knowing:

- **pg_net dispatches after COMMIT.** A slow or down edge function can never
  delay or roll back the message insert that triggered it.
- **The trigger fails open.** If the Vault secrets are missing it logs a warning
  and returns. A missing push is an annoyance; a message that cannot be sent is
  an outage.

The client is never trusted to notify another user. Only a committed row change
produces a push — the same posture as `stripe-webhook`.

### Security notes

- `user_devices` has **no public read and no client insert/update**. A push token
  is a "send anything to this device" capability; the previous design kept it on
  the world-readable `profiles` table, which let any authenticated client harvest
  every token. Only the service-role edge function reads across users.
- `register_device()` is `SECURITY DEFINER` but pins the row to `auth.uid()`
  internally, so a caller can only ever register a token to themselves. It is
  definer-only so it can atomically **reassign** a token when a phone changes
  hands — an owner-scoped upsert cannot touch the previous owner's row.
- `push_deliveries` has RLS on with **zero policies** — service role only.

---

## Setup

### 1. EAS project id

`getExpoPushTokenAsync` needs it to address the device.

```bash
eas init          # if the project is not linked yet
npx expo config --type public | grep -A2 'eas:'
```

It must resolve to a real uuid. It is a literal default in `app.config.js`, with
`EAS_PROJECT_ID` as an override.

### 2. Database — ✅ already applied to `ttxestvncdynsssmjqhk`

Both migrations are live on the remote project:

- `20260729120000_create_user_devices.sql` — `user_devices` + RLS + grants,
  `register_device()`, `push_deliveries`.
- `20260729120100_push_webhooks.sql` — `pg_net`, the `push` schema,
  `push.notify_send_push()`, and the three triggers.

Plus `pg_net_out_of_public_schema` and `push_deliveries_recipient_index`, both
applied to clear advisor lints. On a **fresh** project just run `supabase db push`.

Vault secrets `push_function_url` and `push_webhook_secret` were seeded with a
generated 32-byte value. Read the secret back with:

```sql
select decrypted_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
```

### 3. Edge function — ✅ deployed, ⚠️ needs its secret

`send-push` is deployed with `verify_jwt: false`. **This is the one remaining
step** — the function currently answers `500 {"error":"not configured"}` because
its environment secret is unset:

```bash
supabase secrets set PUSH_WEBHOOK_SECRET="<value from the SQL above>"
```

It must be byte-identical to the Vault value or every call 401s. There is no
Management API for function secrets, so this cannot be scripted from the DB side.

Verify afterwards (should flip from `not configured` to `not in scope`):

```sql
select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='push_function_url'),
  body := jsonb_build_object('type','INSERT','table','messages','schema','public',
    'record', jsonb_build_object('id',gen_random_uuid(),'conversation_id',gen_random_uuid(),
      'sender_id',gen_random_uuid(),'kind','text','content','smoke test'),
    'old_record', null),
  headers := jsonb_build_object('Content-Type','application/json',
    'x-webhook-secret',(select decrypted_secret from vault.decrypted_secrets where name='push_webhook_secret'))
);
-- then, a second or two later:
select status_code, content from net._http_response order by id desc limit 1;
```

---

## Manual verification

Requires a dev build on a physical device and steps 1–4 done.

1. Sign in. Open any conversation → the permission prompt appears **once**
   (contextual soft-ask). Grant it.
2. Settings → *Enhance the experience* → **Push notifications** shows ON.
3. From account B, message account A. With A **backgrounded**, A gets a banner.
   Tap it → opens that conversation.
4. Send an offer from B → A's banner reads `B sent an offer: Rs 4,500`.
5. Accept the offer as A → **B** gets `Your offer was accepted`.
6. Complete a checkout → seller gets `You sold <title>`, buyer gets
   `Payment confirmed — <title>`.
7. **Force-kill** the app. Push from B. Tap the tray notification → the app cold
   starts and lands on the right screen.
8. Toggle Settings → Push notifications OFF → the `user_devices` row for that
   device is gone and pushes stop.
9. Sign out → the row is removed too (this runs *before* `signOut()`, while
   `auth.uid()` still satisfies the delete policy).

## Automated coverage

```bash
npm test
```

- `supabase/functions/send-push/mapper.test.ts` — recipient + copy for every
  event, sender-suppression, no-op offer updates, malformed rows.
- `lib/notificationRouting.test.ts` — deep-link mapping incl. malformed payloads.

The mapper is Deno-free on purpose so vitest can load it directly;
`vitest.config.ts` includes `supabase/functions/**/*.test.ts`.

---

## Troubleshooting

| Symptom | Cause |
|---|---|
| `[push] no EAS projectId` warning | Step 1 not done. |
| Registration silently skipped | Emulator (`Device.isDevice` false), or Expo Go on Android. |
| `send-push` returns 500 `not configured` | `PUSH_WEBHOOK_SECRET` not set on the function (setup step 3). |
| `send-push` returns 401 | Vault `push_webhook_secret` ≠ the function's `PUSH_WEBHOOK_SECRET`. |
| No push, no HTTP request at all | Vault secrets missing → the trigger fails open. Check `select * from net._http_response order by id desc` and the Postgres log for `[push] vault secrets not configured`. |
| Nothing in `net._http_response` | pg_net dispatches only after COMMIT; also confirm the three `push_*` triggers exist on `messages` / `orders`. |
| `{"sent":0,"reason":"no devices"}` | Recipient has never granted permission on any device. |
| `{"sent":0,"reason":"already delivered"}` | Idempotency working — a redelivered webhook. |
| Notification arrives but tapping does nothing | `data` payload lacks `conversationId`/`listingId`; `routeForNotificationData` returns null by design. |

## Not in scope

Web push (VAPID + service worker), price-drop / saved-search alerts (needs
scheduled sends), an in-app notification centre, and rich notifications
(images, action buttons).
