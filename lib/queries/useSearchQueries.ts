// ─────────────────────────────────────────────────────────────────────────────
// DISCOVERY & SEARCH QUERY HOOKS
// ─────────────────────────────────────────────────────────────────────────────
//
// 💡 EDUCATIONAL PATTERN: Client-Side Refinement over Cached Indices
// Rather than hitting the server on every keystroke as the user types in search,
// these queries fetch high-level indices (brands, tags) once with a generous
// `staleTime` (5 minutes). Client components then filter this array instantly
// in memory with 0 network latency and 0 DB read cost.
// ─────────────────────────────────────────────────────────────────────────────

import { useQuery } from '@tanstack/react-query';
import { qk } from './keys';
import {
  fetchBrandIndex,
  fetchTagIndex,
  fetchTagListings,
  type BrandIndexEntry,
  type TagIndexEntry,
} from '@/lib/searchIndex';
import { fetchSuggestedFollows } from '@/lib/follows';
import type { Listing } from '@/types';

/**
 * The full live brand index (catalog-wide, ranked by stock).
 * Fetched once per staleTime and filtered client-side while typing,
 * making typing instant and cost-free.
 */
export function useBrandIndexQuery(enabled = true) {
  return useQuery({
    queryKey: qk.brandIndex(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<BrandIndexEntry[]> => fetchBrandIndex(null),
  });
}

/**
 * The full live tag index (catalog-wide, ranked by stock).
 * Same shape and caching as the brand index, sourced from listings.tags.
 */
export function useTagIndexQuery(enabled = true) {
  return useQuery({
    queryKey: qk.tagIndex(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<TagIndexEntry[]> => fetchTagIndex(null),
  });
}

/**
 * Listings behind a specific tag tile — keyed by tag so revisiting a tile
 * is instant from cache.
 */
export function useTagListingsQuery(tag: string | null) {
  return useQuery({
    queryKey: qk.tagListings(tag),
    enabled: !!tag,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<Listing[]> => fetchTagListings(tag as string),
  });
}

/**
 * "Suggested for you" sellers on the Users tab idle state.
 */
export function useSuggestedFollowsQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.suggestedFollows(userId),
    enabled,
    queryFn: () => fetchSuggestedFollows(userId, 12),
  });
}
