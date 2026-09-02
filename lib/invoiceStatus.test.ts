import { describe, it, expect } from 'vitest';
import { deriveInvoiceStatus, deriveInvoiceAmounts } from '@/lib/invoiceStatus';
import { buyerProtectionFee } from '@/lib/fees';

const order = (status: string, payment_method?: string) => ({ status, payment_method }) as any;

describe('deriveInvoiceStatus', () => {
  it('shows Paid only for a paid order', () => {
    expect(deriveInvoiceStatus(order('paid'), false)).toBe('paid');
  });

  it('shows Pending when the viewer has no order', () => {
    expect(deriveInvoiceStatus(null, false)).toBe('pending');
    expect(deriveInvoiceStatus(undefined, false)).toBe('pending');
  });

  it('never shows Paid for a non-paid order, whatever the state', () => {
    for (const s of ['pending', 'canceled', 'refunded', 'refund_due', 'failed']) {
      expect(deriveInvoiceStatus(order(s), false)).not.toBe('paid');
    }
    expect(deriveInvoiceStatus(null, true)).not.toBe('paid');
  });

  it('shows cod_pending for an active Cash on Delivery order', () => {
    expect(deriveInvoiceStatus(order('pending', 'cod'), false)).toBe('cod_pending');
  });

  it('shows Refunded — not Pending — for a returned payment', () => {
    expect(deriveInvoiceStatus(order('refunded'), false)).toBe('refunded');
    expect(deriveInvoiceStatus(order('refund_due'), false)).toBe('refund_due');
  });

  it('keeps refund_due even while a confirm poll is running', () => {
    expect(deriveInvoiceStatus(order('refund_due'), true)).toBe('refund_due');
  });

  it('shows failed for a failed payment', () => {
    expect(deriveInvoiceStatus(order('failed'), false)).toBe('failed');
  });

  it('shows canceled for a canceled order', () => {
    expect(deriveInvoiceStatus(order('canceled'), false)).toBe('canceled');
  });

  it('shows Confirming only while re-checking with no settled order', () => {
    expect(deriveInvoiceStatus(null, true)).toBe('confirming');
    expect(deriveInvoiceStatus(order('pending'), true)).toBe('confirming');
  });

  it('lets a paid order win over an in-flight confirm poll', () => {
    expect(deriveInvoiceStatus(order('paid'), true)).toBe('paid');
  });
});

describe('deriveInvoiceAmounts', () => {
  it('reports what was actually charged once an order exists', () => {
    // Rs 500 item + Rs 100 fee, stored in paisa.
    const a = deriveInvoiceAmounts(
      { amount_cents: 50_000, fee_cents: 10_000 } as any,
      99_999, // listing.price is stale/irrelevant here
      buyerProtectionFee,
    );
    expect(a).toEqual({ item: 500, fee: 100, total: 600 });
  });

  it('reflects an accepted-offer price, which listing.price does not', () => {
    const a = deriveInvoiceAmounts(
      { amount_cents: 30_000, fee_cents: 10_000 } as any,
      8000,
      buyerProtectionFee,
    );
    expect(a.item).toBe(300);
    expect(a.total).toBe(400);
  });

  it('falls back to listing price + computed fee before any order exists', () => {
    expect(deriveInvoiceAmounts(null, 2500, buyerProtectionFee)).toEqual({
      item: 2500,
      fee: 150,
      total: 2650,
    });
  });

  it('is safe on missing or nonsense listing prices', () => {
    for (const bad of [null, undefined, 0, -5, 'abc', NaN]) {
      const a = deriveInvoiceAmounts(null, bad, buyerProtectionFee);
      expect(a).toEqual({ item: 0, fee: 0, total: 0 });
    }
  });

  it('always has item + fee equal to total', () => {
    const cases = [
      deriveInvoiceAmounts({ amount_cents: 12_345, fee_cents: 10_000 } as any, 1, buyerProtectionFee),
      deriveInvoiceAmounts(null, 777, buyerProtectionFee),
      deriveInvoiceAmounts(null, 0, buyerProtectionFee),
    ];
    for (const a of cases) expect(a.item + a.fee).toBeCloseTo(a.total, 6);
  });
});
