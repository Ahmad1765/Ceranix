// supabase/functions/stripe-webhook/index.ts
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Required secrets:
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
// Inherits: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (already set by Supabase)
//
// Stripe dashboard → Developers → Webhooks → Add endpoint:
//   https://<project-ref>.supabase.co/functions/v1/stripe-webhook
//   Events: checkout.session.completed
//
// Auth model: verify_jwt is OFF because Stripe cannot send a Supabase JWT.
// Instead every request is authenticated by verifying Stripe's HMAC-SHA256
// signature (Stripe-Signature header) against STRIPE_WEBHOOK_SECRET. Requests
// with a missing/invalid/stale signature are rejected before any DB access.
//
// On checkout.session.completed:
//   1. Insert a row into public.orders (idempotent via unique stripe_session_id).
//   2. Mark the listing sold.
// Writes use the service role key — clients have no write path to orders.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SIGNATURE_TOLERANCE_SECONDS = 300; // 5 min, same default as Stripe SDKs

// Best-effort PostHog capture from the edge function. Never throws — analytics
// must not break the webhook. distinct_id is the buyer so the event ties to the
// same person as the client-side funnel.
async function capturePurchase(distinctId: string, props: Record<string, unknown>) {
  const key = Deno.env.get('POSTHOG_KEY');
  const host = Deno.env.get('POSTHOG_HOST') ?? 'https://eu.i.posthog.com';
  if (!key) return;
  try {
    await fetch(`${host}/i/v0/e/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event: 'purchase_completed',
        distinct_id: distinctId,
        properties: props,
      }),
    });
  } catch (e) {
    console.error('[stripe-webhook] posthog capture failed', e);
  }
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Constant-time comparison to avoid leaking signature bytes via timing.
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
): Promise<boolean> {
  if (!header) return false;

  const parts = new Map<string, string[]>();
  for (const kv of header.split(',')) {
    const [k, v] = kv.split('=', 2);
    if (!k || !v) continue;
    const list = parts.get(k.trim()) ?? [];
    list.push(v.trim());
    parts.set(k.trim(), list);
  }

  const timestamp = Number(parts.get('t')?.[0]);
  const signatures = parts.get('v1') ?? [];
  if (!Number.isFinite(timestamp) || signatures.length === 0) return false;

  const ageSeconds = Math.abs(Date.now() / 1000 - timestamp);
  if (ageSeconds > SIGNATURE_TOLERANCE_SECONDS) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(
    await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(`${timestamp}.${payload}`),
    ),
  );

  return signatures.some((sig) => {
    try {
      return timingSafeEqual(mac, hexToBytes(sig));
    } catch {
      return false;
    }
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!webhookSecret || !supabaseUrl || !serviceKey) {
    console.error('stripe-webhook misconfigured: missing secrets');
    return new Response('Server misconfigured', { status: 500 });
  }

  // Raw body is required for signature verification — do not parse first.
  const payload = await req.text();
  const valid = await verifyStripeSignature(
    payload,
    req.headers.get('Stripe-Signature'),
    webhookSecret,
  );
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return new Response('Invalid payload', { status: 400 });
  }

  if (event?.type !== 'checkout.session.completed') {
    // Acknowledge everything else so Stripe stops retrying.
    return new Response(JSON.stringify({ received: true }), { status: 200 });
  }

  const session = event.data?.object ?? {};
  const meta = session.metadata ?? {};
  const listingId = meta.listing_id;
  const buyerId = meta.buyer_id ?? session.client_reference_id;
  const sellerId = meta.seller_id;
  const offerMessageId = meta.offer_message_id || null;
  const amountCents = Number(session.amount_total);

  if (!listingId || !buyerId || !sellerId || !Number.isFinite(amountCents) || amountCents <= 0) {
    // Malformed metadata is OUR bug, not a transient failure — log loudly and
    // return 200 so Stripe doesn't retry a permanently broken event.
    console.error('checkout.session.completed missing metadata', { id: session.id, meta });
    return new Response(JSON.stringify({ received: true, skipped: 'missing metadata' }), { status: 200 });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 1) Record the order. Unique stripe_session_id makes webhook retries no-ops.
  const { error: orderErr } = await db.from('orders').insert({
    listing_id: listingId,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount_cents: amountCents,
    currency: session.currency ?? 'usd',
    stripe_session_id: session.id,
    stripe_payment_intent: session.payment_intent ?? null,
    offer_message_id: offerMessageId,
    status: 'paid',
  });
  if (orderErr && orderErr.code !== '23505' /* unique_violation = retry */) {
    console.error('order insert failed', orderErr);
    // 500 → Stripe retries with backoff; the unique constraint keeps it safe.
    return new Response('Order insert failed', { status: 500 });
  }

  await capturePurchase(buyerId, {
    order_id: session.id,
    listing_id: listingId,
    amount_cents: amountCents,
  });

  // 2) Mark the listing sold.
  const { error: soldErr } = await db
    .from('listings')
    .update({ is_sold: true })
    .eq('id', listingId);
  if (soldErr) {
    console.error('mark sold failed', soldErr);
    return new Response('Mark sold failed', { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
});
