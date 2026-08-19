import { describe, it, expect } from 'vitest';
import { orderSide, partitionOrders, orderBadge, normalizeMyOrder } from '@/lib/orders';
import type { MyOrder } from '@/lib/payments';

const ME = 'me-uuid';
const THEM = 'them-uuid';

const row = (over: Partial<MyOrder>): MyOrder =>
  ({
    id: 'o1',
    status: 'paid',
    amount_cents: 500000,
    fee_cents: 10000,
    currency: 'pkr',
    payment_method: 'card',
    created_at: '2026-08-01T00:00:00Z',
    listing_id: 'l1',
    buyer_id: ME,
    seller_id: THEM,
    listing: null,
    ...over,
  }) as MyOrder;

describe('orderSide', () => {
  it('is a purchase when the viewer is the buyer, a sale otherwise', () => {
    expect(orderSide(row({ buyer_id: ME }), ME)).toBe('bought');
    expect(orderSide(row({ buyer_id: THEM }), ME)).toBe('sold');
  });
});

describe('partitionOrders', () => {
  it('splits the same RLS result set by viewer', () => {
    // RLS hands both parties the identical row, so the split must key off the
    // viewer. Getting this backwards would show a seller their own listings as
    // things they had purchased.
    const orders = [
      row({ id: 'a', buyer_id: ME, seller_id: THEM }),
      row({ id: 'b', buyer_id: THEM, seller_id: ME }),
    ];
    const mine = partitionOrders(orders, ME);
    expect(mine.bought.map((o) => o.id)).toEqual(['a']);
    expect(mine.sold.map((o) => o.id)).toEqual(['b']);

    const theirs = partitionOrders(orders, THEM);
    expect(theirs.bought.map((o) => o.id)).toEqual(['b']);
    expect(theirs.sold.map((o) => o.id)).toEqual(['a']);
  });

  it('keeps every row — nothing silently vanishes from history', () => {
    const orders = [row({ id: 'a' }), row({ id: 'b', buyer_id: THEM, seller_id: ME })];
    const { bought, sold } = partitionOrders(orders, ME);
    expect(bought.length + sold.length).toBe(orders.length);
  });
});

describe('normalizeMyOrder', () => {
  const listing = { id: 'l1', title: 'Wool coat', images: ['a.jpg'], price: 4200 };

  it('accepts the embed as an object, an array, or absent', () => {
    expect(normalizeMyOrder({ listing }).listing).toEqual(listing);
    expect(normalizeMyOrder({ listing: [listing] }).listing).toEqual(listing);
    expect(normalizeMyOrder({ listing: null }).listing).toBeNull();
    expect(normalizeMyOrder({ listing: [] }).listing).toBeNull();
  });
});

describe('orderBadge', () => {
  it('reads as positive only for a paid order', () => {
    expect(orderBadge('paid', 'bought')).toEqual({ label: 'Paid', tone: 'positive' });
    expect(orderBadge('paid', 'sold')).toEqual({ label: 'Sold', tone: 'positive' });
  });

  it('never lets a non-paid order look like a completed purchase', () => {
    for (const s of ['pending', 'canceled', 'refunded', 'refund_due', 'failed'] as const) {
      expect(orderBadge(s, 'bought').tone).not.toBe('positive');
      expect(orderBadge(s, 'sold').tone).not.toBe('positive');
    }
  });

  it('distinguishes a losing-race refund from a plain refund', () => {
    expect(orderBadge('refund_due', 'bought').label).not.toBe(
      orderBadge('refunded', 'bought').label,
    );
  });

  it('handles Cash on Delivery (CoD) pending badges for buyer and seller', () => {
    expect(orderBadge('pending', 'bought', 'cod')).toEqual({
      label: 'CoD · Pay on delivery',
      tone: 'warn',
    });
    expect(orderBadge('pending', 'sold', 'cod')).toEqual({
      label: 'CoD · Awaiting delivery',
      tone: 'warn',
    });
  });

  it('handles failed order status badge', () => {
    expect(orderBadge('failed', 'bought')).toEqual({
      label: 'Payment failed',
      tone: 'warn',
    });
  });
});
