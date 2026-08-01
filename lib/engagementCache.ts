// Batched liked/saved status. Every ListingCard used to fire two network
// round-trips on mount (isLiked + isSaved); a screen with 60 grid cards and
// two rails paid 160+ queries just to fill in heart/bookmark icons — the
// single biggest source of perceived lag. This cache answers the same
// questions from TWO queries per user, refreshed at most every 30s, with
// optimistic updates from the toggle paths so icons stay correct in between.

import { supabase } from '@/lib/supabase';

const TTL_MS = 30_000;

type CacheEntry = {
  userId: string;
  ids: Set<string>;
  fetchedAt: number;
};

let likedCache: CacheEntry | null = null;
let savedCache: CacheEntry | null = null;
// In-flight dedupe: 60 cards mounting in the same frame share one fetch.
let likedInflight: { userId: string; p: Promise<Set<string>> } | null = null;
let savedInflight: { userId: string; p: Promise<Set<string>> } | null = null;

function fresh(entry: CacheEntry | null, userId: string): entry is CacheEntry {
  return !!entry && entry.userId === userId && Date.now() - entry.fetchedAt < TTL_MS;
}

export async function getLikedIds(userId: string): Promise<Set<string>> {
  if (fresh(likedCache, userId)) return likedCache.ids;
  if (likedInflight?.userId === userId) return likedInflight.p;
  const p = (async () => {
    const { data, error } = await supabase
      .from('listing_likes')
      .select('listing_id')
      .eq('user_id', userId)
      .limit(2000);
    if (error) {
      console.warn('[engagement] liked ids', error.message);
      // Don't cache failures — next caller retries. Read through a cast:
      // the failed `fresh()` guard above narrowed the var to null even
      // though a stale entry may legitimately exist by the time we're here.
      const prev = likedCache as CacheEntry | null;
      return prev?.userId === userId ? prev.ids : new Set<string>();
    }
    const ids = new Set((data ?? []).map((r) => (r as { listing_id: string }).listing_id));
    likedCache = { userId, ids, fetchedAt: Date.now() };
    return ids;
  })().finally(() => {
    if (likedInflight?.p === p) likedInflight = null;
  });
  likedInflight = { userId, p };
  return p;
}

export async function getSavedIds(userId: string): Promise<Set<string>> {
  if (fresh(savedCache, userId)) return savedCache.ids;
  if (savedInflight?.userId === userId) return savedInflight.p;
  const p = (async () => {
    const { data, error } = await supabase
      .from('save_list_items')
      .select('listing_id, save_lists!inner(user_id)')
      .eq('save_lists.user_id', userId)
      .limit(2000);
    if (error) {
      console.warn('[engagement] saved ids', error.message);
      const prev = savedCache as CacheEntry | null;
      return prev?.userId === userId ? prev.ids : new Set<string>();
    }
    const ids = new Set((data ?? []).map((r) => (r as { listing_id: string }).listing_id));
    savedCache = { userId, ids, fetchedAt: Date.now() };
    return ids;
  })().finally(() => {
    if (savedInflight?.p === p) savedInflight = null;
  });
  savedInflight = { userId, p };
  return p;
}

// Synchronous peeks. getLikedIds/getSavedIds are async even when the answer is
// already in memory, so a card asking "am I liked?" always paid a microtask and
// a setState — i.e. a second render. On a 60-card grid that FlashList recycles
// while scrolling, that is a re-render per card per recycle, all of it on the UI
// thread, and it showed up as 33% janky frames (p90 44ms) with "Slow UI thread"
// as the dominant cause and bitmap uploads near zero.
//
// These let a component seed its initial state from the warm cache during the
// first render and skip the effect entirely. They never fetch: null means "not
// known yet", and the caller should fall back to the async path.
export function peekLikedIds(userId: string): Set<string> | null {
  return fresh(likedCache, userId) ? likedCache.ids : null;
}

export function peekSavedIds(userId: string): Set<string> | null {
  return fresh(savedCache, userId) ? savedCache.ids : null;
}

// Optimistic updates from the toggle paths keep the cache truthful without
// a refetch. Wrong-user updates are ignored.
export function updateLikedCache(userId: string, listingId: string, liked: boolean): void {
  if (likedCache?.userId !== userId) return;
  if (liked) likedCache.ids.add(listingId);
  else likedCache.ids.delete(listingId);
}

export function updateSavedCache(userId: string, listingId: string, saved: boolean): void {
  if (savedCache?.userId !== userId) return;
  if (saved) savedCache.ids.add(listingId);
  else savedCache.ids.delete(listingId);
}

// For mutations where the net effect on "is saved anywhere" is unclear
// (multi-list add/remove via the sheet) — cheap full invalidation.
export function invalidateSavedCache(): void {
  savedCache = null;
}

export function invalidateEngagementCaches(): void {
  likedCache = null;
  savedCache = null;
}
