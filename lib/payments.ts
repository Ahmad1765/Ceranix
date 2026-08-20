import { Linking, Platform } from "react-native";
import { supabase } from "@/lib/supabase";
// Type-only in the other direction (lib/orders.ts imports `type MyOrder` from
// here), so this pair does not form a runtime cycle.
import { normalizeMyOrder } from "@/lib/orders";

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
  status: "pending" | "paid" | "refunded" | "canceled" | "refund_due" | "failed";
  amount_cents: number;
  fee_cents: number;
  currency: string;
  payment_method?: "card" | "cod";
  shipping_address?: Record<string, any> | null;
  delivery_notes?: string | null;
  created_at: string;
  listing_id?: string;
  buyer_id?: string;
  seller_id?: string;
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
    .select("id, status, amount_cents, fee_cents, currency, payment_method, shipping_address, delivery_notes, created_at")
    .eq("listing_id", listingId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Order) ?? null;
}

// An order joined to the item it paid for, as the order history needs it.
// `buyer_id` / `seller_id` come along so the caller can tell which side of the
// sale the viewer was on — the same row is a purchase for one party and a sale
// for the other.
export type MyOrder = Order & {
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  listing: {
    id: string;
    title: string | null;
    images: string[] | null;
    price: number | string | null;
  } | null;
};

// The embed as PostgREST may actually hand it back — see the normalization in
// fetchMyOrders below.
type MyOrderRow = Omit<MyOrder, "listing"> & {
  listing: MyOrder["listing"] | MyOrder["listing"][];
};

/**
 * Every order the caller is a party to, newest first.
 *
 * RLS ("Buyers and sellers can view own orders") is what actually restricts the
 * rows; the explicit .or() is here so the query uses orders_buyer_idx /
 * orders_seller_idx rather than filtering after a scan.
 *
 * Throws rather than returning [] so React Query can retry and the screen can
 * tell "no purchases yet" apart from "we failed to load your purchases" — the
 * two must not render the same way on a screen about money.
 */
export async function fetchMyOrders(userId: string): Promise<MyOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, status, amount_cents, fee_cents, currency, payment_method, shipping_address, delivery_notes, created_at, listing_id, buyer_id, seller_id, listing:listings(id, title, images, price)",
    )
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  // normalizeMyOrder lives in lib/orders.ts so it is reachable by a test — see
  // the note there for why the embed shape can't just be asserted.
  return ((data ?? []) as unknown as MyOrderRow[]).map(normalizeMyOrder) as MyOrder[];
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
