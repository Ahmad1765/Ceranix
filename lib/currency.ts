// Single source of truth for how money is shown across the app. Ceranix trades
// in Pakistani Rupees (PKR), so every price, fee, offer, and total routes
// through here — the symbol and formatting can never drift between screens.
//
// Values are stored as plain numbers; this module only controls presentation.
// Whole amounts render without decimals (Rs 1,250); fractional amounts keep two
// (Rs 1.75), so the Buyer Protection breakdown still reads cleanly.

export const CURRENCY_SYMBOL = 'Rs';
export const CURRENCY_CODE = 'PKR';

// `whole: true` rounds to the nearest rupee and never shows decimals — used on
// browsing surfaces (grid cards, product headline) where sub-rupee precision is
// noise. Leave it off for the Buyer Protection breakdown, where the Rs 0.70 fee
// and its total genuinely need the cents.
export function formatPrice(
  amount: number | string | null | undefined,
  opts?: { whole?: boolean },
): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL} 0`;
  if (opts?.whole) {
    return `${CURRENCY_SYMBOL} ${Math.round(n).toLocaleString('en-US')}`;
  }
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  const num = n.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOL} ${num}`;
}
