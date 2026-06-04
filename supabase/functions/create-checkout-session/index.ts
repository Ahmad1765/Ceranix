// supabase/functions/create-checkout-session/index.ts
// Deploy: supabase functions deploy create-checkout-session
// Required secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
// Inherits: SUPABASE_URL, SUPABASE_ANON_KEY (already set by Supabase)
//
// Client invokes via:
//   supabase.functions.invoke('create-checkout-session', {
//     body: { listing_id, return_url },
//   })
//
// Returns:
//   { url: string, sessionId: string }
//
// Stripe is in test mode by default — pass sk_test_... so PaymentIntents
// are created in the test account. Use real keys in production env later.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const envOrigins = Deno.env.get('ALLOWED_ORIGINS');
if (!envOrigins) {
  throw new Error('Missing ALLOWED_ORIGINS environment variable. Set it via supabase secrets set ALLOWED_ORIGINS=...');
}
const ALLOWED_ORIGINS = envOrigins.split(',').map((o) => o.trim()).filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

function json(body: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get('origin');
  
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405, origin);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const stripeSecret = Deno.env.get('STRIPE_SECRET_KEY');
    if (!supabaseUrl || !anonKey) return json({ error: 'Server misconfigured' }, 500, origin);
    if (!stripeSecret) return json({ error: 'STRIPE_SECRET_KEY not set' }, 500, origin);

    const auth = req.headers.get('Authorization');
    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listing_id ?? '').trim();
    const returnUrl = String(body?.return_url ?? '').trim();
    if (!listingId) return json({ error: 'listing_id required' }, 400, origin);
    if (!returnUrl) return json({ error: 'return_url required' }, 400, origin);

    // Fetch the listing — anon key is fine since listings are public-readable.
    const sb = createClient(supabaseUrl, anonKey, {
      global: auth ? { headers: { Authorization: auth } } : undefined,
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: listing, error: lErr } = await sb
      .from('listings')
      .select('id, title, price, images')
      .eq('id', listingId)
      .maybeSingle();
    if (lErr) return json({ error: lErr.message }, 500, origin);
    if (!listing) return json({ error: 'Listing not found' }, 404, origin);

    const priceCents = Math.round(Number(listing.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 50) {
      return json({ error: 'Invalid listing price' }, 400, origin);
    }

    let successUrlObj: URL;
    let cancelUrlObj: URL;
    try {
      successUrlObj = new URL(returnUrl);
      if (!successUrlObj.protocol.startsWith('http')) throw new Error('Invalid protocol');
      cancelUrlObj = new URL(returnUrl);
    } catch {
      return json({ error: 'Invalid return_url' }, 400, origin);
    }

    successUrlObj.searchParams.set('paid', '1');
    cancelUrlObj.searchParams.set('paid', '0');

    // Build Stripe Checkout Session via the REST API (no SDK needed in Deno).
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('success_url', successUrlObj.toString());
    params.append('cancel_url', cancelUrlObj.toString());
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'usd');
    params.append('line_items[0][price_data][unit_amount]', String(priceCents));
    params.append('line_items[0][price_data][product_data][name]', listing.title ?? 'Item');
    if (Array.isArray(listing.images) && listing.images[0]) {
      params.append('line_items[0][price_data][product_data][images][0]', listing.images[0]);
    }
    params.append('metadata[listing_id]', listing.id);
    params.append('payment_method_types[0]', 'card');

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecret}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
    const stripeBody = await res.json();
    if (!res.ok) {
      return json({ error: stripeBody?.error?.message ?? 'Stripe error' }, 500, origin);
    }

    return json({ url: stripeBody.url, sessionId: stripeBody.id }, 200, origin);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    return json({ error: msg }, 500, origin);
  }
});
