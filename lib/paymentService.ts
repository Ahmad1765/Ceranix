import { Platform } from 'react-native';
import { supabase } from '@/lib/supabase';
import { capture } from '@/lib/analytics';
import { BUYER_PROTECTION_FEE } from '@/lib/fees';
import {
  ShippingAddressSchema,
  type ValidatedShippingAddress,
} from '@/types/validation/order';
import type { Order, PaymentMethod, OrderStatus, FulfillmentStatus } from '@/types';

export interface CheckoutRequest {
  listingId: string;
  paymentMethod: PaymentMethod;
  buyerId?: string;
  sellerId?: string;
  listingPrice?: number;
  offerAmount?: number | null;
  shippingAddress?: unknown;
  deliveryNotes?: string | null;
  bundleItemIds?: string[];
}

export interface CheckoutResult {
  success: boolean;
  orderId?: string;
  order?: Order | null;
  paymentMethod: PaymentMethod;
  status: OrderStatus;
  redirectUrl?: string;
  clientSecret?: string;
  sessionId?: string;
  message?: string;
  error?: string;
}

export interface PaymentProvider {
  readonly id: PaymentMethod;
  processCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
}

export function isDemoMode(): boolean {
  return (
    process.env.EXPO_PUBLIC_DEMO_MODE === 'true' ||
    process.env.NODE_ENV === 'test'
  );
}

// ── Helper to normalize address shape for Zod validation ──────────────────────
export function normalizeAddressInput(input: any): any {
  if (!input || typeof input !== 'object') return null;
  return {
    recipientName: input.recipientName ?? input.recipient_name ?? '',
    phone: input.phone ?? '',
    line1: input.line1 ?? '',
    line2: input.line2 ?? null,
    city: input.city ?? '',
    state: input.state ?? '',
    postalCode: input.postalCode ?? input.postal_code ?? '',
    country: input.country ?? '',
    deliveryInstructions: input.deliveryInstructions ?? input.delivery_notes ?? null,
    coordinates: input.coordinates ?? null,
  };
}

export function toSnakeCaseAddress(addr: ValidatedShippingAddress | null | undefined): Record<string, any> | null {
  if (!addr) return null;
  return {
    recipient_name: addr.recipientName,
    phone: addr.phone,
    line1: addr.line1,
    line2: addr.line2 ?? null,
    city: addr.city,
    state: addr.state,
    postal_code: addr.postalCode,
    country: addr.country,
    delivery_notes: addr.deliveryInstructions ?? null,
    coordinates: addr.coordinates ?? null,
  };
}

// ── Cash on Delivery Provider ──────────────────────────────────────────────────
export class CodPaymentProvider implements PaymentProvider {
  readonly id = 'cod' as const;

  async processCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL && !isDemoMode()) {
      throw new Error('Supabase URL is not configured');
    }

    // 1. Strict Zod validation on shipping address before sending payload
    if (!request.shippingAddress) {
      throw new Error('Shipping address is required for Cash on Delivery');
    }

    const normalized = normalizeAddressInput(request.shippingAddress);
    const validatedAddress: ValidatedShippingAddress = ShippingAddressSchema.parse(normalized);

    // 2. Execute atomic Postgres RPC: process_checkout
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('process_checkout', {
        p_listing_id: request.listingId,
        p_buyer_id: request.buyerId ?? null,
        p_payment_method: 'cod',
        p_shipping_address: validatedAddress,
        p_offer_amount: request.offerAmount ?? null,
        p_delivery_notes: request.deliveryNotes?.trim() || validatedAddress.deliveryInstructions || null,
      });

      if (!error && data) {
        capture('checkout_completed', {
          listing_id: request.listingId,
          payment_method: 'cod',
          order_id: data.id,
          amount_cents: data.amount_cents,
        });

        if (request.bundleItemIds?.length) {
          for (const bundleId of request.bundleItemIds) {
            try {
              await supabase.rpc('process_checkout', {
                p_listing_id: bundleId,
                p_buyer_id: request.buyerId ?? null,
                p_payment_method: 'cod',
                p_shipping_address: validatedAddress,
                p_offer_amount: null,
                p_delivery_notes: request.deliveryNotes?.trim() || validatedAddress.deliveryInstructions || null,
              });
            } catch (err) {
              console.warn('[paymentService] cod bundled item checkout failed', bundleId, err);
            }
          }
        }

        return {
          success: true,
          orderId: data.id,
          order: data as Order,
          paymentMethod: 'cod',
          status: 'pending',
          message: 'Cash on delivery order placed successfully',
        };
      }

      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      if (rpcError) throw rpcError;
      throw new Error('Checkout failed: could not create order');
    }

    // 3. Demo / Mock fallback (when running in demo mode)
    const itemPrice = request.offerAmount ?? request.listingPrice ?? 1000;
    const amountCents = Math.round(itemPrice * 100);
    const feeCents = Math.round(BUYER_PROTECTION_FEE * 100);
    const mockOrderId = `cod_mock_${Date.now()}`;

    const mockOrder: Order = {
      id: mockOrderId,
      listing_id: request.listingId,
      buyer_id: request.buyerId ?? 'mock-buyer',
      seller_id: request.sellerId ?? 'mock-seller',
      amount_cents: amountCents,
      fee_cents: feeCents,
      currency: 'pkr',
      stripe_session_id: null,
      stripe_payment_intent: null,
      offer_message_id: null,
      payment_method: 'cod',
      status: 'pending',
      shipping_address: validatedAddress,
      delivery_notes: request.deliveryNotes ?? validatedAddress.deliveryInstructions ?? null,
      created_at: new Date().toISOString(),
    };

    capture('checkout_completed', {
      listing_id: request.listingId,
      payment_method: 'cod',
      order_id: mockOrderId,
      amount_cents: amountCents,
      demo_mode: true,
    });

    return {
      success: true,
      orderId: mockOrderId,
      order: mockOrder,
      paymentMethod: 'cod',
      status: 'pending',
      message: 'Demo Cash on Delivery order placed successfully',
    };
  }
}

