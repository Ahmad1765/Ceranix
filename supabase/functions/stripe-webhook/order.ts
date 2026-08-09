// Pure order-shaping and conflict-classification for stripe-webhook.
//
// Deliberately free of Deno globals so vitest covers it (see vitest.config.ts,
// same arrangement as send-push/mapper.ts). The fee split and the duplicate-
// payment branch are money paths that cannot otherwise be exercised without a
// live Stripe account, which is exactly why they need a check here.

export type OrderRow = {
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  amount_cents: number;
  fee_cents: number;
  currency: string;
  stripe_session_id: string;
  stripe_payment_intent: string | null;
  offer_message_id: string | null;
  status: 'paid' | 'refund_due';
};

/**
 * Shape a checkout.session.completed payload into an orders row, or explain
 * why it cannot be recorded.
 *
 * `amount_total` arrives INCLUDING Buyer Protection, which is charged as
 * line_items[1], so the fee is subtracted back out: amount_cents is the item
 * alone. create-checkout-session passes the split as metadata.fee_cents so
 * this never has to re-derive the fee formula from lib/fees.ts — one less
 * place for the two to drift.
 */
export function buildOrder(
  session: any,
): { order: OrderRow } | { error: string } {
  const meta = session?.metadata ?? {};
  const listingId = meta.listing_id;
  const buyerId = meta.buyer_id ?? session?.client_reference_id;
  const sellerId = meta.seller_id;
  const sessionId = session?.id;
  const total = Number(session?.amount_total);

  if (!listingId || !buyerId || !sellerId || !sessionId) {
    return { error: 'missing metadata' };
  }
  if (!Number.isFinite(total) || total <= 0) {
    return { error: 'missing amount_total' };
  }

  // Only settle money Stripe actually collected. Card-only checkouts are paid
  // on completion, but an async payment method — or a future change to
  // payment_method_types — can complete the session while funds are in flight.
  // Marking that sold would hand over the item before it was paid for.
  if (session?.payment_status && session.payment_status !== 'paid') {
    return { error: `payment_status=${session.payment_status}` };
  }

  // A fee at or above the total would imply a non-positive item price, which
  // the amount_cents > 0 check constraint rejects anyway. Treat a nonsense
  // split as "no fee recorded" rather than writing a corrupt row.
  const rawFee = Number(meta.fee_cents);
  const feeCents =
    Number.isFinite(rawFee) && rawFee >= 0 && rawFee < total
      ? Math.round(rawFee)
      : 0;

  return {
    order: {
      listing_id: listingId,
      buyer_id: buyerId,
      seller_id: sellerId,
      amount_cents: total - feeCents,
      fee_cents: feeCents,
      currency: session?.currency ?? 'pkr',
      stripe_session_id: sessionId,
      stripe_payment_intent: session?.payment_intent ?? null,
      offer_message_id: meta.offer_message_id || null,
      status: 'paid',
    },
  };
}

/**
 * What a failed order insert means.
 *
 * 'ok'              inserted.
 * 'duplicate_event' same stripe_session_id — Stripe retried an event we already
 *                   recorded. Safe to acknowledge.
 * 'listing_taken'   another buyer's paid order won the race for this listing
 *                   (orders_one_paid_per_listing_idx). This buyer's money is
 *                   real and has to go back.
 * 'fatal'           anything else — let Stripe retry with backoff.
 */
export function classifyInsertError(
  err: { code?: string; message?: string; details?: string } | null | undefined,
): 'ok' | 'duplicate_event' | 'listing_taken' | 'fatal' {
  if (!err) return 'ok';
  if (err.code !== '23505') return 'fatal';
  // Postgres names the violated index in the error text. The only other unique
  // constraint on this table is stripe_session_id, so anything that isn't the
  // partial paid-per-listing index is a plain retry.
  const text = `${err.message ?? ''} ${err.details ?? ''}`;
  return text.includes('orders_one_paid_per_listing')
    ? 'listing_taken'
    : 'duplicate_event';
}
