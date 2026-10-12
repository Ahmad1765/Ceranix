import { describe, it, expect } from 'vitest';
import { orderTotal, buyerProtectionFee } from '@/lib/fees';
import { formatPrice } from '@/lib/currency';
import { OFFER_PRESET_TIERS, calculateTierPrices, isValidOfferAmount } from './offerHelpers';

describe('OfferSheet calculations and formatting', () => {
  it('contains the 5 preset tiers from Reference Image 7', () => {
    const labels = OFFER_PRESET_TIERS.map((t) => t.label);
    expect(labels).toEqual(['-20%', '-15%', '-10%', '-5%', 'Custom']);
  });

  it('calculates the exact reference discount amounts for $180 asking price (Image 7)', () => {
    const askingPrice = 180;
    const tiers = calculateTierPrices(askingPrice);

    // -20% of 180 is 144 (exact match to Image 7 $144)
    expect(tiers['20']).toBe(144);
    expect(tiers['15']).toBe(153);
    expect(tiers['10']).toBe(162);
    expect(tiers['5']).toBe(171);
  });

  it('handles higher asking prices with clean integer rounding', () => {
    const askingPrice = 155;
    const tiers = calculateTierPrices(askingPrice);

    expect(tiers['10']).toBe(140);
    expect(tiers['20']).toBe(124);
  });

  it('validates offer amounts against asking price', () => {
    const askingPrice = 20;

    expect(isValidOfferAmount(15, askingPrice)).toBe(true);
    expect(isValidOfferAmount(18, askingPrice)).toBe(true);
    expect(isValidOfferAmount(0, askingPrice)).toBe(false);
    expect(isValidOfferAmount(-5, askingPrice)).toBe(false);
    expect(isValidOfferAmount(20, askingPrice)).toBe(false);
    expect(isValidOfferAmount(25, askingPrice)).toBe(false);
  });

  it('computes buyer total with buyer protection fee included', () => {
    const offerAmount = 144;
    const fee = buyerProtectionFee(offerAmount);
    const total = orderTotal(offerAmount);

    expect(total).toBe(offerAmount + fee);
    expect(formatPrice(total)).toBe(formatPrice(offerAmount + fee));
  });
});
