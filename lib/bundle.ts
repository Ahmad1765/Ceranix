// Bundle pricing — the money math behind "buy multiple items from one seller
// and save". Pure + framework-agnostic so it can be unit-tested independently
// of the BundleSection UI (which calls computeBundlePricing directly, so the
// tests exercise the same code path the user is charged by).

// Marketplace-wide bundle tiers. The buyer's item count maps to the highest
// tier whose `count` threshold is reached; `pct` is the discount applied.
export const BUNDLE_TIERS = [
  { count: 1, pct: 0, label: '1 item' },
  { count: 2, pct: 5, label: '2 items' },
  { count: 3, pct: 10, label: '3 items' },
  { count: 4, pct: 15, label: '4 items' },
  { count: 5, pct: 20, label: '5+ items' },
] as const;

export type BundleTier = (typeof BUNDLE_TIERS)[number];

/** A discount only applies from this many items up. */
export const BUNDLE_MIN_ITEMS = 2;

export interface BundlePricing {
  /** Base listing + selected add-ons. */
  itemCount: number;
  /** Pre-discount sum. */
  subtotal: number;
  /** Highest tier the buyer currently qualifies for. */
  tier: BundleTier;
  /** Discount percent from the active tier. */
  pct: number;
  /** True once the discount actually applies (>= BUNDLE_MIN_ITEMS and pct > 0). */
  qualifies: boolean;
  /** Money saved, rounded to cents. 0 when not qualifying. */
  savings: number;
  /** Amount due — never negative. */
  total: number;
  /** 0..1 across the tier ladder, for the progress bar. */
  progress: number;
  /** The next rung above the current count, or undefined at the top tier. */
  nextTier: BundleTier | undefined;
}

/**
 * Compute bundle pricing for a base item plus a set of add-on prices.
 * `basePrice` is the listing being viewed; `addOnPrices` are the prices of the
 * other selected items from the same seller.
 */
// Coerce any price to a safe, finite number. Guards the money math against a
// null/undefined/NaN/Infinity price (e.g. a malformed row) ever producing a
// $NaN total the buyer would see.
function money(v: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function computeBundlePricing(
  basePrice: number,
  addOnPrices: number[],
  sellerDiscountPct?: number | null,
): BundlePricing {
  const itemCount = 1 + addOnPrices.length;
  const subtotal =
    money(basePrice) + addOnPrices.reduce((acc, p) => acc + money(p), 0);

  // Walk tiers high→low so the first match is the largest qualifying discount.
  const tier = [...BUNDLE_TIERS].reverse().find((t) => itemCount >= t.count) ?? BUNDLE_TIERS[0];

  const customPct =
    sellerDiscountPct != null && Number.isFinite(sellerDiscountPct) && sellerDiscountPct > 0
      ? Math.min(30, Math.max(0, sellerDiscountPct))
      : 0;

  const pct = customPct > 0 ? Math.max(tier.pct, customPct) : tier.pct;
  const qualifies = itemCount >= BUNDLE_MIN_ITEMS && pct > 0;
  // Round to cents so the buyer is never charged a fraction of a cent.
  const savings = qualifies ? Math.round(((subtotal * pct) / 100) * 100) / 100 : 0;
  const total = Math.max(0, subtotal - savings);
  const progress = Math.max(0, Math.min(1, (itemCount - 1) / (BUNDLE_TIERS.length - 1)));
  const nextTier = BUNDLE_TIERS.find((t) => t.count > itemCount);

  return { itemCount, subtotal, tier, pct, qualifies, savings, total, progress, nextTier };
}

/**
 * Calculates 10% and 20% bundle or single-item offer presets against baseReferencePrice.
 */
export function calculateOfferPresets(baseReferencePrice: number): {
  preset10: number;
  preset20: number;
} {
  if (!Number.isFinite(baseReferencePrice) || baseReferencePrice <= 0) {
    return { preset10: 0, preset20: 0 };
  }
  return {
    preset10: Math.max(1, Math.round(baseReferencePrice * 0.9)),
    preset20: Math.max(1, Math.round(baseReferencePrice * 0.8)),
  };
}

/**
 * Validates an offer amount:
 * - Must be a finite positive number.
 * - For bundles: ceiling is baseReferencePrice (amountNum <= baseReferencePrice).
 * - For non-bundles: ceiling is listing.price (amountNum < listingPrice).
 */
export function isOfferAmountValid({
  amountNum,
  isBundle,
  baseReferencePrice,
  listingPrice,
}: {
  amountNum: number;
  isBundle: boolean;
  baseReferencePrice: number;
  listingPrice?: number;
}): boolean {
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    return false;
  }
  if (isBundle) {
    return amountNum <= baseReferencePrice;
  }
  const validListingPrice =
    typeof listingPrice === 'number' && Number.isFinite(listingPrice) && listingPrice > 0;
  if (!validListingPrice) {
    return false;
  }
  return amountNum < listingPrice;
}

/**
 * Sanitizes bundle item IDs from a comma-separated query param string:
 * - Drops empty tokens
 * - Strips out the primary listing ID (if present) to prevent self-bundling
 * - Strips out any secondary listingId match
 * - Deduplicates remaining item IDs
 */
export function sanitizeBundleItemIds(
  bundleIdsParam: string | null | undefined,
  primaryId?: string | null,
  listingId?: string | null,
): string[] {
  if (!bundleIdsParam || typeof bundleIdsParam !== 'string') return [];
  const pId = primaryId ? String(primaryId) : '';
  const lId = listingId ? String(listingId) : '';
  const raw = bundleIdsParam.split(',').filter(Boolean);
  return Array.from(
    new Set(raw.filter((itemId) => itemId !== pId && (!lId || itemId !== lId))),
  );
}

/**
 * Computes the item price for checkout:
 * - If an offer amount is accepted/present, that takes precedence.
 * - If a bundle: uses recomputed bundleCalculationTotal (falls back to listing price if missing).
 * - If non-bundle: uses listing price.
 */
export function computeCheckoutItemPrice({
  offerAmount,
  isBundle,
  bundleCalculationTotal,
  listingPrice,
}: {
  offerAmount: number | null;
  isBundle: boolean;
  bundleCalculationTotal?: number | null;
  listingPrice: number;
}): number {
  return (
    offerAmount ??
    (isBundle
      ? bundleCalculationTotal ?? Number(listingPrice ?? 0)
      : Number(listingPrice ?? 0))
  );
}
