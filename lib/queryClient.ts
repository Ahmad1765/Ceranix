import { QueryClient } from '@tanstack/react-query';
import { FEED_TTL_MS } from '@/lib/freshness';

// Single app-wide QueryClient. Defaults are tuned to reproduce the behaviour of
// the hand-rolled caches we're replacing (lib/freshness, lib/listingCache):
//
//  - staleTime = FEED_TTL_MS (60s): a screen that re-mounts / re-focuses within
//    the window reuses cached data instead of refetching — exactly what the old
//    isFresh() gate did, now for free and per-query.
//  - gcTime 5m: keep data around after a screen unmounts so back-navigation is
//    instant (the role lib/listingCache played).
//  - retry 2 with capped backoff: the Supabase web client occasionally wedges;
//    a couple of retries recovers most transient failures without hanging.
//  - refetchOnWindowFocus off: this app drives focus refetches explicitly via
//    expo-router; staleTime already covers the "reuse if fresh" case.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: FEED_TTL_MS,
      gcTime: 5 * 60_000,
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnWindowFocus: false,
    },
  },
});
