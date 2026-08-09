// Listing rows used to live in a hand-rolled, session-only Map in this file.
// They now live in the TanStack Query cache under ['listing', id]; what remains
// here is the WRITE-THROUGH half of that move, so the non-hook producers keep
// seeding it unchanged — lib/listings.ts, lib/myFeed.ts, lib/recommendations.ts
// and components/sell/SellSheet.tsx.
//
// There is deliberately no reader. Every screen that used to seed itself from a
// `getCachedListing()` call now mounts useListingQuery (lib/queries.ts), which
// reads this same entry and gets the fetch, retry and revalidation with it.
//
// The key lives here rather than in lib/queries.ts to keep the import graph
// acyclic: lib/queries.ts imports lib/listings.ts, which imports this file.
//
// Three things the Map could not do now come for free: entries survive a cold
// launch (the cache is persisted to AsyncStorage), gcTime replaces the manual
// 200-entry LRU eviction, and a mounted useListingQuery repaints when a write
// lands instead of waiting for its own fetch.

import type { Listing } from '@/types';
import { queryClient } from '@/lib/queryClient';

export const listingKey = (id: string) => ['listing', id] as const;

// Seeded rows are stamped as ALREADY STALE (updatedAt: 0) on purpose.
//
// Feed queries select a slim column set — no `description`, and only the handful
// of seller fields a card renders — while the product screen needs the full row.
// Seeding at the current time would mark that thin row fresh for the whole
// staleTime window and suppress the detail fetch, leaving a product page with no
// description for a minute. A zero timestamp paints instantly AND refetches on
// mount, which is exactly what the old Map plus an unconditional useEffect did.
//
// The authoritative full row never comes through here — useListingQuery's own
// queryFn returns it and React Query stamps it fresh — so every write on this
// path is a seed by definition.
//
// ponytail: a seeded row is persisted alongside the feed row it came from, so a
// feed load writes each listing to disk twice. Cheap at current feed sizes; if
// AsyncStorage write time ever shows up in a profile, exclude ['listing', …]
// from shouldDehydrateQuery in lib/queryClient.ts.
export function putCachedListing(listing: Listing | null | undefined): void {
  if (!listing?.id) return;
  queryClient.setQueryData<Listing>(listingKey(listing.id), listing, { updatedAt: 0 });
}

export function putCachedListings(listings: Iterable<Listing>): void {
  for (const l of listings) putCachedListing(l);
}
