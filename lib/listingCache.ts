import type { Listing } from '@/types';
import { markFresh } from '@/lib/freshness';

// Module-level cache that survives across screen mounts within one app
// session. The Supabase web client occasionally wedges (stuck token
// refresh, stalled fetch) — when that happens, navigating to a listing
// we've already seen still renders instantly off this cache, instead of
// stranding the user on a skeleton until they refresh the browser.
//
// Capped at MAX_CACHE_SIZE entries to prevent unbounded memory growth in
// long sessions. Uses insertion-order eviction (oldest first) via Map's
// built-in iterator order.

const MAX_CACHE_SIZE = 200;
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
  // Promote to newest position by deleting first (Map preserves insertion order).
  cache.delete(listing.id);
  cache.set(listing.id, listing);
  // Evict oldest entries when we exceed the cap.
  if (cache.size > MAX_CACHE_SIZE) {
    const excess = cache.size - MAX_CACHE_SIZE;
    let removed = 0;
    for (const key of cache.keys()) {
      if (removed >= excess) break;
      cache.delete(key);
      removed++;
    }
  }
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
  // Stamp freshness so the home feed's focus refetch can reuse these rows
  // instead of re-hitting the network on every tab switch.
  markFresh(`feed:${tab}`);
}