// ── Stripe Payment Gateway (Mock / Live drop-in) ───────────────────────────────
const PK = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';
export const STRIPE_ENABLED = PK.startsWith('pk_test_') || PK.startsWith('pk_live_');

export class StripePaymentProvider implements PaymentProvider {
  readonly id = 'card' as const;

  async processCheckout(request: CheckoutRequest): Promise<CheckoutResult> {
    const itemPrice = request.offerAmount ?? request.listingPrice ?? 1000;
    const amountCents = Math.round(itemPrice * 100);
    const feeCents = Math.round(BUYER_PROTECTION_FEE * 100);

    // If Stripe is live and configured, invoke edge function for Checkout session
    if (STRIPE_ENABLED) {
      const returnUrl = this.buildReturnUrl(request.listingId);
      const { data, error } = await supabase.functions.invoke<{ url: string; sessionId: string }>(
        'create-checkout-session',
        {
          body: {
            listing_id: request.listingId,
            return_url: returnUrl,
            offer_amount: request.offerAmount ?? undefined,
          },
        },
      );

      if (error) throw new Error(error.message);
      if (!data?.url) throw new Error('No checkout URL returned from Stripe');

      return {
        success: true,
        sessionId: data.sessionId,
        redirectUrl: data.url,
        paymentMethod: 'card',
        status: 'pending',
      };
    }

    if (!isDemoMode()) {
      throw new Error('Card payments are not configured and demo mode is disabled');
    }

    // Mock Stripe Payment Sheet / PaymentIntent simulation
    await new Promise((resolve) => setTimeout(resolve, 600));

    // Try executing atomic process_checkout on backend for card
    let backendOrder: Order | null = null;
    let cardRpcError: Error | null = null;
    let validatedAddress: ValidatedShippingAddress | null = null;
    try {
      const normalized = request.shippingAddress ? normalizeAddressInput(request.shippingAddress) : null;
      validatedAddress = normalized ? ShippingAddressSchema.parse(normalized) : null;

      const { data, error } = await supabase.rpc('process_checkout', {
        p_listing_id: request.listingId,
        p_buyer_id: request.buyerId ?? null,
        p_payment_method: 'card',
        p_shipping_address: validatedAddress,
        p_offer_amount: request.offerAmount ?? null,
        p_delivery_notes: request.deliveryNotes?.trim() || null,
      });

      if (!error && data) {
        backendOrder = data as Order;
        if (request.bundleItemIds?.length) {
          for (const bundleId of request.bundleItemIds) {
            try {
              await supabase.rpc('process_checkout', {
                p_listing_id: bundleId,
                p_buyer_id: request.buyerId ?? null,
                p_payment_method: 'card',
                p_shipping_address: validatedAddress,
                p_offer_amount: null,
                p_delivery_notes: request.deliveryNotes?.trim() || null,
              });
            } catch (err) {
              console.warn('[paymentService] card bundled item checkout failed', bundleId, err);
            }
          }
        }
      } else if (error) {
        cardRpcError = new Error(error.message);
      }
    } catch (e: any) {
      cardRpcError = e instanceof Error ? e : new Error(String(e));
    }

    if (!backendOrder && !isDemoMode()) {
      if (cardRpcError) throw cardRpcError;
      throw new Error('Checkout failed: could not create order');
    }

    const mockSessionId = backendOrder?.stripe_session_id || `cs_test_mock_${Date.now()}`;
    const mockPaymentIntent = backendOrder?.stripe_payment_intent || `pi_test_mock_${Date.now()}`;
    const mockOrderId = backendOrder?.id || `order_mock_${Date.now()}`;

    const mockOrder: Order = backendOrder || {
      id: mockOrderId,
      listing_id: request.listingId,
      buyer_id: request.buyerId ?? 'mock-buyer',
      seller_id: request.sellerId ?? 'mock-seller',
      amount_cents: amountCents,
      fee_cents: feeCents,
      currency: 'pkr',
      stripe_session_id: mockSessionId,
      stripe_payment_intent: mockPaymentIntent,
      offer_message_id: null,
      payment_method: 'card',
      status: 'paid',
      shipping_address: validatedAddress,
      delivery_notes: request.deliveryNotes ?? null,
      created_at: new Date().toISOString(),
    };

    const isDemo = !backendOrder;
    const finalAmountCents = backendOrder ? backendOrder.amount_cents : amountCents;

    capture('checkout_completed', {
      listing_id: request.listingId,
      payment_method: 'card',
      order_id: mockOrderId,
      amount_cents: finalAmountCents,
      demo_mode: isDemo,
    });

    const status = (backendOrder?.status as any) || 'paid';

    return {
      success: true,
      orderId: mockOrderId,
      order: mockOrder,
      sessionId: mockSessionId,
      clientSecret: `${mockPaymentIntent}_secret_test`,
      paymentMethod: 'card',
      status,
      message: isDemo
        ? 'Demo Card payment processed successfully'
        : 'Card payment processed successfully',
    };
  }

