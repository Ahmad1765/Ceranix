import { Linking, Platform } from 'react-native';
import { supabase } from '@/lib/supabase';

// Server returns the hosted Stripe Checkout URL for a given listing.
type SessionResponse = { url: string; sessionId: string };

// Stripe is "enabled" only when a publishable key has been set. Until then
// the Pay button runs in demo mode — no API call, just a simulated success
// redirect so the UI flow is still walkable.
const PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const STRIPE_ENABLED = PK.startsWith('pk_test_') || PK.startsWith('pk_live_');

export async function createCheckoutSession(
  listingId: string,
  opts: { offerAmount?: number } = {},
): Promise<SessionResponse> {
  const returnUrl = buildReturnUrl(listingId);
  // offer_amount is forwarded to the edge function so an accepted offer can
  // override the listing price. The server is responsible for verifying the
  // amount matches a real accepted offer for (buyer, listing) — never trust
  // the client value alone.
  const body: Record<string, unknown> = { listing_id: listingId, return_url: returnUrl };
  if (opts.offerAmount && opts.offerAmount > 0) {
    body.offer_amount = Math.round(opts.offerAmount);
  }
  const { data, error } = await supabase.functions.invoke<SessionResponse>(
    'create-checkout-session',
    { body },
  );
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error('No checkout URL returned');
  return data;
}

export async function openCheckout(url: string): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') window.location.href = url;
    return;
  }
  await Linking.openURL(url);
}

// Stripe redirects buyers here after a successful (or canceled) checkout.
// On web we use the current origin so the redirect stays in the same tab.
// On native we use the Expo dev/app scheme.
function buildReturnUrl(listingId: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return `${window.location.origin}/invoice/${listingId}?paid=1`;
  }
  // Expo deep-link scheme. Update `scheme` in app.json if you change apps.
  return `ceranix://invoice/${listingId}?paid=1`;
}
