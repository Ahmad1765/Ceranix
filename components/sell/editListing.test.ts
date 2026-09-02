import { describe, it, expect, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { listingToSellFormValues, patchListingInCache } from './editHelpers';
import { qk } from '@/lib/queries/keys';
import type { Listing } from '@/types';

vi.mock('@/lib/queryClient', () => ({
  queryClient: {
    setQueryData: vi.fn(),
    setQueriesData: vi.fn(),
    invalidateQueries: vi.fn(),
    getQueryData: vi.fn(),
  },
}));

describe('listingToSellFormValues', () => {
  it('returns default empty values when no listing is provided', () => {
    const values = listingToSellFormValues(null);
    expect(values.title).toBe('');
    expect(values.price).toBe('');
    expect(values.slots).toEqual([]);
    expect(values.condition).toBe('good');
    expect(values.category).toBe('clothing');
    expect(values.gender).toBe('women');
  });

  it('correctly maps a full existing listing into form values and photo slots', () => {
    const mockListing: Listing = {
      id: 'listing-123',
      seller_id: 'user-456',
      seller: {
        id: 'user-456',
        username: 'testuser',
        avatar_url: null,
        full_name: 'Test User',
        bio: null,
        location: null,
        rating: 5,
        total_sales: 10,
        created_at: '2026-01-01T00:00:00Z',
      },
      title: 'Vintage Leather Jacket',
      description: 'Genuine leather, like new condition.',
      price: 15000,
      category: 'clothing',
      subcategory: 'jackets_coats',
      brand: 'Zara',
      size: 'L',
      condition: 'like_new',
      color: 'black',
      gender: 'men',
      parcel_size: 'medium',
      images: [
        'https://example.com/storage/listing-images/img1.jpg',
        'https://example.com/storage/listing-images/img2.jpg',
      ],
      thumbnails: [
        'https://example.com/storage/listing-images/img1_thumb.jpg',
        'https://example.com/storage/listing-images/img2_thumb.jpg',
      ],
      tags: ['leather', 'vintage', 'winter'],
      is_sold: false,
      views: 120,
      likes: 15,
      created_at: '2026-02-01T00:00:00Z',
    };

    const values = listingToSellFormValues(mockListing);

    expect(values.title).toBe('Vintage Leather Jacket');
    expect(values.description).toBe('Genuine leather, like new condition.');
    expect(values.price).toBe('15000');
    expect(values.category).toBe('clothing');
    expect(values.subcategory).toBe('jackets_coats');
    expect(values.brand).toBe('Zara');
    expect(values.size).toBe('L');
    expect(values.condition).toBe('like_new');
    expect(values.color).toBe('black');
    expect(values.gender).toBe('men');
    expect(values.parcelSize).toBe('medium');
    expect(values.tags).toEqual(['leather', 'vintage', 'winter']);

    expect(values.slots).toHaveLength(2);
    const [slot0, slot1] = values.slots as NonNullable<(typeof values.slots)[number]>[];
    expect(slot0?.original?.uri).toBe('https://example.com/storage/listing-images/img1.jpg');
    expect(slot0?.status).toBe('done');
    expect(slot1?.original?.uri).toBe('https://example.com/storage/listing-images/img2.jpg');
    expect(slot1?.status).toBe('done');
  });

  it('handles null optional fields gracefully', () => {
    const minimalListing: Listing = {
      id: 'listing-999',
      seller_id: 'user-456',
      seller: {} as any,
      title: 'Simple Tee',
      description: '',
      price: 2500,
      category: 'clothing',
      gender: 'unisex',
      condition: 'good',
      images: null,
      is_sold: false,
      views: 0,
      likes: 0,
      created_at: '2026-03-01T00:00:00Z',
      brand: null,
      size: null,
      color: null,
      subcategory: null,
      parcel_size: null,
      tags: undefined,
    };

    const values = listingToSellFormValues(minimalListing);

    expect(values.title).toBe('Simple Tee');
    expect(values.price).toBe('2500');
    expect(values.brand).toBe('');
    expect(values.size).toBe('');
    expect(values.color).toBeNull();
    expect(values.subcategory).toBeNull();
    expect(values.parcelSize).toBeNull();
    expect(values.tags).toEqual([]);
    expect(values.slots).toEqual([]);
  });
});

describe('patchListingInCache', () => {
  it('synchronously updates listing detail and all feed query arrays in TanStack Query cache', () => {
    const qc = new QueryClient();

    const originalListing: Listing = {
      id: 'item-888',
      seller_id: 'seller-1',
      seller: {} as any,
      title: 'Original Title',
      description: 'Original Desc',
      price: 1000,
      category: 'clothing',
      gender: 'women',
      condition: 'good',
      brand: null,
      size: null,
      images: ['https://example.com/img1.jpg'],
      is_sold: false,
      views: 10,
      likes: 2,
      created_at: '2026-01-01T00:00:00Z',
    };

    // Pre-populate query client with detail and feed lists
    qc.setQueryData(qk.listing('item-888'), originalListing);
    qc.setQueryData(qk.myFeedListings('user-1'), [originalListing]);
    qc.setQueryData(qk.userListings('seller-1'), [originalListing]);

    const updatedListing: Listing = {
      ...originalListing,
      title: 'Updated Title',
      price: 2500,
    };

    patchListingInCache('item-888', updatedListing, qc);

    // Detail query is updated immediately
    const updatedDetail = qc.getQueryData<Listing>(qk.listing('item-888'));
    expect(updatedDetail?.title).toBe('Updated Title');
    expect(updatedDetail?.price).toBe(2500);

    // Home feed query is updated immediately
    const updatedFeed = qc.getQueryData<Listing[]>(qk.myFeedListings('user-1'));
    expect(updatedFeed?.[0]?.price).toBe(2500);
    expect(updatedFeed?.[0]?.title).toBe('Updated Title');

    // Profile query is updated immediately
    const updatedUserListings = qc.getQueryData<Listing[]>(qk.userListings('seller-1'));
    expect(updatedUserListings?.[0]?.price).toBe(2500);
  });
});
