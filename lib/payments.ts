import { Linking, Platform } from "react-native";
import { supabase } from "@/lib/supabase";

// Server returns the hosted Stripe Checkout URL for a given listing.
type SessionResponse = { url: string; sessionId: string };

// A row of public.orders — the ONLY record of a real payment. Written solely by
// the stripe-webhook edge function under the service role after a signature-
// verified checkout.session.completed.
//
// Payment state must never be read off listings.is_sold: that flag is a seller-
// controlled listing-lifecycle toggle (app/product/[id].tsx "Mark as sold"),
// so trusting it lets a seller forge a Paid invoice, or flip a genuinely paid
// one back to Pending and send the buyer to pay a second time.
export type Order = {
  id: string;
  status: "pending" | "paid" | "refunded" | "canceled" | "refund_due";
  amount_cents: number;
  fee_cents: number;
  currency: string;
  created_at: string;
};

/**
 * The caller's order for a listing, newest first, or null if they never paid.
 *
 * RLS scopes public.orders to buyer_id/seller_id, so this returns rows only for
 * the two parties to the sale — a third party viewing the same listing sees
 * null and gets the Pending state, which is the truth for them.
 */
export async function fetchOrderForListing(
  listingId: string,
): Promise<Order | null> {
  const { data, error } = await supabase
    .from("orders")
    .select("id, status, amount_cents, fee_cents, currency, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Order) ?? null;
}

// Stripe is "enabled" only when a publishable key has been set. Until then
// the Pay button runs in demo mode — no API call, just a simulated success
// redirect so the UI flow is still walkable.
const PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
export const STRIPE_ENABLED =
  PK.startsWith("pk_test_") || PK.startsWith("pk_live_");

export async function createCheckoutSession(
  listingId: string,
  opts: { offerAmount?: number } = {},
): Promise<SessionResponse> {
  const returnUrl = buildReturnUrl(listingId);
  // offer_amount is forwarded to the edge function so an accepted offer can
  // override the listing price. The server is responsible for verifying the
  // amount matches a real accepted offer for (buyer, listing) — never trust
  // the client value alone.
  const body: Record<string, unknown> = {
    listing_id: listingId,
    return_url: returnUrl,
  };
  // offerAmount is expected to be in dollars. If cents are passed, format to 2 decimals.
  if (typeof opts.offerAmount === 'number' && Number.isFinite(opts.offerAmount) && opts.offerAmount > 0) {
    body.offer_amount = Number(opts.offerAmount.toFixed(2));
  }
  const { data, error } = await supabase.functions.invoke<SessionResponse>(
    "create-checkout-session",
    { body },
  );
  if (error) throw new Error(error.message);
  if (!data?.url) throw new Error("No checkout URL returned");
  return data;
}

export async function openCheckout(url: string): Promise<void> {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined") window.location.href = url;
    return;
  }
  await Linking.openURL(url);
}

// Stripe redirects buyers here after a successful (or canceled) checkout.
// On web we use the current origin so the redirect stays in the same tab.
// On native we use the Expo dev/app scheme.
function buildReturnUrl(listingId: string) {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    return `${window.location.origin}/invoice/${listingId}?paid=1`;
  }
  // Expo deep-link scheme. Update `scheme` in app.json if you change apps.
  return `carrinex://invoice/${listingId}?paid=1`;
}
