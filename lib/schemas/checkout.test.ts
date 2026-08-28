import { describe, it, expect } from 'vitest';
import { CheckoutFormSchema, ShippingAddressSchema } from './checkout';

describe('CheckoutFormSchema', () => {
  it('validates valid fulfillment and payment methods', () => {
    const result = CheckoutFormSchema.safeParse({
      fulfillment: 'delivery',
      paymentMethod: 'cod',
    });
    expect(result.success).toBe(true);
  });

  it('fails on invalid fulfillment method', () => {
    const result = CheckoutFormSchema.safeParse({
      fulfillment: 'drone',
      paymentMethod: 'cod',
    });
    expect(result.success).toBe(false);
  });

  it('fails on invalid payment method', () => {
    const result = CheckoutFormSchema.safeParse({
      fulfillment: 'handshake',
      paymentMethod: 'crypto',
    });
    expect(result.success).toBe(false);
  });
});

describe('ShippingAddressSchema', () => {
  const validAddress = {
    recipientName: 'Sarah Jenkins',
    phone: '+1 555-0199',
    line1: '123 Market Street, Apt 4B',
    city: 'San Francisco',
    state: 'CA',
    postalCode: '94105',
    country: 'United States',
  };

  it('validates a complete valid shipping address', () => {
    const result = ShippingAddressSchema.safeParse(validAddress);
    expect(result.success).toBe(true);
  });

  it('fails on short recipient name', () => {
    const result = ShippingAddressSchema.safeParse({
      ...validAddress,
      recipientName: 'J',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('at least 2 characters');
    }
  });

  it('fails on empty required address fields', () => {
    const result = ShippingAddressSchema.safeParse({
      ...validAddress,
      line1: '  ',
      city: ' ',
      postalCode: '',
    });
    expect(result.success).toBe(false);
  });
});
