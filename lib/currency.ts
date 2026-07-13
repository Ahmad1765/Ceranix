// Single source of truth for how money is shown across the app. Ceranix trades
// in Pakistani Rupees (PKR), so every price, fee, offer, and total routes
// through here — the symbol and formatting can never drift between screens.
//
// Values are stored as plain numbers; this module only controls presentation.
// Whole amounts render without decimals (Rs 1,250); fractional amounts keep two
// (Rs 1.75), so the Buyer Protection breakdown still reads cleanly.

export const CURRENCY_SYMBOL = 'Rs';
export const CURRENCY_CODE = 'PKR';

export function formatPrice(amount: number | string | null | undefined): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : Number(amount);
  if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL} 0`;
  const hasFraction = Math.round(n * 100) % 100 !== 0;
  const num = n.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOL} ${num}`;
}
