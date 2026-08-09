import { describe, it, expect } from 'vitest';
import { buildOrder, classifyInsertError } from './order';

const LISTING = 'llllllll-llll-llll-llll-llllllllllll';
const BUYER = '11111111-1111-1111-1111-111111111111';
const SELLER = '22222222-2222-2222-2222-222222222222';

// Rs 5,000 item + the flat Rs 100 Buyer Protection fee, in paisa. Mirrors what
// create-checkout-session sends: amount_total is the sum, metadata.fee_cents is
// the fee alone.
const ITEM = 500_000;
const FEE = 10_000;

function session(over: Record<string, unknown> = {}) {
  return {
    id: 'cs_test_1',
    amount_total: ITEM + FEE,
    currency: 'pkr',
    payment_intent: 'pi_test_1',
    payment_status: 'paid',
    metadata: {
      listing_id: LISTING,
      buyer_id: BUYER,
      seller_id: SELLER,
      fee_cents: String(FEE),
    },
    ...over,
  };
}

function ok(result: ReturnType<typeof buildOrder>) {
  if ('error' in result) throw new Error(`expected an order, got: ${result.error}`);
  return result.order;
}

describe('buildOrder', () => {
  it('splits the fee out so amount_cents is the item alone', () => {
    const order = ok(buildOrder(session()));
    expect(order.amount_cents).toBe(ITEM);
    expect(order.fee_cents).toBe(FEE);
    // The invariant that makes the split safe: nothing is invented or lost.
    expect(order.amount_cents + order.fee_cents).toBe(ITEM + FEE);
  });

  it('carries the identifiers the webhook needs', () => {
    const order = ok(buildOrder(session()));
    expect(order).toMatchObject({
      listing_id: LISTING,
      buyer_id: BUYER,
      seller_id: SELLER,
      currency: 'pkr',
      stripe_session_id: 'cs_test_1',
      stripe_payment_intent: 'pi_test_1',
      status: 'paid',
    });
  });

  it('falls back to client_reference_id for the buyer', () => {
    const s = session({ client_reference_id: BUYER });
    delete (s.metadata as Record<string, unknown>).buyer_id;
    expect(ok(buildOrder(s)).buyer_id).toBe(BUYER);
  });

  it('records no fee when metadata omits the split', () => {
    const s = session();
    delete (s.metadata as Record<string, unknown>).fee_cents;
    const order = ok(buildOrder(s));
    expect(order.fee_cents).toBe(0);
    expect(order.amount_cents).toBe(ITEM + FEE);
  });

  it('refuses a fee that would make the item price non-positive', () => {
    // A fee >= total would write a negative amount_cents past the check
    // constraint's back; degrade to "no fee" instead of a corrupt row.
    for (const bad of [ITEM + FEE, ITEM + FEE + 1, -5, NaN, 'abc']) {
      const order = ok(buildOrder(session({ metadata: { ...session().metadata, fee_cents: bad } })));
      expect(order.fee_cents).toBe(0);
      expect(order.amount_cents).toBeGreaterThan(0);
    }
  });

  it('rejects a session whose money has not landed yet', () => {
    expect(buildOrder(session({ payment_status: 'unpaid' }))).toEqual({
      error: 'payment_status=unpaid',
    });
  });

  it('rejects incomplete or nonsense payloads', () => {
    const missing = (key: string) => {
      const s = session();
      delete (s.metadata as Record<string, unknown>)[key];
      return buildOrder(s);
    };
    expect(missing('listing_id')).toEqual({ error: 'missing metadata' });
    expect(missing('seller_id')).toEqual({ error: 'missing metadata' });
    expect(buildOrder(session({ id: undefined }))).toEqual({ error: 'missing metadata' });
    expect(buildOrder(session({ amount_total: 0 }))).toEqual({ error: 'missing amount_total' });
    expect(buildOrder(session({ amount_total: 'x' }))).toEqual({ error: 'missing amount_total' });
    expect(buildOrder({})).toEqual({ error: 'missing metadata' });
  });
});

describe('classifyInsertError', () => {
  it('treats no error as inserted', () => {
    expect(classifyInsertError(null)).toBe('ok');
  });

  it('reads a repeat session id as a webhook retry', () => {
    expect(
      classifyInsertError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "orders_stripe_session_id_key"',
      }),
    ).toBe('duplicate_event');
  });

  it('reads the paid-per-listing index as another buyer winning the race', () => {
    // This is the branch that decides whether a real payment gets refunded —
    // misreading it as a retry would silently keep a duplicate buyer's money.
    expect(
      classifyInsertError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "orders_one_paid_per_listing_idx"',
      }),
    ).toBe('listing_taken');
    // Postgres puts the index name in details on some client paths.
    expect(
      classifyInsertError({
        code: '23505',
        message: 'duplicate key value',
        details: 'Key (listing_id) already exists in orders_one_paid_per_listing_idx.',
      }),
    ).toBe('listing_taken');
  });

  it('lets any other failure retry', () => {
    expect(classifyInsertError({ code: '23503', message: 'fk violation' })).toBe('fatal');
    expect(classifyInsertError({ message: 'network' })).toBe('fatal');
  });
});
