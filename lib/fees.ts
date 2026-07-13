// Buyer Protection — the single source of truth for what a buyer pays on top
// of the item price. Every surface that shows or charges a total (product page,
// payment sheet, invoice, and the create-checkout-session edge function) must
// derive its numbers from here so the buyer is never shown one price and
// charged another.
//
// Formula: a small fixed fee plus a percentage of the item price. This mirrors
// the marketplace-standard buyer-protection model (e.g. $1.00 item → $0.70 +
// 5% = $0.75 fee → $1.75 total).
//
// IMPORTANT: the edge function re-implements this same math in Deno
// (supabase/functions/create-checkout-session). Keep the two in sync.

export const BUYER_PROTECTION_FIXED = 0.7;
export const BUYER_PROTECTION_RATE = 0.05;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Coerce anything into a clean, non-negative price. */
function safePrice(itemPrice: number | string | null | undefined): number {
  const n = typeof itemPrice === 'string' ? parseFloat(itemPrice) : Number(itemPrice);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The Buyer Protection fee added to a given item price, in dollars. */
export function buyerProtectionFee(itemPrice: number | string | null | undefined): number {
  const price = safePrice(itemPrice);
  if (price <= 0) return 0;
  return round2(BUYER_PROTECTION_FIXED + BUYER_PROTECTION_RATE * price);
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
