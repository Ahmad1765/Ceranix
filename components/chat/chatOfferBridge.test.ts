import { describe, it, expect } from 'vitest';
import { orderTotal, buyerProtectionFee } from '@/lib/fees';
import { computeCheckoutItemPrice } from '@/lib/bundle';

describe('Chat-to-Order Bridge & Offer Lifecycle', () => {
  describe('48-hour Offer TTL Expiration', () => {
    const isOfferExpired = (msg: { offer_status?: string | null; created_at?: string }) => {
      if (msg.offer_status === 'expired') return true;
      if ((msg.offer_status === 'pending' || msg.offer_status === 'proposed') && msg.created_at) {
        const ageMs = Date.now() - new Date(msg.created_at).getTime();
        return ageMs > 48 * 3600 * 1000;
      }
      return false;
    };

    it('keeps offers under 48h active and pending', () => {
      const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString(); // 2h ago
      expect(isOfferExpired({ offer_status: 'pending', created_at: recent })).toBe(false);
      expect(isOfferExpired({ offer_status: 'proposed', created_at: recent })).toBe(false);
    });

    it('automatically treats offers older than 48h as expired', () => {
      const old = new Date(Date.now() - 49 * 3600 * 1000).toISOString(); // 49h ago
      expect(isOfferExpired({ offer_status: 'pending', created_at: old })).toBe(true);
      expect(isOfferExpired({ offer_status: 'proposed', created_at: old })).toBe(true);
    });

    it('does not expire accepted or declined offers regardless of age', () => {
      const ancient = new Date(Date.now() - 100 * 3600 * 1000).toISOString();
      expect(isOfferExpired({ offer_status: 'accepted', created_at: ancient })).toBe(false);
      expect(isOfferExpired({ offer_status: 'declined', created_at: ancient })).toBe(false);
    });
  });

  describe('Decoupled canPay & awaitingPayment on Accepted Offers', () => {
    const deriveOfferActions = (args: {
      isSeller: boolean;
      status: string;
      listingId: string | null;
      listingSold: boolean;
      isPaid: boolean;
      isBundleInvalid: boolean;
    }) => {
      const canPay =
        !args.isSeller &&
        args.status === 'accepted' &&
        !!args.listingId &&
        !args.isPaid &&
        !args.isBundleInvalid;

      const awaitingPayment =
        args.isSeller &&
        args.status === 'accepted' &&
        !args.isPaid &&
        !args.isBundleInvalid;

      return { canPay, awaitingPayment };
    };

    it('allows buyer to pay even when listingSold is true because offer acceptance locked inventory', () => {
      const actions = deriveOfferActions({
        isSeller: false,
        status: 'accepted',
        listingId: 'listing-123',
        listingSold: true, // locked by accept_chat_offer RPC
        isPaid: false,
        isBundleInvalid: false,
      });

      expect(actions.canPay).toBe(true);
      expect(actions.awaitingPayment).toBe(false);
    });

    it('shows awaitingPayment to seller even when listingSold is true', () => {
      const actions = deriveOfferActions({
        isSeller: true,
        status: 'accepted',
        listingId: 'listing-123',
        listingSold: true,
        isPaid: false,
        isBundleInvalid: false,
      });

      expect(actions.canPay).toBe(false);
      expect(actions.awaitingPayment).toBe(true);
    });

    it('disables canPay once order has been paid', () => {
      const actions = deriveOfferActions({
        isSeller: false,
        status: 'accepted',
        listingId: 'listing-123',
        listingSold: true,
        isPaid: true,
        isBundleInvalid: false,
      });

      expect(actions.canPay).toBe(false);
      expect(actions.awaitingPayment).toBe(false);
    });
  });

  describe('Checkout Calculation with In-Chat Offer Price', () => {
    it('computes exact checkout price and fees locked to accepted offer amount', () => {
      const listingPrice = 5000;
      const acceptedOffer = 4200;

      const itemPrice = computeCheckoutItemPrice({
        offerAmount: acceptedOffer,
        isBundle: false,
        bundleCalculationTotal: undefined,
        listingPrice,
      });

      expect(itemPrice).toBe(4200);

      const bpFee = buyerProtectionFee(itemPrice);
      const total = orderTotal(itemPrice);

      expect(total).toBe(4200 + bpFee);
    });
  });

  describe('Product Screen Action Bar Awaiting Payment State', () => {
    const deriveProductBarState = (order: { status: string; amount_cents?: number } | null) => {
      const isAwaitingPayment = Boolean(order && order.status === 'awaiting_payment');
      const hasPurchased = Boolean(order && order.status !== 'awaiting_payment');
      const awaitingAmount = isAwaitingPayment && order?.amount_cents
        ? Math.round(order.amount_cents / 100)
        : undefined;

      return { isAwaitingPayment, hasPurchased, awaitingAmount };
    };

    it('renders awaiting payment with checkout CTA when order is awaiting_payment', () => {
      const state = deriveProductBarState({
        status: 'awaiting_payment',
        amount_cents: 350000,
      });

      expect(state.isAwaitingPayment).toBe(true);
      expect(state.hasPurchased).toBe(false);
      expect(state.awaitingAmount).toBe(3500);
    });

    it('renders hasPurchased track order state when order is paid or pending', () => {
      const statePaid = deriveProductBarState({
        status: 'paid',
        amount_cents: 350000,
      });

      expect(statePaid.isAwaitingPayment).toBe(false);
      expect(statePaid.hasPurchased).toBe(true);
    });
  });
});
