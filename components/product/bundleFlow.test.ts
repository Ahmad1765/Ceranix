import { describe, it, expect, vi } from 'vitest';
import { computeBundlePricing } from '@/lib/bundle';
import { sendOffer } from '@/lib/chat';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      insert: vi.fn((payload: any) => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({
            data: {
              id: 'msg-bundle-123',
              conversation_id: payload.conversation_id,
              sender_id: payload.sender_id,
              content: payload.content,
              kind: payload.kind,
              metadata: payload.metadata,
              offer_status: payload.offer_status,
              created_at: '2026-09-02T12:00:00Z',
              updated_at: '2026-09-02T12:00:00Z',
            },
            error: null,
          }),
        })),
      })),
    })),
  },
}));

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

  it('generates correct bundle checkout and offer payload metadata', async () => {
    const baseListingId = 'base-123';
    const selectedBundleIds = ['item-456', 'item-789'];

    // 1. Serialization (useProductBundle: ids.join(','))
    const bundleIdsParam = selectedBundleIds.join(',');
    expect(bundleIdsParam).toBe('item-456,item-789');

    // 2. Route param parsing (app/conversation/new.tsx & app/payment/[id].tsx)
    const parsedBundleIds = bundleIdsParam.split(',').filter(Boolean);
    const isBundle = parsedBundleIds.length > 0;
    const bundleCount = 1 + parsedBundleIds.length;
    const allItemIds = [baseListingId, ...parsedBundleIds];

    expect(isBundle).toBe(true);
    expect(bundleCount).toBe(3);
    expect(parsedBundleIds).toEqual(['item-456', 'item-789']);
    expect(allItemIds).toEqual(['base-123', 'item-456', 'item-789']);

    // 3. sendOffer derivation and metadata execution
    const message = await sendOffer({
      conversationId: 'conv-test-1',
      senderId: 'buyer-user-1',
      amount: 4500,
      isBundle,
      bundleItemIds: parsedBundleIds,
      bundleCount,
    });

    expect(message).not.toBeNull();
    expect(message?.kind).toBe('offer');
    expect(message?.offer_status).toBe('pending');
    expect(message?.content).toContain('Bundle offer (3 items)');
    expect(message?.metadata).toMatchObject({
      amount: 4500,
      currency: 'PKR',
      is_bundle: true,
      bundle_count: 3,
      bundle_item_ids: ['item-456', 'item-789'],
    });
  });

  it('calculates 10% and 20% presets against full bundle total rather than single item price', () => {
    const bundleTotal = 4500;
    const preset10 = Math.max(1, Math.round(bundleTotal * 0.9));
    const preset20 = Math.max(1, Math.round(bundleTotal * 0.8));

    expect(preset10).toBe(4050);
    expect(preset20).toBe(3600);
  });
});
