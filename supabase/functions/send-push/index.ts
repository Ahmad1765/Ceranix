// supabase/functions/send-push/index.ts
// Deploy: supabase functions deploy send-push --no-verify-jwt
// Inherits: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already set by Supabase)
//
// Wiring: push.notify_send_push() triggers on
//   messages AFTER INSERT
//   messages AFTER UPDATE OF offer_status
//   orders   AFTER INSERT
//   → POST https://<project-ref>.supabase.co/functions/v1/send-push
//     header x-webhook-secret: <shared secret>
//
// Auth model: verify_jwt is OFF because a database trigger cannot mint a
// Supabase user JWT. Instead every request must carry the shared secret, which
// is checked before any other database access — same shape as stripe-webhook's
// signature check.
//
// The shared secret exists in two places by necessity, and they MUST match or
// every push 401s:
//   • DB side  — Supabase Vault, secret name `push_webhook_secret`, read by
//                push.notify_send_push() at trigger time.
//   • Here     — the `PUSH_WEBHOOK_SECRET` function secret.
// Reading Vault from this side too would be tidier, but the `vault` schema is
// not exposed through PostgREST, and the only way to reach it would be a
// SECURITY DEFINER function in `public` that returns a secret — one loosened
// grant away from leaking it. Env var it is, same as stripe-webhook.
// PUSH_NOTIFICATIONS.md documents copying the value out of Vault.
//
// Why the trigger is a committed row change and not a client call: the client
// is never trusted to send a notification to another user. Only rows that
// actually landed in the database can produce a push.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';
import {
  buildPushNotifications,
  type ConversationLookup,
  type Lookups,
  type PushNotification,
  type WebhookPayload,
} from './mapper.ts';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
// Expo accepts up to 100 messages per request.
const EXPO_BATCH_SIZE = 100;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

