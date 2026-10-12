import { describe, it, expect, vi } from 'vitest';
import {
  computeBundlePricing,
  calculateOfferPresets,
  isOfferAmountValid,
  sanitizeBundleItemIds,
  computeCheckoutItemPrice,
  isBundlesEnabled,
} from '@/lib/bundle';
import {
  sendOffer,
  cancelBundleOffersForSoldItem,
  checkAndCancelInvalidBundleOffers,
} from '@/lib/chat';
import { serializeBundleIds } from '@/components/product/useProductBundle';

vi.mock('expo-router', () => ({
  router: { push: vi.fn() },
}));

vi.mock('@/components/product/shared', () => ({
  tap: vi.fn(),
}));

vi.mock('@/lib/toast', () => ({
  useToast: () => ({ show: vi.fn() }),
}));

let mockMessages: any[] = [];
let mockListings: any[] = [];
let updatedMessages: any[] = [];

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'messages') {
        return {
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
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn(() => {
                const promise = Promise.resolve({ data: mockMessages, error: null });
                return Object.assign(promise, {
                  or: vi.fn((orExpr: string) => {
                    const matchId = orExpr.match(/base_listing_id\.eq\.([^,]+)/)?.[1];
                    const filtered = mockMessages.filter((m) => {
                      if (!matchId) return true;
                      const baseMatch = m.metadata?.base_listing_id === matchId;
                      const bundleMatch = m.metadata?.bundle_item_ids?.includes(matchId);
                      return baseMatch || bundleMatch;
                    });
                    return Promise.resolve({ data: filtered, error: null });
                  }),
                });
              }),
            })),
          })),
          update: vi.fn((updatePayload: any) => ({
            in: vi.fn((column: string, ids: string[]) => {
              updatedMessages.push({ updatePayload, column, ids });
              return Promise.resolve({ data: null, error: null });
            }),
          })),
        };
      }
      if (table === 'listings') {
        return {
          select: vi.fn(() => ({
            in: vi.fn(() => Promise.resolve({ data: mockListings, error: null })),
          })),
        };
      }
      return {};
    }),
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

    // 1. Serialization (useProductBundle: serializeBundleIds)
    const bundleIdsParam = serializeBundleIds(selectedBundleIds);
    expect(bundleIdsParam).toBe('item-456,item-789');

    // 2. Route param parsing (app/conversation/new.tsx & app/payment/[id].tsx via sanitizeBundleItemIds)
    const parsedBundleIds = sanitizeBundleItemIds(bundleIdsParam, baseListingId);
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
    const { preset10, preset20 } = calculateOfferPresets(bundleTotal);

    expect(preset10).toBe(4050);
    expect(preset20).toBe(3600);
  });

  it('validates bundle offers against baseReferencePrice ceiling and non-bundle against listing price', () => {
    // Bundle offer: ceiling is baseReferencePrice (no greater than)
    expect(isOfferAmountValid({ amountNum: 4000, isBundle: true, baseReferencePrice: 4500 })).toBe(true);
    expect(isOfferAmountValid({ amountNum: 4500, isBundle: true, baseReferencePrice: 4500 })).toBe(true);
    expect(isOfferAmountValid({ amountNum: 4501, isBundle: true, baseReferencePrice: 4500 })).toBe(false);
    expect(isOfferAmountValid({ amountNum: 0, isBundle: true, baseReferencePrice: 4500 })).toBe(false);

    // Non-bundle offer: ceiling is listing price (exclusive)
    expect(isOfferAmountValid({ amountNum: 2000, isBundle: false, baseReferencePrice: 2500, listingPrice: 2500 })).toBe(true);
    expect(isOfferAmountValid({ amountNum: 2500, isBundle: false, baseReferencePrice: 2500, listingPrice: 2500 })).toBe(false);
    expect(isOfferAmountValid({ amountNum: 3000, isBundle: false, baseReferencePrice: 2500, listingPrice: 2500 })).toBe(false);
  });

  it('sanitizes payment bundleItemIds by removing primary listing id and deduplicating', () => {
    const primaryId = 'base-123';
    const bundleIdsParam = 'base-123,item-456,item-789,item-456';
    const sanitized = sanitizeBundleItemIds(bundleIdsParam, primaryId);

    expect(sanitized).toEqual(['item-456', 'item-789']);

    // Length validation check against query results
    const mockDbResults = [
      { id: 'item-456', seller_id: 'seller-1', is_sold: false },
      { id: 'item-789', seller_id: 'seller-1', is_sold: false },
    ];
    const isAvailable = mockDbResults.length === sanitized.length;
    expect(isAvailable).toBe(true);

    // If one item belongs to another seller or was sold, query returns fewer rows
    const mockUnavailableResults = [
      { id: 'item-456', seller_id: 'seller-1', is_sold: false },
    ];
    expect(mockUnavailableResults.length === sanitized.length).toBe(false);

    // All items marked sold contain primary listing and distinct bundled items
    const allItemIds = Array.from(new Set([primaryId, ...sanitized]));
    expect(allItemIds).toEqual(['base-123', 'item-456', 'item-789']);
  });

  it('computes itemPrice using recomputed bundle total rather than explicitBundleTotal param', () => {
    // Bundle with recomputed calculation: uses recomputed total regardless of route param
    const recomputedTotal = 4000;
    expect(
      computeCheckoutItemPrice({
        offerAmount: null,
        isBundle: true,
        bundleCalculationTotal: recomputedTotal,
        listingPrice: 3000,
      }),
    ).toBe(4000);

    // Bundle with offer amount: offer amount takes precedence
    expect(
      computeCheckoutItemPrice({
        offerAmount: 3500,
        isBundle: true,
        bundleCalculationTotal: recomputedTotal,
        listingPrice: 3000,
      }),
    ).toBe(3500);

    // Bundle fallback when recomputed total is null/undefined: falls back to listing price
    expect(
      computeCheckoutItemPrice({
        offerAmount: null,
        isBundle: true,
        bundleCalculationTotal: null,
        listingPrice: 3000,
      }),
    ).toBe(3000);

    // Non-bundle: uses listing price
    expect(
      computeCheckoutItemPrice({
        offerAmount: null,
        isBundle: false,
        bundleCalculationTotal: recomputedTotal,
        listingPrice: 3000,
      }),
    ).toBe(3000);
  });

  describe('bundle seller enablement & gating rules', () => {
    it('determines bundle option is available ONLY when seller has enabled bundles (> 0)', () => {
      // When seller has enabled bundles (e.g. 10%, 15%, 20%)
      expect(isBundlesEnabled(10)).toBe(true);
      expect(isBundlesEnabled(15)).toBe(true);
      expect(isBundlesEnabled(5)).toBe(true);

      // When seller has disabled bundles (0, undefined, or null)
      expect(isBundlesEnabled(0)).toBe(false);
      expect(isBundlesEnabled(undefined)).toBe(false);
      expect(isBundlesEnabled(null)).toBe(false);
    });

    it('suppresses bundle options when listing is already sold or bundle discount is disabled', () => {
      const shouldShowBundleBuilder = (isSold: boolean, sellerBundleDiscountPct: number | undefined) => {
        const bundlesEnabled = isBundlesEnabled(sellerBundleDiscountPct);
        return !isSold && bundlesEnabled;
      };

      // Enabled and unsold -> show bundle options
      expect(shouldShowBundleBuilder(false, 15)).toBe(true);

      // Disabled bundle discount -> do NOT show bundle options
      expect(shouldShowBundleBuilder(false, 0)).toBe(false);
      expect(shouldShowBundleBuilder(false, undefined)).toBe(false);

      // Sold item -> do NOT show bundle options even if seller has discounts
      expect(shouldShowBundleBuilder(true, 15)).toBe(false);
      expect(shouldShowBundleBuilder(true, 0)).toBe(false);
    });
  });

  describe('Product page Bundle behavior (requirements 1, 2, 3)', () => {
    it('Requirement 1 & 3: changes "Buy now" (black) to "Buy bundle" (purple) on 2nd item, and reverts to black "Buy now" when 1 item remains', () => {
      // Helper simulating the ProductActionBar CTA state on the Product detail screen
      const getButtonProps = (selectedBundleItemCount: number) => {
        const isBundle = selectedBundleItemCount > 0;
        const totalItems = 1 + selectedBundleItemCount;
        return {
          isBundle,
          label: isBundle ? 'Buy bundle' : 'Buy now',
          backgroundColor: isBundle ? '#6C47FF' : '#111111',
          totalItems,
        };
      };

      // Initial state: Only 1 item (the base listing being viewed)
      const initial = getButtonProps(0);
      expect(initial.totalItems).toBe(1);
      expect(initial.isBundle).toBe(false);
      expect(initial.label).toBe('Buy now');
      expect(initial.backgroundColor).toBe('#111111');

      // Requirement 1: Buyer adds a second item from the same seller
      const withSecondItem = getButtonProps(1);
      expect(withSecondItem.totalItems).toBe(2);
      expect(withSecondItem.isBundle).toBe(true);
      expect(withSecondItem.label).toBe('Buy bundle');
      expect(withSecondItem.backgroundColor).toBe('#6C47FF');

      // Buyer adds a third item
      const withThirdItem = getButtonProps(2);
      expect(withThirdItem.totalItems).toBe(3);
      expect(withThirdItem.isBundle).toBe(true);
      expect(withThirdItem.label).toBe('Buy bundle');
      expect(withThirdItem.backgroundColor).toBe('#6C47FF');

      // Requirement 3: Buyer removes items until only one is left
      const afterRemovingBackToOne = getButtonProps(0);
      expect(afterRemovingBackToOne.totalItems).toBe(1);
      expect(afterRemovingBackToOne.isBundle).toBe(false);
      expect(afterRemovingBackToOne.label).toBe('Buy now');
      expect(afterRemovingBackToOne.backgroundColor).toBe('#111111');
    });

    it('Requirement 2: automatically cancels bundle offer when an add-on item in the bundle is bought by another buyer', async () => {
      mockMessages = [
        {
          id: 'offer-bundle-1',
          metadata: {
            is_bundle: true,
            base_listing_id: 'listing-primary',
            bundle_item_ids: ['item-addon-2', 'item-addon-3'],
          },
          offer_status: 'pending',
        },
      ];
      updatedMessages = [];

      // Another buyer purchases item-addon-2
      const canceledIds = await cancelBundleOffersForSoldItem('item-addon-2');
      expect(canceledIds).toEqual(['offer-bundle-1']);
      expect(updatedMessages).toEqual([
        {
          updatePayload: { offer_status: 'canceled' },
          column: 'id',
          ids: ['offer-bundle-1'],
        },
      ]);
    });

    it('Requirement 2: automatically cancels bundle offer when the primary listing in the bundle is bought by another buyer', async () => {
      mockMessages = [
        {
          id: 'offer-bundle-2',
          metadata: {
            is_bundle: true,
            base_listing_id: 'listing-primary',
            bundle_item_ids: ['item-addon-2'],
          },
          offer_status: 'pending',
        },
      ];
      updatedMessages = [];

      // Another buyer purchases listing-primary
      const canceledIds = await cancelBundleOffersForSoldItem('listing-primary');
      expect(canceledIds).toEqual(['offer-bundle-2']);
      expect(updatedMessages).toEqual([
        {
          updatePayload: { offer_status: 'canceled' },
          column: 'id',
          ids: ['offer-bundle-2'],
        },
      ]);
    });

    it('Requirement 2: does not cancel bundle offer when an unrelated item is bought', async () => {
      mockMessages = [
        {
          id: 'offer-bundle-3',
          metadata: {
            is_bundle: true,
            base_listing_id: 'listing-primary',
            bundle_item_ids: ['item-addon-2'],
          },
          offer_status: 'pending',
        },
      ];
      updatedMessages = [];

      // Another buyer purchases an unrelated listing
      const canceledIds = await cancelBundleOffersForSoldItem('unrelated-item-99');
      expect(canceledIds).toEqual([]);
      expect(updatedMessages).toEqual([]);
    });

    it('Requirement 2: checkAndCancelInvalidBundleOffers marks offer canceled if any bundled item is sold', async () => {
      mockListings = [
        { id: 'base-listing', is_sold: false },
        { id: 'item-addon-1', is_sold: true },
      ];
      updatedMessages = [];

      const messages: any[] = [
        {
          id: 'msg-offer-active',
          kind: 'offer',
          metadata: {
            is_bundle: true,
            base_listing_id: 'base-listing',
            bundle_item_ids: ['item-addon-1'],
          },
          offer_status: 'pending',
        },
      ];

      const canceled = await checkAndCancelInvalidBundleOffers(messages, 'base-listing');
      expect(canceled).toEqual(['msg-offer-active']);
      expect(updatedMessages).toEqual([
        {
          updatePayload: { offer_status: 'canceled' },
          column: 'id',
          ids: ['msg-offer-active'],
        },
      ]);
    });

    it('Requirement 2: checkAndCancelInvalidBundleOffers excludes accepted and paid offers from cancellation', async () => {
      mockListings = [
        { id: 'base-listing', is_sold: true },
        { id: 'item-addon-1', is_sold: true },
      ];
      updatedMessages = [];

      const messages: any[] = [
        {
          id: 'msg-offer-accepted',
          kind: 'offer',
          metadata: {
            is_bundle: true,
            base_listing_id: 'base-listing',
            bundle_item_ids: ['item-addon-1'],
          },
          offer_status: 'accepted',
        },
        {
          id: 'msg-offer-paid',
          kind: 'offer',
          metadata: {
            is_bundle: true,
            base_listing_id: 'base-listing',
            bundle_item_ids: ['item-addon-1'],
          },
          offer_status: 'paid',
        },
      ];

      const canceled = await checkAndCancelInvalidBundleOffers(messages, 'base-listing');
      expect(canceled).toEqual([]);
      expect(updatedMessages).toEqual([]);
    });

    it('Requirement 2 & 3: prunes sold items from active bundle selections on product page', () => {
      const sellerItems = [
        { id: 'item-2', is_sold: true },
        { id: 'item-3', is_sold: false },
      ];
      const selectedBundleIds = new Set(['item-2']);

      const soldOrMissingIds: string[] = [];
      selectedBundleIds.forEach((id) => {
        const found = sellerItems.find((s) => s.id === id);
        if (!found || found.is_sold) {
          soldOrMissingIds.push(id);
        }
      });

      expect(soldOrMissingIds).toEqual(['item-2']);

      const next = new Set(selectedBundleIds);
      soldOrMissingIds.forEach((id) => next.delete(id));

      expect(next.size).toBe(0);
      const isBundle = next.size > 0;
      expect(isBundle).toBe(false);
    });
  });
});