  private buildReturnUrl(listingId: string): string {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      return `${window.location.origin}/invoice/${listingId}?paid=1`;
    }
    return `carrinex://invoice/${listingId}?paid=1`;
  }
}

type OrderUpdateListener = (listingId?: string | null) => void;
const orderUpdateListeners = new Set<OrderUpdateListener>();

export function onOrderUpdated(listener: OrderUpdateListener): () => void {
  orderUpdateListeners.add(listener);
  return () => {
    orderUpdateListeners.delete(listener);
  };
}

export function notifyOrderUpdated(listingId?: string | null): void {
  orderUpdateListeners.forEach((listener) => {
    try {
      listener(listingId);
    } catch {
      // Non-fatal subscriber error
    }
  });
}

// ── Payment Service Registry & Dispatcher ──────────────────────────────────────
export class PaymentService {
  private providers = new Map<PaymentMethod, PaymentProvider>();

  constructor() {
    this.registerProvider(new CodPaymentProvider());
    this.registerProvider(new StripePaymentProvider());
  }

  registerProvider(provider: PaymentProvider) {
    this.providers.set(provider.id, provider);
  }

  getProvider(method: PaymentMethod): PaymentProvider {
    const provider = this.providers.get(method);
    if (!provider) {
      throw new Error(`Unsupported payment method: ${method}`);
    }
    return provider;
  }

  async checkout(request: CheckoutRequest): Promise<CheckoutResult> {
    const provider = this.getProvider(request.paymentMethod);
    const result = await provider.processCheckout(request);
    if (result.success) {
      notifyOrderUpdated(request.listingId);
    }
    return result;
  }

  /**
   * Cancel an order (buyer or seller) and relist the item.
   */
  async cancelOrder({
    orderId,
    listingId,
    reason = 'Buyer requested cancellation',
  }: {
    orderId: string;
    listingId?: string;
    reason?: string;
  }): Promise<Order> {
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('cancel_order', {
        p_order_id: orderId,
        p_reason: reason,
      });

      if (!error && data) {
        capture('order_cancelled', { order_id: orderId, reason });
        notifyOrderUpdated(listingId ?? (data as Order)?.listing_id);
        return data as Order;
      }
      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    // Direct fallback: update orders row + listings row
    let fallbackError: Error | null = null;
    try {
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'canceled',
          cancel_reason: reason,
        })
        .eq('id', orderId)
        .select()
        .maybeSingle();

