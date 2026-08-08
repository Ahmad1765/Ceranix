import { describe, it, expect } from 'vitest';
import { resolveOfferCharge, ACCEPTED_OFFER_TTL_MS } from './pricing';

const MSG = 'mmmmmmmm-mmmm-mmmm-mmmm-mmmmmmmmmmmm';
const NOW = Date.parse('2026-08-09T12:00:00.000Z');

function offer(over: Record<string, unknown> = {}) {
  return {
    id: MSG,
    metadata: { amount: 500 },
    // Accepted an hour ago.
    updated_at: new Date(NOW - 3_600_000).toISOString(),
    ...over,
  } as any;
}

function charged(r: ReturnType<typeof resolveOfferCharge>) {
  if ('error' in r) throw new Error(`expected a charge, got ${r.status} ${r.error}`);
  return r;
}

describe('resolveOfferCharge', () => {
  it('charges the accepted offer price', () => {
    const r = charged(
      resolveOfferCharge({ listingPrice: 8000, offer: offer(), clientHint: 500, now: NOW }),
    );
    expect(r).toEqual({ amount: 500, offerMessageId: MSG });
  });

  it('accepts a numeric-string amount', () => {
    const r = charged(
      resolveOfferCharge({
        listingPrice: 8000,
        offer: offer({ metadata: { amount: '500' } }),
        clientHint: 500,
        now: NOW,
      }),
    );
    expect(r.amount).toBe(500);
  });

  describe('never charges above the sticker price', () => {
    it('uses the listing price when the seller has dropped below the offer', () => {
      // Buyer's offer was 500; seller has since cut the item to 300. Charging
      // 500 would take more than the item is currently listed for.
      const r = charged(
        resolveOfferCharge({ listingPrice: 300, offer: offer(), clientHint: 500, now: NOW }),
      );
      expect(r.amount).toBe(300);
    });

    it('still uses the offer when it is below the listing price', () => {
      const r = charged(
        resolveOfferCharge({ listingPrice: 8000, offer: offer(), clientHint: 500, now: NOW }),
      );
      expect(r.amount).toBe(500);
    });

    it('falls back to the offer when the listing price is unusable', () => {
      // A missing/zero price must not collapse the charge to 0 via Math.min.
      for (const bad of [0, -1, null, undefined, 'abc', NaN]) {
        const r = charged(
          resolveOfferCharge({ listingPrice: bad, offer: offer(), clientHint: 500, now: NOW }),
        );
        expect(r.amount).toBe(500);
      }
    });
  });

  describe('expiry', () => {
    it('allows an offer accepted just inside the window', () => {
      const r = charged(
        resolveOfferCharge({
          listingPrice: 8000,
          offer: offer({
            updated_at: new Date(NOW - ACCEPTED_OFFER_TTL_MS + 60_000).toISOString(),
          }),
          clientHint: 500,
          now: NOW,
        }),
      );
      expect(r.amount).toBe(500);
    });

    it('rejects an offer accepted past the window', () => {
      expect(
        resolveOfferCharge({
          listingPrice: 8000,
          offer: offer({
            updated_at: new Date(NOW - ACCEPTED_OFFER_TTL_MS - 60_000).toISOString(),
          }),
          clientHint: 500,
          now: NOW,
        }),
      ).toEqual({ error: 'This accepted offer has expired', status: 409 });
    });

    it('rejects an unparseable acceptance time rather than assuming it is fresh', () => {
      expect(
        resolveOfferCharge({
          listingPrice: 8000,
          offer: offer({ updated_at: 'not-a-date' }),
          clientHint: 500,
          now: NOW,
        }),
      ).toEqual({ error: 'Accepted offer is missing an acceptance time', status: 409 });
    });
  });

  describe('rejects what must never become a charge', () => {
    it('refuses when there is no accepted offer', () => {
      for (const bad of [null, undefined]) {
        expect(resolveOfferCharge({ listingPrice: 8000, offer: bad, clientHint: 500, now: NOW }))
          .toEqual({ error: 'No accepted offer found for this listing', status: 403 });
      }
    });

    it('refuses a non-positive or nonsense offer amount', () => {
      // The Rs 1 exploit is dead at the DB now, but this is the second gate:
      // a zero/negative/garbage amount must never reach Stripe.
      for (const bad of [0, -100, null, undefined, 'abc', {}, []]) {
        const r = resolveOfferCharge({
          listingPrice: 8000,
          offer: offer({ metadata: { amount: bad } }),
          clientHint: 500,
          now: NOW,
        });
        expect(r).toEqual({ error: 'No accepted offer found for this listing', status: 403 });
      }
    });

    it('refuses when the client hint disagrees with the real offer', () => {
      // The attack this blocks: show the buyer 500, charge the accepted 5000.
      expect(
        resolveOfferCharge({ listingPrice: 8000, offer: offer(), clientHint: 5, now: NOW }),
      ).toEqual({ error: 'Offer amount mismatch', status: 409 });
    });

    it('tolerates float noise within half a paisa', () => {
      const r = charged(
        resolveOfferCharge({
          listingPrice: 8000,
          offer: offer({ metadata: { amount: 500.001 } }),
          clientHint: 500,
          now: NOW,
        }),
      );
      expect(r.amount).toBeCloseTo(500, 2);
    });
  });
});
