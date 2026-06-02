import type { Listing } from '@/types';

// Module-level cache that survives across screen mounts within one app
// session. The Supabase web client occasionally wedges (stuck token
// refresh, stalled fetch) — when that happens, navigating to a listing
// we've already seen still renders instantly off this cache, instead of
// stranding the user on a skeleton until they refresh the browser.

const cache = new Map<string, Listing>();

// Feed-level snapshot, keyed by tab. Lets the home feed re-render its last
// good rows immediately on mount/tab-switch while a fresh fetch runs in the
// background — so a wedged fetch never blanks the screen mid-session.
const feedSnapshots = new Map<string, Listing[]>();

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
  feedSnapshots.clear();
}

export function getFeedSnapshot(tab: string): Listing[] | null {
  return feedSnapshots.get(tab) ?? null;
}

export function putFeedSnapshot(tab: string, rows: Listing[]): void {
  feedSnapshots.set(tab, rows);
}
