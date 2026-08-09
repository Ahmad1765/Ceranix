// Order-history presentation logic, derived in one testable place.
//
// Same reasoning as lib/invoiceStatus.ts: what a row says about someone's money
// is the highest-consequence string on the screen, so the branching lives here
// with a test rather than inline in app/orders.tsx where nothing can reach it.

import type { MyOrder } from '@/lib/payments';

export type OrderSide = 'bought' | 'sold';

/**
 * Normalize the `listing` embed on one order row.
 *
 * A to-one embed should arrive as an object, but PostgREST has been observed
 * handing back a single-element array for this exact shape elsewhere in this
 * codebase (fetchLikedListings in lib/listings.ts normalizes the same case).
 * Casting past it would survive typecheck and then render every row as "Item no
 * longer listed" with no image — a wrong answer on a screen about money, which
 * is why this is normalized rather than asserted.
 */
export function normalizeMyOrder(row: {
  listing: MyOrder['listing'] | MyOrder['listing'][];
}): { listing: MyOrder['listing'] } {
  const { listing } = row;
  return { ...row, listing: Array.isArray(listing) ? (listing[0] ?? null) : listing };
}

/**
 * Which side of the sale the viewer was on.
 *
 * A single row is a purchase for the buyer and a sale for the seller, and RLS
 * returns it to both — so the viewer id, never the row alone, decides which
 * list it belongs in. Self-purchases can't happen (create-checkout-session
 * rejects a buyer who is the seller), but if one ever did it counts as a
 * purchase rather than appearing in neither list.
 */
export function orderSide(order: Pick<MyOrder, 'buyer_id'>, viewerId: string): OrderSide {
  return order.buyer_id === viewerId ? 'bought' : 'sold';
}

export function partitionOrders(orders: MyOrder[], viewerId: string) {
  const bought: MyOrder[] = [];
  const sold: MyOrder[] = [];
  for (const o of orders) {
    (orderSide(o, viewerId) === 'bought' ? bought : sold).push(o);
  }
  return { bought, sold };
}

export type OrderTone = 'positive' | 'neutral' | 'warn';

/**
 * The badge a history row shows.
 *
 * Rules that must not regress:
 *  - Only status 'paid' may read as a completed, money-moved order. Everything
 *    else is explicitly not-positive, so an abandoned or refunded checkout can
 *    never sit in someone's history looking like a completed purchase.
 *  - 'refund_due' is a buyer who paid for an item another buyer had already
 *    won (see orders_one_paid_per_listing_idx). Their money is coming back, so
 *    it must not read as either a successful purchase OR a plain refund they
 *    asked for.
 */
export function orderBadge(
  status: MyOrder['status'],
  side: OrderSide,
): { label: string; tone: OrderTone } {
  switch (status) {
    case 'paid':
      return { label: side === 'bought' ? 'Paid' : 'Sold', tone: 'positive' };
    case 'refunded':
      return { label: 'Refunded', tone: 'neutral' };
    case 'refund_due':
      return { label: 'Refund on the way', tone: 'warn' };
    case 'canceled':
      return { label: 'Canceled', tone: 'neutral' };
    case 'pending':
      return { label: 'Awaiting payment', tone: 'warn' };
    default: {
      // Exhaustiveness guard. `pending` is an explicit case above so that this
      // branch types as `never`: adding a status to Order['status'] without
      // deciding what it says here becomes a compile error rather than a row
      // that silently reads "Awaiting payment". On a screen about money, a
      // confidently wrong label is worse than a build that won't ship — and the
      // behavioural test below can't catch it, since it enumerates the statuses
      // it already knows about.
      const unexpected: never = status;
      console.warn('[orders] unhandled order status', unexpected);
      return { label: 'Awaiting payment', tone: 'warn' };
    }
  }
}
