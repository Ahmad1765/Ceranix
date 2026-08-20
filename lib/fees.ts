// Buyer Protection — the single source of truth for what a buyer pays on top
// of the item price. Every surface that shows or charges a total (product page,
// payment sheet, invoice, and the create-checkout-session edge function) must
// derive its numbers from here so the buyer is never shown one price and
// charged another.
//
// Formula: a flat fee, the same on every order regardless of item price
// (Rs 5,000 item → Rs 100 fee → Rs 5,100 total; Rs 50,000 item → Rs 100 fee
// → Rs 50,100 total). Deliberately NOT a percentage: the buyer can read the
// fee off the product page once and it holds for every basket, and expensive
// items aren't penalised for being expensive.
//
// This replaced a $0.70 + 5% model that survived the switch to PKR — under
// PKR those constants meant a Rs 0.70 base (rounding noise) with the 5% doing
// all the work, so a Rs 50,000 coat carried a Rs 2,500 fee.
//
// IMPORTANT: the edge function re-implements this same math in Deno
// (supabase/functions/create-checkout-session). Keep the two in sync.

/** The flat Buyer Protection fee, in PKR. */
export const BUYER_PROTECTION_FEE = 100;

/** Default shipping fee in PKR (free / zero-fee basis). */
export const DEFAULT_SHIPPING_FEE = 0;

export function shippingFee(itemPrice?: number | string | null | undefined): number {
  return DEFAULT_SHIPPING_FEE;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Coerce anything into a clean, non-negative price. */
function safePrice(itemPrice: number | string | null | undefined): number {
  const n = typeof itemPrice === 'string' ? parseFloat(itemPrice) : Number(itemPrice);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The Buyer Protection fee added to a given item price, in PKR.
 *
 * Flat, so the argument only decides whether there's an order at all — a
 * missing or non-positive price means there's nothing to protect, and
 * charging a fee on it would show "Rs 100" against a blank item row.
 */
export function buyerProtectionFee(itemPrice: number | string | null | undefined): number {
  const price = safePrice(itemPrice);
  if (price <= 0) return 0;
  return BUYER_PROTECTION_FEE;
}

/** What the buyer actually pays: item price + Buyer Protection. */
export function orderTotal(itemPrice: number | string | null | undefined): number {
  const price = safePrice(itemPrice);
  if (price <= 0) return 0;
  return round2(price + buyerProtectionFee(price));
}

/** Full breakdown for a price row / sheet, all in the store currency. */
export function priceBreakdown(itemPrice: number | string | null | undefined) {
  const item = round2(safePrice(itemPrice));
  const protection = buyerProtectionFee(item);
  return { item, protection, total: round2(item + protection) };
}

// Money formatting lives in lib/currency.ts (PKR). Re-exported here so the
// checkout surfaces that already import from lib/fees keep one import.
export { formatPrice } from './currency';
