// What an invoice says, derived in one testable place.
//
// This used to be a nested ternary inside app/invoice/[id].tsx, where nothing
// could reach it. It decides whether a buyer is shown "Paid" — the highest
// consequence string in the app — so it gets its own module and its own test.

import type { Order } from '@/lib/payments';

export type InvoiceStatus = 'paid' | 'pending' | 'confirming' | 'refunded';

/**
 * Derive the invoice status.
 *
 * Rules that must not regress:
 *  - Only a `paid` order shows Paid. Never listings.is_sold: that is a seller-
 *    controlled toggle, so trusting it let a seller forge a Paid invoice, or
 *    flip a real one back to Pending and send the buyer to pay twice.
 *  - A refunded / refund_due order must NOT fall back to Pending, which would
 *    offer a Pay button for an item that already went to someone else.
 *  - `confirming` is transient, shown only while re-checking after a checkout
 *    return. It is never derived from the URL.
 */
export function deriveInvoiceStatus(
  order: Pick<Order, 'status'> | null | undefined,
  confirming: boolean,
): InvoiceStatus {
  if (order?.status === 'paid') return 'paid';
  if (order?.status === 'refunded' || order?.status === 'refund_due') return 'refunded';
  if (confirming) return 'confirming';
  return 'pending';
}

/**
 * The amounts to show, in whole PKR.
 *
 * Once an order exists it IS the record of what was charged, and the only
 * source reflecting an accepted-offer price — listing.price does not. Rows
 * store minor units (paisa).
 */
export function deriveInvoiceAmounts(
  order: Pick<Order, 'amount_cents' | 'fee_cents'> | null | undefined,
  listingPrice: unknown,
  feeForPrice: (price: number) => number,
): { item: number; fee: number; total: number } {
  if (order) {
    const item = order.amount_cents / 100;
    const fee = order.fee_cents / 100;
    return { item, fee, total: item + fee };
  }
  const n = typeof listingPrice === 'string' ? parseFloat(listingPrice) : Number(listingPrice);
  const item = Number.isFinite(n) && n > 0 ? n : 0;
  const fee = feeForPrice(item);
  return { item, fee, total: item + fee };
}
