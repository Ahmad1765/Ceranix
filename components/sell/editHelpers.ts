import type { Condition, Gender, Listing } from '@/types';
import type { PhotoSlot } from '@/lib/photoClean/slots';
import type { SellFormValues, ParcelSize } from '@/lib/schemas/sell';
import { queryClient } from '@/lib/queryClient';
import { qk } from '@/lib/queries/keys';
import type { QueryClient } from '@tanstack/react-query';

export const DEFAULT_SELL_VALUES: SellFormValues = {
  slots: [],
  title: '',
  description: '',
  price: '',
  brand: '',
  size: '',
  condition: 'good',
  category: 'clothing',
  subcategory: null,
  color: null,
  gender: 'women',
  tags: [],
  parcelSize: null,
};

export function listingToSellFormValues(listing: Listing | null | undefined): SellFormValues {
  if (!listing) return DEFAULT_SELL_VALUES;
  const initialSlots: PhotoSlot[] = (listing.images ?? []).filter(Boolean).map((url, i) => ({
    id: `existing-${i}-${url}`,
    original: { uri: url, base64: null },
    cleaned: null,
    useCleaned: false,
    status: 'done' as const,
    faceCount: 0,
  }));

  return {
    slots: initialSlots,
    title: listing.title || '',
    description: listing.description || '',
    price: listing.price != null ? String(listing.price) : '',
    brand: listing.brand || '',
    size: listing.size || '',
    condition: (listing.condition as Condition) || 'good',
    category: (listing.category as any) || 'clothing',
    subcategory: listing.subcategory || null,
    color: listing.color || null,
    gender: (listing.gender as Gender) || 'women',
    tags: Array.isArray(listing.tags) ? listing.tags : [],
    parcelSize: (listing.parcel_size as ParcelSize) || null,
  };
}

export function patchListingInCache(
  listingId: string,
  updatedListing: Listing,
  qc: QueryClient = queryClient,
): void {
  // 1. Authoritative direct detail update (stamped fresh, prevents refetch flicker)
  qc.setQueryData<Listing>(qk.listing(listingId), updatedListing);

  // 2. Generic helper that handles both flat arrays (Listing[]) and infinite query structures ({ pages: Listing[][] })
  const patchItem = (item: any) =>
    item && item.id === listingId ? { ...item, ...updatedListing } : item;

  const patchData = (old: any) => {
    if (!old) return old;
    if (Array.isArray(old)) {
      return old.map(patchItem);
    }
    if (old.pages && Array.isArray(old.pages)) {
      return {
        ...old,
        pages: old.pages.map((page: any) => (Array.isArray(page) ? page.map(patchItem) : page)),
      };
    }
    return old;
  };

  // Synchronously update all feed and listing queries in memory:
  qc.setQueriesData({ queryKey: ['myFeedListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['homeFeed'] }, patchData);
  qc.setQueriesData({ queryKey: ['feedListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['userListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['savedListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['likedListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['sellerOtherListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['similarListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['tagListings'] }, patchData);
  qc.setQueriesData({ queryKey: ['priceDrops'] }, patchData);
  qc.setQueriesData({ queryKey: ['newFromFollowed'] }, patchData);
}