      if (updateError) {
        fallbackError = new Error(updateError.message);
      } else if (updatedOrder) {
        if (listingId) {
          const { error: listingError } = await supabase
            .from('listings')
            .update({ is_sold: false })
            .eq('id', listingId);
          if (listingError) {
            fallbackError = new Error(listingError.message);
          }
        }
        if (!fallbackError) {
          capture('order_cancelled', { order_id: orderId, reason, fallback: true });
          notifyOrderUpdated(listingId ?? (updatedOrder as Order)?.listing_id);
          return updatedOrder as Order;
        }
      }
    } catch (e: any) {
      fallbackError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      throw fallbackError || rpcError || new Error('Failed to cancel order');
    }

    capture('order_cancelled', { order_id: orderId, reason, demo_mode: true });
    return {
      id: orderId,
      listing_id: listingId,
      status: 'canceled',
      amount_cents: 0,
      fee_cents: 0,
      currency: 'pkr',
      created_at: new Date().toISOString(),
    } as Order;
  }

  /**
   * Seller action to mark order as shipped with tracking.
   */
  async markOrderShipped({
    orderId,
    courier = 'Standard Delivery',
    trackingNumber = '',
  }: {
    orderId: string;
    courier?: string;
    trackingNumber?: string;
  }): Promise<Order> {
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('mark_order_shipped', {
        p_order_id: orderId,
        p_courier: courier,
        p_tracking_number: trackingNumber,
      });

      if (!error && data) {
        capture('order_shipped', { order_id: orderId, courier, tracking_number: trackingNumber });
        return data as Order;
      }
      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    // Direct fallback
    let fallbackError: Error | null = null;
    try {
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          courier_name: courier,
          tracking_number: trackingNumber,
          shipped_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .select()
        .maybeSingle();

      if (updateError) {
        fallbackError = new Error(updateError.message);
      } else if (updatedOrder) {
        capture('order_shipped', { order_id: orderId, courier, tracking_number: trackingNumber, fallback: true });
        return updatedOrder as Order;
      }
    } catch (e: any) {
      fallbackError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      throw fallbackError || rpcError || new Error('Failed to mark order as shipped');
    }

    return {
      id: orderId,
      status: 'paid',
      amount_cents: 0,
      fee_cents: 0,
      currency: 'pkr',
      created_at: new Date().toISOString(),
    } as Order;
  }

  /**
   * Buyer action to confirm receipt and complete order.
   */
  async confirmOrderReceived({ orderId }: { orderId: string }): Promise<Order> {
    let rpcError: Error | null = null;
    try {
      const { data, error } = await supabase.rpc('confirm_order_received', {
        p_order_id: orderId,
      });

      if (!error && data) {
        capture('order_completed_by_buyer', { order_id: orderId });
        notifyOrderUpdated((data as Order)?.listing_id);
        return data as Order;
      }
      if (error) {
        rpcError = new Error(error.message);
      }
    } catch (e: any) {
      rpcError = e instanceof Error ? e : new Error(String(e));
    }

    // Direct fallback
    let fallbackError: Error | null = null;
    try {
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', orderId)
        .select()
        .maybeSingle();

      if (updateError) {
        fallbackError = new Error(updateError.message);
      } else if (updatedOrder) {
        capture('order_completed_by_buyer', { order_id: orderId, fallback: true });
        notifyOrderUpdated((updatedOrder as Order)?.listing_id);
        return updatedOrder as Order;
      }
    } catch (e: any) {
      fallbackError = e instanceof Error ? e : new Error(String(e));
    }

    if (!isDemoMode()) {
      throw fallbackError || rpcError || new Error('Failed to confirm order received');
    }

    return {
      id: orderId,
      status: 'completed',
      amount_cents: 0,
      fee_cents: 0,
      currency: 'pkr',
      created_at: new Date().toISOString(),
    } as Order;
  }

  /**
   * Seller action to mark a Cash on Delivery order as collected and paid.
   */
  async markCodOrderPaid(orderId: string): Promise<Order> {
    const { data, error } = await supabase.rpc('complete_cod_order', {
      p_order_id: orderId,
    });

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      // Fallback for mock demo mode only when RPC is unavailable
      capture('cod_order_completed', { order_id: orderId, demo_mode: true });
      return {
        id: orderId,
        listing_id: 'mock-listing',
        buyer_id: 'mock-buyer',
        seller_id: 'mock-seller',
        amount_cents: 100000,
        fee_cents: Math.round(BUYER_PROTECTION_FEE * 100),
        currency: 'pkr',
        payment_method: 'cod',
        status: 'paid',
        fulfillment_status: 'completed',
        created_at: new Date().toISOString(),
      };
    }

    if (data) {
      capture('cod_order_completed', { order_id: orderId });
      notifyOrderUpdated((data as Order)?.listing_id);
      return data as Order;
    }

    throw new Error('Failed to complete order');
  }

  /**
   * Advance order through the fulfillment pipeline (Pending -> Packing -> Shifting -> Delivered/Completed).
   * Strictly enforces caller authorization (seller vs buyer) and state machine invariants.
   */
  async advanceOrderFulfillment({
    orderId,
    targetStatus,
    courier,
    trackingNumber,
    supplierOrderId,
    supplierName,
  }: {
    orderId: string;
    targetStatus: FulfillmentStatus;
    courier?: string;
    trackingNumber?: string;
    supplierOrderId?: string;
    supplierName?: string;
  }): Promise<Order> {
    const { data, error } = await supabase.rpc('advance_order_fulfillment', {
      p_order_id: orderId,
      p_target_status: targetStatus,
      p_courier: courier?.trim() || null,
      p_tracking_number: trackingNumber?.trim() || null,
      p_supplier_order_id: supplierOrderId?.trim() || null,
      p_supplier_name: supplierName?.trim() || null,
    });

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      // Demo fallback
      capture('fulfillment_advanced_demo', { order_id: orderId, target_status: targetStatus });
      return {
        id: orderId,
        status: targetStatus === 'completed' ? 'completed' : 'paid',
        fulfillment_status: targetStatus,
        courier_name: courier,
        tracking_number: trackingNumber,
        supplier_order_id: supplierOrderId,
        supplier_name: supplierName,
        amount_cents: 0,
        fee_cents: 0,
        currency: 'pkr',
        created_at: new Date().toISOString(),
      } as Order;
    }

    capture('fulfillment_advanced', { order_id: orderId, target_status: targetStatus });
    notifyOrderUpdated((data as Order)?.listing_id);
    return data as Order;
  }

  /**
   * Buyer Protection: Open a dispute for damaged, defective, or lost goods.
   */
  async openOrderDispute({
    orderId,
    reason,
    evidenceUrls = [],
  }: {
    orderId: string;
    reason: string;
    evidenceUrls?: string[];
  }): Promise<Order> {
    const { data, error } = await supabase.rpc('open_order_dispute', {
      p_order_id: orderId,
      p_reason: reason.trim(),
      p_evidence_urls: evidenceUrls,
    });

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      capture('order_disputed_demo', { order_id: orderId, reason });
      return {
        id: orderId,
        status: 'disputed',
        fulfillment_status: 'disputed',
        dispute_reason: reason,
        dispute_evidence_urls: evidenceUrls,
        amount_cents: 0,
        fee_cents: 0,
        currency: 'pkr',
        created_at: new Date().toISOString(),
      } as Order;
    }

    capture('order_disputed', { order_id: orderId, reason });
    notifyOrderUpdated((data as Order)?.listing_id);
    return data as Order;
  }

  /**
   * Confirm Stripe payment authorization and advance order to pending fulfillment.
   */
  async confirmPaymentAuthorization({
    orderId,
    stripeEventId,
    paymentIntent,
  }: {
    orderId: string;
    stripeEventId: string;
    paymentIntent?: string;
  }): Promise<Order> {
    const { data, error } = await supabase.rpc('confirm_order_payment_authorization', {
      p_order_id: orderId,
      p_stripe_event_id: stripeEventId,
      p_payment_intent: paymentIntent || null,
    });

    if (error) {
      if (!isDemoMode()) throw new Error(error.message);
      return {
        id: orderId,
        status: 'paid',
        fulfillment_status: 'pending',
        amount_cents: 0,
        fee_cents: 0,
        currency: 'pkr',
        created_at: new Date().toISOString(),
      } as Order;
    }

    return data as Order;
  }
}

export const paymentService = new PaymentService();
