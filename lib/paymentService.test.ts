import { describe, it, expect, vi } from 'vitest';
import {
  paymentService,
  CodPaymentProvider,
  StripePaymentProvider,
} from '@/lib/paymentService';
import { ShippingAddressSchema } from '@/types/validation/order';

vi.mock('react-native', () => ({
  Platform: { OS: 'web' },
  NativeModules: {},
}));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: { message: 'function not found' } }),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

vi.mock('@/lib/analytics', () => ({
  capture: vi.fn(),
}));

describe('ShippingAddressSchema (Zod Strict Validation)', () => {
  const validAddress = {
    recipientName: 'Muhammad Ahmad',
    phone: '03254864702',
    line1: 'E-381 Block C Nishat Colony',
    line2: 'Flat 3B',
    city: 'Lahore',
    state: 'Punjab',
    postalCode: '54000',
    country: 'Pakistan',
    deliveryInstructions: 'Ring doorbell twice',
    coordinates: { lat: 31.5204, lng: 74.3587 },
  };

  it('validates a complete address with optional coordinates and delivery instructions', () => {
    const result = ShippingAddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.coordinates?.lat).toBe(31.5204);
      expect(result.data.deliveryInstructions).toBe('Ring doorbell twice');
    }
  });

  it('allows optional line2, deliveryInstructions, and coordinates to be null or omitted', () => {
    const minimal = {
      recipientName: 'Jane Doe',
      phone: '03001234567',
      line1: '456 Main Street',
      city: 'Karachi',
      state: 'Sindh',
      postalCode: '75000',
      country: 'Pakistan',
    };
    const result = ShippingAddressSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line2).toBeNull();
      expect(result.data.coordinates).toBeNull();
    }
  });

  it('parses successfully when line2, deliveryInstructions, and coordinates are explicitly null', () => {
    const withNulls = {
      recipientName: 'Null Test User',
      phone: '03009876543',
      line1: '789 Null Street',
      city: 'Lahore',
      state: 'Punjab',
      postalCode: '54000',
      country: 'Pakistan',
      line2: null,
      deliveryInstructions: null,
      coordinates: null,
    };
    const result = ShippingAddressSchema.safeParse(withNulls);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.line2).toBeNull();
      expect(result.data.deliveryInstructions).toBeNull();
      expect(result.data.coordinates).toBeNull();
    }
  });

  it('rejects missing or short recipient name', () => {
    const invalid = { ...validAddress, recipientName: 'A' };
    expect(ShippingAddressSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects invalid coordinates outside bounds', () => {
    const invalid = { ...validAddress, coordinates: { lat: 95, lng: 74 } };
    expect(ShippingAddressSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects short phone number', () => {
    const invalid = { ...validAddress, phone: '123' };
    expect(ShippingAddressSchema.safeParse(invalid).success).toBe(false);
  });
});

describe('CodPaymentProvider (Atomic RPC integration)', () => {
  const provider = new CodPaymentProvider();
  const validAddress = {
    recipient_name: 'Ahmed Khan',
    phone: '03211234567',
    line1: 'House 12, Street 5',
    city: 'Islamabad',
    state: 'Islamabad',
    postal_code: '44000',
    country: 'Pakistan',
  };

  it('throws error if shipping address is absent for CoD', async () => {
    await expect(
      provider.processCheckout({
        listingId: '11111111-1111-1111-1111-111111111111',
        paymentMethod: 'cod',
        listingPrice: 2500,
        shippingAddress: null,
      }),
    ).rejects.toThrow('Shipping address is required for Cash on Delivery');
  });

  it('successfully executes CoD order creation in demo/fallback mode', async () => {
    const result = await provider.processCheckout({
      listingId: '11111111-1111-1111-1111-111111111111',
      paymentMethod: 'cod',
      listingPrice: 2500,
      buyerId: 'buyer-uuid',
      sellerId: 'seller-uuid',
      shippingAddress: validAddress,
      deliveryNotes: 'Leave with guard',
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('cod');
    expect(result.status).toBe('pending');
    expect(result.order?.payment_method).toBe('cod');
    expect(result.order?.status).toBe('pending');
  });
});

describe('StripePaymentProvider (PCI-Compliant Mock / Gateway)', () => {
  const provider = new StripePaymentProvider();

  it('processes card checkout and simulates instant paid state in demo mode', async () => {
    const result = await provider.processCheckout({
      listingId: '22222222-2222-2222-2222-222222222222',
      paymentMethod: 'card',
      listingPrice: 4500,
      buyerId: 'buyer-uuid',
      sellerId: 'seller-uuid',
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('card');
    expect(result.status).toBe('paid');
    expect(result.sessionId).toBeDefined();
    expect(result.clientSecret).toBeDefined();
  });
});

describe('PaymentService Dispatcher & Seller Completion', () => {
  it('dispatches to CoD provider when paymentMethod is cod', async () => {
    const result = await paymentService.checkout({
      listingId: '33333333-3333-3333-3333-333333333333',
      paymentMethod: 'cod',
      listingPrice: 1800,
      shippingAddress: {
        recipient_name: 'Sara Ali',
        phone: '03009876543',
        line1: 'Block A, DHA',
        city: 'Lahore',
        state: 'Punjab',
        postal_code: '54000',
        country: 'Pakistan',
      },
    });

    expect(result.success).toBe(true);
    expect(result.paymentMethod).toBe('cod');
    expect(result.status).toBe('pending');
  });

  it('allows seller to mark CoD order as collected and paid', async () => {
    const updated = await paymentService.markCodOrderPaid('order-cod-456');
    expect(updated.status).toBe('paid');
    expect(updated.payment_method).toBe('cod');
  });

  it('handles cancelOrder in demo mode', async () => {
    const cancelled = await paymentService.cancelOrder({
      orderId: 'order-cancel-123',
      listingId: 'listing-123',
      reason: 'Buyer changed mind',
    });
    expect(cancelled.status).toBe('canceled');
    expect(cancelled.id).toBe('order-cancel-123');
  });

  it('handles markOrderShipped in demo mode', async () => {
    const shipped = await paymentService.markOrderShipped({
      orderId: 'order-ship-123',
      courier: 'TCS',
      trackingNumber: 'TCS123456',
    });
    expect(shipped.status).toBe('paid');
    expect(shipped.id).toBe('order-ship-123');
  });

  it('handles confirmOrderReceived in demo mode', async () => {
    const received = await paymentService.confirmOrderReceived({
      orderId: 'order-recv-123',
    });
    expect(received.status).toBe('completed');
    expect(received.id).toBe('order-recv-123');
  });
});

