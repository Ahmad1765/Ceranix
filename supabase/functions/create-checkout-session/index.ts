// supabase/functions/create-checkout-session/index.ts
// Deploy: supabase functions deploy create-checkout-session
// Required secrets:
//   supabase secrets set STRIPE_SECRET_KEY=sk_test_...
//   supabase secrets set ALLOWED_ORIGINS=https://yourapp.com,http://localhost:8081
// Inherits: SUPABASE_URL, SUPABASE_ANON_KEY (already set by Supabase)
//
// Client invokes via:
//   supabase.functions.invoke('create-checkout-session', {
//     body: { listing_id, return_url, offer_amount? },
//   })
//
// Returns:
//   { url: string, sessionId: string }
//
// Security model:
//   - Caller must be an authenticated user (JWT forwarded by supabase-js).
//   - Buying your own listing or a sold listing is rejected.
//   - offer_amount is only a HINT: when present, the server looks up the
//     latest ACCEPTED offer for (listing, caller-as-buyer) via RLS-scoped
//     queries and charges that amount. The client value is cross-checked but
//     never trusted as the price.
//   - The session carries listing/buyer metadata; the stripe-webhook function
//     records the order and marks the listing sold after payment completes.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

// CORS allowlist for WEB callers. Native apps send no Origin header and are
// unaffected. If unset, browser calls get no CORS headers (and fail preflight)
// but the function still boots — a missing secret shouldn't crash-loop it.
const envOrigins = Deno.env.get('ALLOWED_ORIGINS') ?? '';
if (!envOrigins) {
  console.warn('ALLOWED_ORIGINS not set — web (browser) checkout will fail CORS until you run: supabase secrets set ALLOWED_ORIGINS=...');
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
    if (!auth) return json({ error: 'Authentication required' }, 401, origin);

    const body = await req.json().catch(() => ({}));
    const listingId = String(body?.listing_id ?? '').trim();
    const returnUrl = String(body?.return_url ?? '').trim();
    const offerAmountHint = Number(body?.offer_amount);
    const wantsOfferPrice =
      Number.isFinite(offerAmountHint) && offerAmountHint > 0;
    if (!listingId) return json({ error: 'listing_id required' }, 400, origin);
    if (!returnUrl) return json({ error: 'return_url required' }, 400, origin);

    // User-scoped client: every query below runs under the caller's RLS.
    const sb = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: uErr } = await sb.auth.getUser();
    if (uErr || !userData?.user) {
      return json({ error: 'Authentication required' }, 401, origin);
    }
    const buyerId = userData.user.id;

    const { data: listing, error: lErr } = await sb
      .from('listings')
      .select('id, title, price, images, seller_id, is_sold')
      .eq('id', listingId)
      .maybeSingle();
    if (lErr) return json({ error: lErr.message }, 500, origin);
    if (!listing) return json({ error: 'Listing not found' }, 404, origin);
    if (listing.is_sold) return json({ error: 'Listing already sold' }, 409, origin);
    if (listing.seller_id === buyerId) {
      return json({ error: 'You cannot buy your own listing' }, 400, origin);
    }

    // Resolve the charge amount server-side. Default: listing price.
    // With offer_amount: require a matching ACCEPTED offer in a conversation
    // where the caller is the buyer. RLS already restricts the query to
    // conversations the caller participates in.
    let chargeDollars = Number(listing.price);
    let offerMessageId: string | null = null;
    if (wantsOfferPrice) {
      const { data: offers, error: oErr } = await sb
        .from('messages')
        .select('id, metadata, conversations!inner(listing_id, buyer_id)')
        .eq('kind', 'offer')
        .eq('offer_status', 'accepted')
        .eq('conversations.listing_id', listingId)
        .eq('conversations.buyer_id', buyerId)
        .order('updated_at', { ascending: false })
        .limit(1);
      if (oErr) return json({ error: oErr.message }, 500, origin);
      const offer = offers?.[0];
      const offerDollars = Number(offer?.metadata?.amount);
      if (!offer || !Number.isFinite(offerDollars) || offerDollars <= 0) {
        return json({ error: 'No accepted offer found for this listing' }, 403, origin);
      }
      // The client hint must match the real accepted offer; otherwise the UI
      // is showing the buyer one price and charging another.
      if (Math.abs(offerDollars - offerAmountHint) > 0.005) {
        return json({ error: 'Offer amount mismatch' }, 409, origin);
      }
      chargeDollars = offerDollars;
      offerMessageId = offer.id;
    }

    const priceCents = Math.round(chargeDollars * 100);
    if (!Number.isFinite(priceCents) || priceCents < 50) {
      return json({ error: 'Invalid listing price' }, 400, origin);
    }

    // Buyer Protection fee, added as its own line item so the buyer is charged
    // the same total shown in the app. Keep this math in sync with lib/fees.ts.
    const BUYER_PROTECTION_FIXED = 0.7;
    const BUYER_PROTECTION_RATE = 0.05;
    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    const buyerProtectionDollars = round2(
      BUYER_PROTECTION_FIXED + BUYER_PROTECTION_RATE * chargeDollars,
    );
    const feeCents = Math.round(buyerProtectionDollars * 100);

    let successUrlObj: URL;
    let cancelUrlObj: URL;
    try {
      successUrlObj = new URL(returnUrl);
      // Validate protocol: http/https for web, carrinex:// for app deep links
      const isWeb = successUrlObj.protocol === 'http:' || successUrlObj.protocol === 'https:';
      const isApp = successUrlObj.protocol === 'carrinex:';
      if (!isWeb && !isApp) {
        throw new Error('Invalid protocol');
      }
      // For web URLs, ensure the hostname matches allowed origins (if configured)
      if (isWeb && ALLOWED_ORIGINS.length > 0) {
        const urlOrigin = `${successUrlObj.protocol}//${successUrlObj.hostname}`;
        if (!ALLOWED_ORIGINS.some(o => o.includes(successUrlObj.hostname ?? ''))) {
          throw new Error('Redirect origin not allowed');
        }
      }
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
    params.append('client_reference_id', buyerId);
    params.append('line_items[0][quantity]', '1');
    params.append('line_items[0][price_data][currency]', 'pkr');
    params.append('line_items[0][price_data][unit_amount]', String(priceCents));
    params.append('line_items[0][price_data][product_data][name]', listing.title ?? 'Item');
    // Validate image URL: must be HTTPS and from a trusted source (Supabase storage)
    if (Array.isArray(listing.images) && listing.images[0]) {
      const imageUrl = String(listing.images[0]).trim();
      try {
        const imgObj = new URL(imageUrl);
        const isTrustedSource = imgObj.hostname?.includes('supabaseusercontent.com') ||
                               imgObj.hostname?.includes('your-cdn.com');
        if (imgObj.protocol === 'https:' && isTrustedSource) {
          params.append('line_items[0][price_data][product_data][images][0]', imageUrl);
        }
      } catch {
        // Silently skip invalid image URL — don't break the checkout
      }
    }
    // Buyer Protection as a separate, clearly-labelled line item so it shows on
    // the Stripe checkout page and the receipt. amount_total (item + fee) is
    // what stripe-webhook records as the order amount.
    if (feeCents > 0) {
      params.append('line_items[1][quantity]', '1');
      params.append('line_items[1][price_data][currency]', 'pkr');
      params.append('line_items[1][price_data][unit_amount]', String(feeCents));
      params.append('line_items[1][price_data][product_data][name]', 'Buyer Protection');
    }

    // stripe-webhook reads these to record the order after payment.
    params.append('metadata[listing_id]', listing.id);
    params.append('metadata[buyer_id]', buyerId);
    params.append('metadata[seller_id]', listing.seller_id);
    if (offerMessageId) params.append('metadata[offer_message_id]', offerMessageId);
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
      // Don't leak Stripe error details to client — log server-side, return generic message
      console.error('[create-checkout] stripe error', stripeBody?.error);
      return json({ error: 'Payment setup failed. Please try again.' }, 500, origin);
    }

    if (!stripeBody?.url || !stripeBody?.id) {
      console.error('[create-checkout] missing session data', stripeBody);
      return json({ error: 'Payment setup failed. Please try again.' }, 500, origin);
    }

    return json({ url: stripeBody.url, sessionId: stripeBody.id }, 200, origin);
  } catch (e) {
    // Don't leak error details — log server-side for debugging
    console.error('[create-checkout] exception', e instanceof Error ? e.message : String(e));
    return json({ error: 'Payment setup failed. Please try again.' }, 500, origin);
  }
});
