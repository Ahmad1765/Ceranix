// What a buyer is actually charged, decided in one pure place.
//
// Free of Deno globals so vitest covers it (same arrangement as
// stripe-webhook/order.ts and send-push/mapper.ts). This is the single most
// security-sensitive calculation in the app — it turns a client request into a
// Stripe charge — and it previously lived inline in index.ts where nothing
// could test it.

/**
 * How long an accepted offer stays redeemable.
 *
 * Offers used to never expire: one accepted months ago could still be checked
 * out at the old price, an unbounded liability for the seller. Seven days is a
 * deliberate starting point, not a law — it is the one number here most likely
 * to need tuning against real seller behaviour.
 */
export const ACCEPTED_OFFER_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Client hints are floats; anything under half a paisa is the same money. */
const AMOUNT_EPSILON = 0.005;

export type AcceptedOffer = {
  id: string;
  metadata: { amount?: unknown } | null;
  updated_at: string;
};

export type ChargeResolution =
  | { amount: number; offerMessageId: string }
  | { error: string; status: number };

function toPositiveNumber(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Resolve the charge for a buyer redeeming an accepted offer.
 *
 * `updated_at` is when the offer was accepted: messages.offer_status only
 * changes via UPDATE, and trg_messages_touch stamps updated_at on every one.
 */
export function resolveOfferCharge(args: {
  listingPrice: unknown;
  offer: AcceptedOffer | null | undefined;
  clientHint: number;
  now?: number;
}): ChargeResolution {
  const { offer, clientHint } = args;
  const now = args.now ?? Date.now();

  const offerAmount = toPositiveNumber(offer?.metadata?.amount);
  if (!offer || offerAmount === null) {
    return { error: 'No accepted offer found for this listing', status: 403 };
  }

  // The client hint must match the real accepted offer, or the UI is showing
  // the buyer one price while we charge another.
  if (Math.abs(offerAmount - clientHint) > AMOUNT_EPSILON) {
    return { error: 'Offer amount mismatch', status: 409 };
  }

  const acceptedAt = Date.parse(offer.updated_at);
  if (!Number.isFinite(acceptedAt)) {
    // No trustworthy acceptance time means no way to know if it is stale.
    return { error: 'Accepted offer is missing an acceptance time', status: 409 };
  }
  if (now - acceptedAt > ACCEPTED_OFFER_TTL_MS) {
    return { error: 'This accepted offer has expired', status: 409 };
  }

  // Never charge more than the item's current sticker price. If the seller has
  // since dropped the price below the accepted offer, the buyer pays the lower
  // of the two — being charged above list for opting into an "offer" is the
  // kind of surprise that reads as a scam.
  const listingPrice = toPositiveNumber(args.listingPrice);
  const amount =
    listingPrice !== null ? Math.min(offerAmount, listingPrice) : offerAmount;

  return { amount, offerMessageId: offer.id };
}
