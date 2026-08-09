// Batched liked/saved status. Every ListingCard used to fire two network
// round-trips on mount (isLiked + isSaved); a screen with 60 grid cards and two
// rails paid 160+ queries just to fill in heart/bookmark icons — the single
// biggest source of perceived lag. The fix was to answer both questions from one
// query per user, refreshed at most every 30s, with optimistic updates from the
// toggle paths so icons stay correct in between.
//
// All three of those properties — batching, the TTL, in-flight dedupe — are now
// the TanStack Query cache's job. What remains here is the write-through adapter
// that keeps the non-hook call sites working unchanged: lib/listings.ts,
// lib/saves.ts, and components/ListingCard.tsx. lib/queries.ts exposes the same
// two entries as useLikedIdsQuery / useSavedIdsQuery.
//
// The keys live here rather than in lib/queries.ts to keep the import graph
// acyclic: lib/queries.ts imports lib/listings.ts, which imports this file.

import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

// Reuse window, carried over unchanged from the hand-rolled cache. Deliberately
// shorter than the app-wide 60s default: a stale heart or bookmark is the most
// visibly wrong thing in the app.
export const ENGAGEMENT_TTL_MS = 30_000;

export const likedIdsKey = (userId: string) => ['likedIds', userId] as const;
export const savedIdsKey = (userId: string) => ['savedIds', userId] as const;

// Stored as string[], NEVER as a Set. The Query cache is persisted to
// AsyncStorage through JSON.stringify (see persistOptions in lib/queryClient.ts)
// and `JSON.stringify(new Set(['a']))` is `"{}"` — a cached Set would silently
// rehydrate empty on the next cold launch and every heart would render unliked
// regardless of the truth. Same trap documented on useFollowingMaskQuery.
const NO_IDS: string[] = [];

export async function fetchLikedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('listing_likes')
    .select('listing_id')
    .eq('user_id', userId)
    .limit(2000);
  // Throw rather than swallow. React Query keeps the last good array and retries
  // with backoff; the old code cached nothing and returned an empty set, which
  // reads as "you have liked nothing" and blanks every heart on screen.
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { listing_id: string }).listing_id);
}

export async function fetchSavedIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('save_list_items')
    .select('listing_id, save_lists!inner(user_id)')
    .eq('save_lists.user_id', userId)
    .limit(2000);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => (r as { listing_id: string }).listing_id);
}

// Array → Set, memoized on the ARRAY IDENTITY React Query hands back.
//
// peekLikedIds is read once per card per FlashList recycle, so the membership
// test has to stay O(1): building a Set on every read — or falling back to
// `array.includes` — would make it O(n) per card, on the UI thread, mid-scroll.
// React Query returns the same array reference until the data actually changes,
// so this builds one Set per refetch and every read after it is a WeakMap hit.
// Entries are collected with the array they key on.
const setByArray = new WeakMap<readonly string[], Set<string>>();

function asSet(ids: readonly string[]): Set<string> {
  const hit = setByArray.get(ids);
  if (hit) return hit;
  const built = new Set(ids);
  setByArray.set(ids, built);
  return built;
}

// Synchronous peek. getLikedIds/getSavedIds are async even when the answer is
// already in memory, so a card asking "am I liked?" always paid a microtask and
// a setState — i.e. a second render. On a 60-card grid that FlashList recycles
// while scrolling, that is a re-render per card per recycle, all of it on the UI
// thread, and it showed up as 33% janky frames (p90 44ms) with "Slow UI thread"
// as the dominant cause and bitmap uploads near zero.
//
// This lets a component seed its initial state from the warm cache during the
// first render and skip the effect entirely. It never fetches: null means "not
// known, or known but past the TTL", and the caller falls back to the async path
// which refetches. Reading dataUpdatedAt (rather than trusting the presence of
// data) is what preserves the old cache's TTL semantics; isInvalidated is what
// makes invalidateSavedCache below visible to these non-hook readers.
function peekIds(key: readonly unknown[]): Set<string> | null {
  const state = queryClient.getQueryState<string[]>(key);
  if (!state || !state.data || state.isInvalidated) return null;
  if (Date.now() - state.dataUpdatedAt > ENGAGEMENT_TTL_MS) return null;
  return asSet(state.data);
}

export function peekLikedIds(userId: string): Set<string> | null {
  return peekIds(likedIdsKey(userId));
}

// fetchQuery gives us the in-flight dedupe (60 cards mounting in the same frame
// share one request) and the TTL gate that this module used to hand-roll.
//
// It rejects once retries are exhausted, and these must NOT throw: ListingCard
// calls through isLiked() with a bare .then(), so a rejection there becomes an
// unhandled promise rejection. Fall back to whatever is still cached.
async function ensureIds(
  key: readonly unknown[],
  queryFn: () => Promise<string[]>,
): Promise<Set<string>> {
  let ids: string[] | null = null;
  let failure: unknown = null;
  try {
    ids = await queryClient.fetchQuery({
      queryKey: key,
      queryFn,
      staleTime: ENGAGEMENT_TTL_MS,
    });
  } catch (e) {
    failure = e;
  }

  if (failure !== null) {
    console.warn('[engagement] id fetch failed', failure);
    ids = queryClient.getQueryData<string[]>(key) ?? null;
  }

  return asSet(ids ?? NO_IDS);
}

export function getLikedIds(userId: string): Promise<Set<string>> {
  return ensureIds(likedIdsKey(userId), () => fetchLikedIds(userId));
}

export function getSavedIds(userId: string): Promise<Set<string>> {
  return ensureIds(savedIdsKey(userId), () => fetchSavedIds(userId));
}

// Optimistic updates from the toggle paths keep the cache truthful without a
// refetch. Wrong-user updates are ignored for free now that the user id is part
// of the key.
function setIdPresence(key: readonly unknown[], listingId: string, present: boolean): void {
  const state = queryClient.getQueryState<string[]>(key);
  // No cached array = nothing to patch. Creating one here would look like "this
  // user has liked exactly one thing" to the next peek, which is worse than a
  // miss. Mirrors the old cache's absent/wrong-user no-op.
  if (!state || !state.data) return;
  const without = state.data.filter((x) => x !== listingId);
  const next = present ? [...without, listingId] : without;
  // Preserve the original timestamp. The old cache mutated its Set in place and
  // left fetchedAt alone, so an optimistic write never extended the TTL; without
  // this, liking a single item would keep the whole list "fresh" indefinitely.
  queryClient.setQueryData<string[]>(key, next, { updatedAt: state.dataUpdatedAt });
}

export function updateLikedCache(userId: string, listingId: string, liked: boolean): void {
  setIdPresence(likedIdsKey(userId), listingId, liked);
}

export function updateSavedCache(userId: string, listingId: string, saved: boolean): void {
  setIdPresence(savedIdsKey(userId), listingId, saved);
}

// For mutations where the net effect on "is saved anywhere" is unclear
// (multi-list add/remove via the sheet) — cheap full invalidation.
//
// invalidateQueries, NOT removeQueries: removing drops the array outright and
// any mounted bookmark would flash empty before the refetch lands. Mounted
// observers refetch; the isInvalidated check in peekIds is what makes the same
// invalidation visible to the synchronous readers.
export function invalidateSavedCache(): void {
  queryClient.invalidateQueries({ queryKey: ['savedIds'] });
}
