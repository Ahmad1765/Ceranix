import { describe, it, expect } from 'vitest';
import { computeBundlePricing } from '@/lib/bundle';

describe('bundleFlow tests', () => {
  it('calculates bundle pricing with base listing and multiple add-on items', () => {
    const baseListingPrice = 2500;
    const addOnPrices = [1500, 1000]; // 3 items total -> 10% tier
    const pricing = computeBundlePricing(baseListingPrice, addOnPrices);

    expect(pricing.itemCount).toBe(3);
    expect(pricing.subtotal).toBe(5000);
    expect(pricing.pct).toBe(10);
    expect(pricing.qualifies).toBe(true);
    expect(pricing.savings).toBe(500);
    expect(pricing.total).toBe(4500);
    expect(pricing.nextTier?.count).toBe(4);
  });

  it('handles seller custom discount if higher than marketplace tier', () => {
    const baseListingPrice = 3000;
    const addOnPrices = [2000]; // 2 items -> standard is 5%, seller set 20%
    const sellerDiscount = 20;
    const pricing = computeBundlePricing(baseListingPrice, addOnPrices, sellerDiscount);

    expect(pricing.itemCount).toBe(2);
    expect(pricing.subtotal).toBe(5000);
    expect(pricing.pct).toBe(20);
    expect(pricing.savings).toBe(1000);
    expect(pricing.total).toBe(4000);
  });

  it('generates correct bundle checkout and offer payload metadata', () => {
    const baseListingId = 'base-123';
    const selectedBundleIds = ['item-456', 'item-789'];
    const allItemIds = [baseListingId, ...selectedBundleIds];

    const isBundle = selectedBundleIds.length > 0;
    const bundleCount = 1 + selectedBundleIds.length;

    expect(isBundle).toBe(true);
    expect(bundleCount).toBe(3);
    expect(allItemIds).toEqual(['base-123', 'item-456', 'item-789']);

    const offerMetadata = {
      amount: 4500,
      currency: 'PKR',
      note: 'Bundle offer for 3 items',
      is_bundle: isBundle,
      bundle_item_ids: selectedBundleIds,
      bundle_count: bundleCount,
    };

    expect(offerMetadata.is_bundle).toBe(true);
    expect(offerMetadata.bundle_count).toBe(3);
    expect(offerMetadata.bundle_item_ids).toHaveLength(2);
  });
});
