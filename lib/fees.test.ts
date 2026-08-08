import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  BUYER_PROTECTION_FEE,
  buyerProtectionFee,
  orderTotal,
  priceBreakdown,
  formatPrice,
} from '@/lib/fees';

describe('buyerProtectionFee', () => {
  it('is a flat fee, identical at every price point', () => {
    expect(buyerProtectionFee(500)).toBe(100);
    expect(buyerProtectionFee(5_000)).toBe(100);
    expect(buyerProtectionFee(50_000)).toBe(100);
    expect(buyerProtectionFee(1)).toBe(100);
  });

  it('never scales with the item price', () => {
    // The regression this replaced: a percentage component made the fee on an
    // expensive item many times the fee on a cheap one.
    expect(buyerProtectionFee(100_000)).toBe(buyerProtectionFee(100));
    expect(buyerProtectionFee(3.33)).toBe(BUYER_PROTECTION_FEE);
  });

  it('is zero for empty, zero, or invalid prices', () => {
    expect(buyerProtectionFee(0)).toBe(0);
    expect(buyerProtectionFee(-5)).toBe(0);
    expect(buyerProtectionFee(null)).toBe(0);
    expect(buyerProtectionFee(undefined)).toBe(0);
    expect(buyerProtectionFee('' as any)).toBe(0);
  });

  it('accepts numeric strings', () => {
    expect(buyerProtectionFee('1200')).toBe(100);
  });
});

describe('orderTotal', () => {
  it('is item price plus the flat buyer protection fee', () => {
    expect(orderTotal(500)).toBe(600);
    expect(orderTotal(5_000)).toBe(5_100);
    expect(orderTotal(50_000)).toBe(50_100);
  });

  it('is zero for invalid prices', () => {
    expect(orderTotal(0)).toBe(0);
    expect(orderTotal(null)).toBe(0);
  });
});

describe('priceBreakdown', () => {
  it('returns item, protection, and total that add up', () => {
    const { item, protection, total } = priceBreakdown(2_499);
    expect(item).toBe(2_499);
    expect(protection).toBe(100);
    expect(total).toBe(2_599);
    expect(item + protection).toBe(total);
  });

  it('shows no protection line for a priceless row', () => {
    expect(priceBreakdown(0)).toEqual({ item: 0, protection: 0, total: 0 });
  });
});

describe('the edge function copy of the fee', () => {
  // create-checkout-session runs on Deno and cannot import lib/fees.ts, so it
  // re-declares BUYER_PROTECTION_FEE. That duplicate is what the buyer is
  // actually charged; this file is what the buyer is shown. If they drift, the
  // app quotes one total and Stripe collects another — read the constant out of
  // the source rather than trusting the "keep in sync" comment above it.
  const source = readFileSync(
    path.resolve(__dirname, '../supabase/functions/create-checkout-session/index.ts'),
    'utf8',
  );

  it('declares the same flat fee as lib/fees.ts', () => {
    const match = source.match(/const BUYER_PROTECTION_FEE\s*=\s*(\d+(?:\.\d+)?)\s*;/);
    expect(match, 'BUYER_PROTECTION_FEE not found in the edge function').not.toBeNull();
    expect(Number(match![1])).toBe(BUYER_PROTECTION_FEE);
  });

  it('still passes the split to the webhook as metadata', () => {
    // stripe-webhook derives fee_cents from this metadata instead of re-deriving
    // the formula. Drop it and every order silently records fee_cents = 0.
    expect(source).toContain("params.append('metadata[fee_cents]'");
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
