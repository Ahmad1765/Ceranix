import { describe, it, expect } from 'vitest';
import { buyerProtectionFee, orderTotal, priceBreakdown, formatPrice } from '@/lib/fees';

describe('buyerProtectionFee', () => {
  it('is the fixed fee plus a percentage of the item price', () => {
    // $1.00 → $0.70 + 5% = $0.75 (the canonical reference case).
    expect(buyerProtectionFee(1)).toBe(0.75);
    expect(buyerProtectionFee(10)).toBe(1.2);
    expect(buyerProtectionFee(100)).toBe(5.7);
  });

  it('rounds to whole cents', () => {
    expect(buyerProtectionFee(3.33)).toBe(0.87);
  });

  it('is zero for empty, zero, or invalid prices', () => {
    expect(buyerProtectionFee(0)).toBe(0);
    expect(buyerProtectionFee(-5)).toBe(0);
    expect(buyerProtectionFee(null)).toBe(0);
    expect(buyerProtectionFee(undefined)).toBe(0);
    expect(buyerProtectionFee('' as any)).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(buyerProtectionFee('1')).toBe(0.75);
  });
});

describe('orderTotal', () => {
  it('is item price plus buyer protection', () => {
    expect(orderTotal(1)).toBe(1.75);
    expect(orderTotal(25)).toBe(26.95);
  });

  it('is zero for invalid prices', () => {
    expect(orderTotal(0)).toBe(0);
    expect(orderTotal(null)).toBe(0);
  });
});

describe('priceBreakdown', () => {
  it('returns item, protection, and total that add up', () => {
    const { item, protection, total } = priceBreakdown(1);
    expect(item).toBe(1);
    expect(protection).toBe(0.75);
    expect(total).toBe(1.75);
    expect(Math.round((item + protection) * 100) / 100).toBe(total);
  });
});

describe('formatPrice', () => {
  it('formats in PKR — whole amounts without decimals, fractional with two', () => {
    expect(formatPrice(1.75)).toBe('Rs 1.75');
    expect(formatPrice(1250)).toBe('Rs 1,250');
    expect(formatPrice(0)).toBe('Rs 0');
  });

  it('is safe on non-finite input', () => {
    expect(formatPrice(NaN)).toBe('Rs 0');
  });
});
