import type { Listing } from '@/types';

// Module-level cache that survives across screen mounts within one app
// session. The Supabase web client occasionally wedges (stuck token
// refresh, stalled fetch) — when that happens, navigating to a listing
// we've already seen still renders instantly off this cache, instead of
// stranding the user on a skeleton until they refresh the browser.

const cache = new Map<string, Listing>();

export function getCachedListing(id: string | undefined | null): Listing | null {
  if (!id) return null;
  return cache.get(id) ?? null;
}

export function putCachedListing(listing: Listing | null | undefined): void {
  if (!listing?.id) return;
  cache.set(listing.id, listing);
}

export function putCachedListings(listings: Iterable<Listing>): void {
  for (const l of listings) putCachedListing(l);
}

export function clearListingCache(): void {
  cache.clear();
}