// Constant-time comparison so a wrong secret cannot be discovered byte by byte
// from response timing.
function timingSafeEqual(a: string, b: string): boolean {
  const ab = new TextEncoder().encode(a);
  const bb = new TextEncoder().encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

type Admin = ReturnType<typeof createClient>;

/**
 * Fetch everything the mapper needs for this payload. Kept here (impure) so
 * mapper.ts stays unit-testable.
 */
async function loadLookups(admin: Admin, payload: WebhookPayload): Promise<Lookups> {
  const record = payload.record ?? {};

  if (payload.table === 'messages') {
    const conversationId = record.conversation_id as string | undefined;
    const senderId = record.sender_id as string | undefined;
    if (!conversationId) return {};

    const [{ data: conv }, { data: sender }] = await Promise.all([
      admin
        .from('conversations')
        .select('id, buyer_id, seller_id')
        .eq('id', conversationId)
        .maybeSingle(),
      senderId
        ? admin
            .from('profiles')
            .select('username, full_name')
            .eq('id', senderId)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const p = sender as { username?: string | null; full_name?: string | null } | null;
    return {
      conversation: (conv as ConversationLookup | null) ?? null,
      senderName: p?.username ?? p?.full_name ?? null,
    };
  }

  if (payload.table === 'orders') {
    const listingId = record.listing_id as string | undefined;
    if (!listingId) return {};
    const { data: listing } = await admin
      .from('listings')
      .select('title')
      .eq('id', listingId)
      .maybeSingle();
    return { listingTitle: (listing as { title?: string | null } | null)?.title ?? null };
  }

  return {};
}

/**
 * Claim the idempotency keys for this batch. Returns only the notifications
 * whose key was newly inserted — a webhook redelivery loses the race against
 * the unique constraint and is dropped here rather than pushed twice.
 */
async function claimUnsent(
  admin: Admin,
  notifications: PushNotification[],
): Promise<PushNotification[]> {
  if (notifications.length === 0) return [];
  const { data, error } = await admin
    .from('push_deliveries')
    .upsert(
      notifications.map((n) => ({
        idempotency_key: n.idempotencyKey,
        recipient_user_id: n.userId,
      })),
      { onConflict: 'idempotency_key', ignoreDuplicates: true },
    )
    .select('idempotency_key');

  if (error) {
    // Throw rather than return [] — sending nothing AND reporting success would
    // drop the notification permanently. Bubbling up gives a 500, which asks
    // Supabase to redeliver; the claim is idempotent so a retry is safe.
    throw new Error(`idempotency claim: ${error.message}`);
  }
  const claimed = new Set(
    (data ?? []).map((r) => (r as { idempotency_key: string }).idempotency_key),
  );
  return notifications.filter((n) => claimed.has(n.idempotencyKey));
}

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string>;
  sound: 'default';
  channelId: 'default';
};

/** POST one batch and return the tokens Expo reported as unregistered. */
async function sendBatch(batch: ExpoMessage[]): Promise<string[]> {
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
    },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    throw new Error(`Expo push API ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as {
    data?: { status: string; details?: { error?: string } }[];
  };
  const dead: string[] = [];
  (body.data ?? []).forEach((ticket, i) => {
    if (ticket.status !== 'error') return;
    const reason = ticket.details?.error;
    console.warn('[send-push] ticket error', reason ?? 'unknown');
    // The device uninstalled the app or the token rotated. Anything else
    // (rate limit, message too big) is not the token's fault — leave it.
    if (reason === 'DeviceNotRegistered') dead.push(batch[i].to);
  });
  return dead;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret) {
    console.error('[send-push] PUSH_WEBHOOK_SECRET is not set');
    return json({ error: 'not configured' }, 500);
  }
  const provided = req.headers.get('x-webhook-secret');
  if (!provided || !timingSafeEqual(provided, secret)) {
    return json({ error: 'unauthorized' }, 401);
  }

  let payload: WebhookPayload;
  try {
    payload = (await req.json()) as WebhookPayload;
  } catch {
    // Malformed body — a retry cannot help, so don't ask for one.
    return json({ error: 'invalid json' }, 200);
  }

  try {
    const lookups = await loadLookups(admin, payload);
    const notifications = buildPushNotifications(payload, lookups);
    if (notifications.length === 0) return json({ sent: 0, reason: 'not in scope' });

    const unsent = await claimUnsent(admin, notifications);
    if (unsent.length === 0) return json({ sent: 0, reason: 'already delivered' });

    // One token lookup covering every recipient in this payload (at most two).
    const recipientIds = [...new Set(unsent.map((n) => n.userId))];
    const { data: devices, error: devErr } = await admin
      .from('user_devices')
      .select('user_id, expo_push_token')
      .in('user_id', recipientIds);
    if (devErr) throw new Error(`token lookup: ${devErr.message}`);

    const tokensByUser = new Map<string, string[]>();
    for (const row of (devices ?? []) as { user_id: string; expo_push_token: string }[]) {
      const list = tokensByUser.get(row.user_id) ?? [];
      list.push(row.expo_push_token);
      tokensByUser.set(row.user_id, list);
    }

    const messages: ExpoMessage[] = unsent.flatMap((n) =>
      (tokensByUser.get(n.userId) ?? []).map((to) => ({
        to,
        title: n.title,
        body: n.body,
        data: n.data,
        sound: 'default' as const,
        channelId: 'default' as const,
      })),
    );
    if (messages.length === 0) {
      // Recipient has no registered device — nothing to do, and a retry would
      // not change that.
      return json({ sent: 0, reason: 'no devices' });
    }

    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH_SIZE) {
      dead.push(...(await sendBatch(messages.slice(i, i + EXPO_BATCH_SIZE))));
    }

    if (dead.length > 0) {
      const { error } = await admin
        .from('user_devices')
        .delete()
        .in('expo_push_token', dead);
      if (error) console.error('[send-push] prune failed', error.message);
    }

    return json({ sent: messages.length, pruned: dead.length });
  } catch (e) {
    // 500 asks Supabase to retry, which is right for a transient Expo/network
    // failure. The idempotency claim above means a retry that arrives after a
    // partial success will not re-push the same notification.
    console.error('[send-push] failed', e);
    return json({ error: 'send failed' }, 500);
  }
});
