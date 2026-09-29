import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  Linking: { openURL: vi.fn() },
}));

import { fetchOrderForListing } from './payments';
import { supabase } from './supabase';

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(),
  },
}));

describe('lib/payments fetchOrderForListing dual-lookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockOrderData = {
    id: 'a0000000-0000-0000-0000-000000000001',
    listing_id: 'b0000000-0000-0000-0000-000000000002',
    buyer_id: 'c0000000-0000-0000-0000-000000000003',
    seller_id: 'd0000000-0000-0000-0000-000000000004',
    amount_cents: 50000,
    fee_cents: 2500,
    status: 'paid',
    order_seller_pickups: [{ pickup_address: { city: 'Lahore', line1: 'Main Blvd' } }],
    listing: [{ id: 'b0000000-0000-0000-0000-000000000002', title: 'Vintage Jacket', price: 500 }],
  };

  it('resolves directly by order UUID when an order UUID is passed', async () => {
    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: mockOrderData,
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    (supabase.from as any).mockReturnValue({
      select: selectMock,
    });

    const res = await fetchOrderForListing('a0000000-0000-0000-0000-000000000001');

    expect(supabase.from).toHaveBeenCalledWith('orders');
    expect(eqMock).toHaveBeenCalledWith('id', 'a0000000-0000-0000-0000-000000000001');
    expect(res).not.toBeNull();
    expect(res?.id).toBe('a0000000-0000-0000-0000-000000000001');
    expect(res?.seller_pickup_address).toEqual({ city: 'Lahore', line1: 'Main Blvd' });
    expect(res?.listing).toEqual({ id: 'b0000000-0000-0000-0000-000000000002', title: 'Vintage Jacket', price: 500 });
  });

  it('falls back to listing_id if direct UUID lookup yields no order', async () => {
    // 1st call for eq('id', ...) returns null
    const maybeSingleDirect = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const eqDirect = vi.fn().mockReturnValue({ maybeSingle: maybeSingleDirect });

    // 2nd call for eq('listing_id', ...) returns order
    const maybeSingleFallback = vi.fn().mockResolvedValue({
      data: mockOrderData,
      error: null,
    });
    const limitFallback = vi.fn().mockReturnValue({ maybeSingle: maybeSingleFallback });
    const orderFallback = vi.fn().mockReturnValue({ limit: limitFallback });
    const eqFallback = vi.fn().mockReturnValue({ order: orderFallback });

    const selectMock = vi.fn()
      .mockReturnValueOnce({ eq: eqDirect })
      .mockReturnValueOnce({ eq: eqFallback });

    (supabase.from as any).mockReturnValue({
      select: selectMock,
    });

    const res = await fetchOrderForListing('b0000000-0000-0000-0000-000000000002');

    expect(eqDirect).toHaveBeenCalledWith('id', 'b0000000-0000-0000-0000-000000000002');
    expect(eqFallback).toHaveBeenCalledWith('listing_id', 'b0000000-0000-0000-0000-000000000002');
    expect(res).not.toBeNull();
    expect(res?.listing_id).toBe('b0000000-0000-0000-0000-000000000002');
  });

  it('normalizes listing and pickup object when returned as non-arrays', async () => {
    const singleObjOrder = {
      ...mockOrderData,
      order_seller_pickups: { pickup_address: { city: 'Karachi' } },
      listing: { id: 'listing-1', title: 'Silk Scarf' },
    };

    const maybeSingleMock = vi.fn().mockResolvedValue({
      data: singleObjOrder,
      error: null,
    });
    const eqMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });

    (supabase.from as any).mockReturnValue({ select: selectMock });

    const res = await fetchOrderForListing('a0000000-0000-0000-0000-000000000001');

    expect(res?.seller_pickup_address).toEqual({ city: 'Karachi' });
    expect(res?.listing).toEqual({ id: 'listing-1', title: 'Silk Scarf' });
  });
});
