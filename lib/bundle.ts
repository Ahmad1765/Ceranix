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
