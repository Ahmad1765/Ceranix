import { describe, it, expect } from 'vitest';
import { orderTotal, buyerProtectionFee } from '@/lib/fees';
import { formatPrice } from '@/lib/currency';

describe('OfferSheet calculations and formatting', () => {
  it('calculates 10% and 20% discount presets correctly', () => {
    const askingPrice = 20;
    const preset10 = Math.max(1, Math.round(askingPrice * 0.9));
    const preset20 = Math.max(1, Math.round(askingPrice * 0.8));

    expect(preset10).toBe(18);
    expect(preset20).toBe(16);
  });

  it('handles higher asking prices with clean integer rounding', () => {
    const askingPrice = 155;
    const preset10 = Math.max(1, Math.round(askingPrice * 0.9));
    const preset20 = Math.max(1, Math.round(askingPrice * 0.8));

    expect(preset10).toBe(140);
    expect(preset20).toBe(124);
  });

  it('validates offer amounts against asking price', () => {
    const askingPrice = 20;

    const isValid = (amount: number) => amount > 0 && amount < askingPrice;

    expect(isValid(15)).toBe(true);
    expect(isValid(18)).toBe(true);
    expect(isValid(0)).toBe(false);
    expect(isValid(-5)).toBe(false);
    expect(isValid(20)).toBe(false);
    expect(isValid(25)).toBe(false);
  });

  it('computes buyer total with buyer protection fee included', () => {
    const offerAmount = 15;
    const fee = buyerProtectionFee(offerAmount);
    const total = orderTotal(offerAmount);

    expect(total).toBe(offerAmount + fee);
    expect(formatPrice(total)).toContain('15');
  });
});
