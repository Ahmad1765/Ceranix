// TanStack Query hooks + a central query-key factory. Screens import these
// instead of calling fetch* directly, so caching, dedup, retries, and
// background refetch are handled in one place. The underlying fetch functions
// in lib/listings.ts / lib/follows.ts stay the single source of data logic —
// these hooks just wrap them with React Query.
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  deleteListing,
  fetchFollowingListingsResult,
  fetchLikedListings,
  fetchListings,
  fetchListingsResult,
  fetchSellerOtherListings,
  fetchSimilarListings,
  fetchUserListings,
  setListingSold,
  toggleLike,
  SELECT_LISTING_WITH_SELLER,
  type FeedTab,
  type SortKey,
} from '@/lib/listings';
// Keys + write-through adapters for the two caches that used to be hand-rolled.
// They own their keys so the import graph stays acyclic (this file → listings.ts
// → listingCache.ts), and the non-hook call sites keep writing through them.
import { listingKey } from '@/lib/listingCache';
import {
  ENGAGEMENT_TTL_MS,
  fetchLikedIds,
  fetchSavedIds,
  likedIdsKey,
  savedIdsKey,
  updateLikedCache,
} from '@/lib/engagementCache';
import { fetchRecommendations, fetchRecentlyViewed } from '@/lib/recommendations';
import { fetchNewFromFollowed, fetchPriceDrops, type PriceDropListing } from '@/lib/myFeed';
import {
  ensureSaveLists,
  fetchListingsInList,
  fetchSavedListings,
  listSaveLists,
  type SaveList,
} from '@/lib/saves';
import {
  deleteSavedSearch,
  fetchNewMatchesCount,
  listSavedSearches,
  type SavedSearch,
} from '@/lib/savedSearches';
import {
  FOLLOW_PAGE_SIZE,
  fetchFollowers,
  fetchFollowing,
  fetchFollowingMask,
  fetchFollowState,
  fetchSuggestedFollows,
  getCachedFollowState,
  toggleFollow,
  type FollowState,
} from '@/lib/follows';
import {
  fetchTagIndex,
  fetchTagListings,
  fetchBrandIndex,
  type TagIndexEntry,
  type BrandIndexEntry,
} from '@/lib/searchIndex';
import { listConversations, type ConversationRow } from '@/lib/chat';
import type { User as Profile, Listing } from '@/types';
import {
  fetchDeck,
  recordSwipe,
  createWardrobePost,
  deleteWardrobePost,
  fetchMyWardrobe,
  fetchLikedWardrobe,
  type WardrobePost,
  type SwipeDirection,
} from '@/lib/wardrobe';

// Centralized, typed query keys. One place to see every cache key in the app
// and to invalidate consistently (e.g. qc.invalidateQueries({ queryKey: qk.profile(id) })).
export const qk = {
  profile: (id: string) => ['profile', id] as const,
  userListings: (id: string) => ['userListings', id] as const,
  // The detail row for one listing, and the two batched engagement sets. These
  // three are re-exported from the adapter modules that define them rather than
  // declared here — see the import block above for why — so that `qk` stays the
  // one place to read every cache key in the app.
  listing: listingKey,
  likedIds: likedIdsKey,
  savedIds: savedIdsKey,
  followState: (viewerId: string | null, targetId: string) =>
    ['followState', viewerId, targetId] as const,
  feedListings: (
    tab: FeedTab,
    category: string | null,
    subcategory: string | null,
    sort: SortKey | null,
  ) => ['feedListings', tab, category, subcategory, sort] as const,
  recommendations: (userId: string | null) => ['recommendations', userId] as const,
  recentlyViewed: (userId: string | null) => ['recentlyViewed', userId] as const,
  homeFeed: (tab: HomeFeedTab, userId: string | null) =>
    ['homeFeed', tab, userId] as const,
  myFeedListings: (userId: string | null) => ['myFeedListings', userId] as const,
  priceDrops: (userId: string | null) => ['priceDrops', userId] as const,
  newFromFollowed: (userId: string | null) => ['newFromFollowed', userId] as const,
  savedSearches: (userId: string | null) => ['savedSearches', userId] as const,
  // `ids` is part of the key so adding or deleting a saved search refetches
  // the counts instead of serving a total that still includes the deleted row.
  savedSearchMatches: (userId: string | null, ids: string) =>
    ['savedSearchMatches', userId, ids] as const,
  savedListings: (userId: string | null) => ['savedListings', userId] as const,
  likedListings: (userId: string | null) => ['likedListings', userId] as const,
  saveLists: (userId: string | null) => ['saveLists', userId] as const,
  listingsInList: (listId: string | null) => ['listingsInList', listId] as const,
  inbox: (userId: string | null) => ['inbox', userId] as const,
  sellerOtherListings: (sellerId: string | null, excludeId: string | null) =>
    ['sellerOtherListings', sellerId, excludeId] as const,
  similarListings: (listingId: string | null) => ['similarListings', listingId] as const,
  wardrobeDeck: (userId: string | null) => ['wardrobeDeck', userId] as const,
  myWardrobe: (userId: string | null) => ['myWardrobe', userId] as const,
  likedWardrobe: (userId: string | null) => ['likedWardrobe', userId] as const,
  brandIndex: () => ['brandIndex'] as const,
  tagIndex: () => ['tagIndex'] as const,
  tagListings: (tag: string | null) => ['tagListings', tag] as const,
  suggestedFollows: (userId: string | null) => ['suggestedFollows', userId] as const,
  followers: (userId: string) => ['followers', userId] as const,
  following: (userId: string) => ['following', userId] as const,
  // `scope` distinguishes the two lists that can be on screen for the same
  // viewer (e.g. 'followers:<id>' vs 'following:<id>'), so opening one does not
  // clobber the other's cached mask.
  //
  // `ids` is part of the key, not just the queryFn's closure. The mask is a
  // dependent query — its answer is only valid for the exact id set it was asked
  // about — so keying without them meant a refresh that changed the list (a new
  // follower) recomputed nothing and left that row rendering the wrong button
  // until gcTime expired. Follow lists are tens-to-hundreds of ids, so the
  // larger key is a fair trade for staying correct.
  followingMask: (viewerId: string | null, scope: string, ids: string[]) =>
    [...qk.followingMaskScope(viewerId, scope), ids] as const,
  // Every mask entry for one viewer+list, whatever id set it was fetched for.
  //
  // Needed because the full key above is only stable while `ids` is. The follow
  // lists paginate, so `ids` grows as the reader scrolls, and a mutation that
  // captured the key at render time can settle *after* a new page has changed
  // it — leaving the optimistic write on an entry nothing reads and the button
  // visibly snapping back. Writing through this prefix updates every cached
  // mask for the list instead, which is correct regardless of paging.
  followingMaskScope: (viewerId: string | null, scope: string) =>
    ['followingMask', viewerId, scope] as const,
};

// ── Discover search hub ─────────────────────────────────────────────────────
// The full live brand index (catalog-wide, ranked by stock). Fetched once per
// staleTime and filtered client-side while typing, so keystrokes cost nothing.
export function useBrandIndexQuery(enabled = true) {
  return useQuery({
    queryKey: qk.brandIndex(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<BrandIndexEntry[]> => fetchBrandIndex(null),
  });
}

// The full live tag index (catalog-wide, ranked by stock) — same shape and
// caching as the brand index above, just sourced from listings.tags instead
// of listings.brand. Fetched once per staleTime and filtered client-side
// while typing.
export function useTagIndexQuery(enabled = true) {
  return useQuery({
    queryKey: qk.tagIndex(),
    enabled,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<TagIndexEntry[]> => fetchTagIndex(null),
  });
}

// Listings behind one tag tile — keyed by tag so revisiting a tile is
// instant from cache.
export function useTagListingsQuery(tag: string | null) {
  return useQuery({
    queryKey: qk.tagListings(tag),
    enabled: !!tag,
    staleTime: 5 * 60_000,
    queryFn: (): Promise<Listing[]> => fetchTagListings(tag as string),
  });
}

// "Suggested for you" sellers on the Users tab idle state.
export function useSuggestedFollowsQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: qk.suggestedFollows(userId),
    enabled,
    queryFn: () => fetchSuggestedFollows(userId, 12),
  });
}

// ── Product detail ──────────────────────────────────────────────────────────

// Deliberately module-private, and deliberately NOT exported from lib/listings.ts
// where every other read lives. It is the queryFn below and nothing else: four
// screens used to import an exported `fetchListingById` and wrap it in their own
// load effect, which is how the app ended up with four copies of the same abort
// flag, cache seed, and dead 25s timeout race. Fetching one listing outside
// React Query is now impossible by construction.
//
// Throws on a request failure, returns null for a row that genuinely isn't
// there — the distinction the callers' "not found" states are built on, and the
// reason a missing listing doesn't burn the retry budget.
async function fetchListingRow(id: string, signal?: AbortSignal): Promise<Listing | null> {
  // abortSignal() lives on the filter builder — it must be chained before the
  // terminal modifier (.maybeSingle), otherwise it's missing from the type.
  const filter = supabase.from('listings').select(SELECT_LISTING_WITH_SELLER).eq('id', id);
  const query = signal ? filter.abortSignal(signal) : filter;
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Listing) ?? null;
}

/**
 * One listing row. Replaces the hand-rolled load effect that four screens each
 * ran (module cache seed → abort flag → `active` guard → separate
 * loading/notFound/error state): React Query owns the fetch, the abort on
 * unmount, the retry/backoff, and the "reuse if fresh" gate.
 *
 * `null` data is a real answer — the row does not exist — and never retries,
 * because fetchListingRow only throws on an actual request failure.
 *
 * `select` is where callers normalize the row (e.g. substituting a fallback
 * seller). It belongs on the READ side, not in the queryFn: this cache entry is
 * also seeded by feed fetches through lib/listingCache, so normalizing on write
 * would leave the shape dependent on which writer got there first. Pass a
 * module-scope function — React Query re-runs select when its identity changes.
 */
export function useListingQuery<T = Listing | null>(
  id: string | null | undefined,
  select?: (row: Listing | null) => T,
) {
  return useQuery<Listing | null, Error, T>({
    queryKey: qk.listing(id ?? ''),
    enabled: !!id,
    queryFn: ({ signal }) => fetchListingRow(id as string, signal),
    select,
  });
}

// The viewer's liked / saved listing ids, as arrays (see lib/engagementCache for
// why never Sets). One query per user per 30s answers the heart and bookmark on
// every card and every product page.
export function useLikedIdsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedIds(userId ?? ''),
    enabled: !!userId,
    staleTime: ENGAGEMENT_TTL_MS,
    queryFn: (): Promise<string[]> => fetchLikedIds(userId as string),
  });
}

export function useSavedIdsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.savedIds(userId ?? ''),
    enabled: !!userId,
    staleTime: ENGAGEMENT_TTL_MS,
    queryFn: (): Promise<string[]> => fetchSavedIds(userId as string),
  });
}

// Patch fields on a cached listing row, preserving its timestamp.
//
// The timestamp matters: rows seeded from a feed are deliberately stamped stale
// (lib/listingCache) so the detail screen refetches the full row on mount. A
// plain setQueryData would stamp them fresh and suppress that fetch, leaving a
// product page with no description.
function patchListing(qc: QueryClient, listingId: string, patch: Partial<Listing>): void {
  const state = qc.getQueryState<Listing>(qk.listing(listingId));
  if (!state || !state.data) return;
  qc.setQueryData<Listing>(
    qk.listing(listingId),
    { ...state.data, ...patch },
    { updatedAt: state.dataUpdatedAt },
  );
}

/**
 * Like / unlike, with the heart AND the like count moving together.
 *
 * They used to be two unsynchronised sources on the product screen — a `liked`
 * boolean and the row's `likes` column — reconciled by a `heartDelta` expression
 * that leaned on `listing.user_has_liked`, a field no query in the app actually
 * populates. The visible symptom was un-liking an item you had liked leaving the
 * count one too high until the next refetch. One optimistic write to both fixes
 * it by construction.
 *
 * Note the asymmetry in toggleLike: it swallows its own errors and returns the
 * PREVIOUS value on failure, so a result equal to what we started with is a
 * failure, not a no-op. It also writes the ids cache itself on success — hence
 * only the optimistic write and the rollbacks live here.
 */
export function useToggleLike(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ listingId, currentlyLiked }: { listingId: string; currentlyLiked: boolean }) =>
      toggleLike(listingId, userId as string, currentlyLiked),
    onMutate: async ({ listingId, currentlyLiked }) => {
      const next = !currentlyLiked;
      await qc.cancelQueries({ queryKey: qk.likedIds(userId ?? '') });
      // Bound to a variable before the optional read. Optional member access
      // directly on a CALL result trips a react-compiler@1.0.0 lowering bug
      // ("Unexpected terminal kind `optional` for optional test block") which
      // bails it out of the enclosing hook.
      const prevRow = qc.getQueryData<Listing>(qk.listing(listingId));
      const prevLikes = prevRow ? prevRow.likes : undefined;
      updateLikedCache(userId as string, listingId, next);
      const bumped = Math.max(0, Number(prevLikes ?? 0) + (next ? 1 : -1));
      patchListing(qc, listingId, { likes: bumped });
      return { prevLikes, next };
    },
    onError: (_e, { listingId, currentlyLiked }, ctx) => {
      updateLikedCache(userId as string, listingId, currentlyLiked);
      if (ctx) patchListing(qc, listingId, { likes: ctx.prevLikes });
    },
    onSuccess: (committed, { listingId, currentlyLiked }, ctx) => {
      if (committed !== currentlyLiked) return;
      // Server disagreed — same rollback as onError.
      updateLikedCache(userId as string, listingId, currentlyLiked);
      if (ctx) patchListing(qc, listingId, { likes: ctx.prevLikes });
    },
  });
}

/** Owner action: flip `is_sold`, optimistically, rolling back on refusal. */
export function useSetListingSold(listingId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nextSold: boolean) => setListingSold(listingId as string, nextSold),
    onMutate: async (nextSold) => {
      const key = qk.listing(listingId ?? '');
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<Listing>(key);
      patchListing(qc, listingId as string, { is_sold: nextSold });
      return { prev };
    },
    onError: (_e, _nextSold, ctx) => {
      if (ctx?.prev) patchListing(qc, listingId as string, { is_sold: ctx.prev.is_sold });
    },
    // setListingSold never throws: it returns the value it managed to commit,
    // which is the PREVIOUS one when the update failed.
    onSuccess: (committed, nextSold, ctx) => {
      if (committed === nextSold) return;
      if (ctx?.prev) patchListing(qc, listingId as string, { is_sold: ctx.prev.is_sold });
    },
  });
}

/**
 * Owner action: hard-delete. Returns false rather than throwing on refusal.
 *
 * `sellerId` exists only to invalidate the two caches where a deleted row is
 * visible IMMEDIATELY rather than eventually — see onSuccess.
 */
export function useDeleteListing(sellerId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (listingId: string) => deleteListing(listingId),
    onSuccess: (ok, listingId) => {
      if (!ok) return;
      // Remove outright rather than invalidate. The Query cache is persisted to
      // AsyncStorage on a 1s throttle while staleTime is 60s, so a merely
      // invalidated entry can rehydrate PRE-delete and then be treated as fresh
      // for a minute — the bug that used to resurrect deleted saved searches
      // (see useDeleteSavedSearch below).
      qc.removeQueries({ queryKey: qk.listing(listingId) });

      // The seller's own grid, which backs both app/(tabs)/profile.tsx and
      // app/user/[id].tsx — i.e. exactly where safeBack() lands the owner after
      // a delete, so a ghost row there is on screen instantly.
      if (sellerId) qc.invalidateQueries({ queryKey: qk.userListings(sellerId) });
      // The bundle rail, by prefix rather than by key: it is keyed on
      // (sellerId, excludeId), so every one of this seller's OTHER product pages
      // holds its own entry that would keep offering the deleted item to bundle.
      qc.invalidateQueries({ queryKey: ['sellerOtherListings'] });

      // The broad feeds (homeFeed / myFeedListings / feedListings /
      // similarListings) are deliberately left to age out on their own 60s
      // staleTime. A deleted row surviving one of those for under a minute
      // renders a card that routes to "Listing not available" — the behaviour
      // that already shipped, and not worth an eight-key invalidation sweep.
    },
  });
}

// Product detail rails — pure server reads keyed on the current listing.
export function useSellerOtherListingsQuery(
  sellerId: string | null,
  excludeId: string | null,
  limit = 6,
) {
  return useQuery({
    queryKey: qk.sellerOtherListings(sellerId, excludeId),
    enabled: !!sellerId,
    queryFn: (): Promise<Listing[]> =>
      fetchSellerOtherListings(sellerId as string, excludeId, limit),
  });
}

export function useSimilarListingsQuery(listingId: string | null, limit = 6) {
  return useQuery({
    queryKey: qk.similarListings(listingId),
    enabled: !!listingId,
    queryFn: (): Promise<Listing[]> => fetchSimilarListings(listingId as string, limit),
  });
}

// Chat inbox. The Realtime subscription (subscribeToInbox) stays in the screen
// and simply calls refetch() on change — the simplest Realtime + React Query
// pattern (subscription invalidates the query rather than patching the cache).
export function useInboxQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.inbox(userId),
    enabled: !!userId,
    queryFn: (): Promise<ConversationRow[]> => listConversations(userId as string),
  });
}

export function useLikedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedListings(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchLikedListings(userId as string),
  });
}

// Save-list chips. Seeds the starter lists on first visit, then returns them.
export function useSaveListsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.saveLists(userId),
    enabled: !!userId,
    queryFn: async (): Promise<SaveList[]> => {
      await ensureSaveLists(userId as string);
      return listSaveLists(userId as string);
    },
  });
}

export function useListingsInListQuery(listId: string | null) {
  return useQuery({
    queryKey: qk.listingsInList(listId),
    enabled: !!listId,
    queryFn: (): Promise<Listing[]> => fetchListingsInList(listId as string),
  });
}

// My Feed primary grid: personalized recommendations for a signed-in user,
// newest-first as the anonymous fallback. Returns RecommendedListing[] for
// users (carries rec_reason, used to detect the cold-start "fallback" state).
// Newest (not 'popular') so the fallback stays visibly distinct from the
// Trending chip, which is explicitly likes-sorted — otherwise the two views
// are byte-identical for a signed-out visitor.
export function useMyFeedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myFeedListings(userId),
    queryFn: () =>
      userId ? fetchRecommendations(48) : fetchListings({ tab: 'for_you', limit: 60 }),
  });
}

// Price drops on liked items. Throws on the discriminated ok:false so React
// Query preserves the last good rows instead of clearing the rail.
export function usePriceDropsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.priceDrops(userId),
    enabled: !!userId,
    queryFn: async (): Promise<PriceDropListing[]> => {
      const r = await fetchPriceDrops(userId as string);
      if (!r.ok) throw new Error('price drops unavailable');
      return r.rows;
    },
  });
}

export function useNewFromFollowedQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.newFromFollowed(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Listing[]> => {
      const r = await fetchNewFromFollowed(userId as string);
      if (!r.ok) throw new Error('new-from-followed unavailable');
      return r.rows;
    },
  });
}

export function useSavedSearchesQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.savedSearches(userId),
    enabled: !!userId,
    queryFn: (): Promise<SavedSearch[]> => listSavedSearches(userId as string),
  });
}

export type SavedSearchMatches = {
  /** New-match count per saved-search id. */
  counts: Record<string, number>;
  /** Their sum — what the Inbox's Activity badge shows. */
  total: number;
};

const NO_MATCHES: SavedSearchMatches = { counts: {}, total: 0 };

// Stable reference so the query key below doesn't churn while the searches
// query is still loading.
const EMPTY_SAVED_SEARCHES: SavedSearch[] = [];

// How many listings have landed under each saved search since the user last
// opened it. Split from useSavedSearchesQuery because Home only needs the rows,
// while Activity needs the per-row "N new" numbers and the Inbox badge needs
// their sum — and only these two should pay for N extra RPCs.
export function useSavedSearchMatchesQuery(userId: string | null, searches: SavedSearch[]) {
  const ids = searches.map((s) => s.id);
  return useQuery({
    queryKey: qk.savedSearchMatches(userId, ids.join(',')),
    enabled: !!userId && ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<SavedSearchMatches> => {
      const pairs = await Promise.all(
        ids.map(async (id) => {
          try {
            return [id, await fetchNewMatchesCount(id)] as const;
          } catch (err) {
            // A single failed count shouldn't blank the whole badge.
            console.warn('[activity] new-match count failed for', id, err);
            return [id, 0] as const;
          }
        }),
      );
      return {
        counts: Object.fromEntries(pairs),
        total: pairs.reduce((sum, [, n]) => sum + n, 0),
      };
    },
  });
}

/**
 * Unread total behind the Inbox's Activity tab badge.
 *
 * Reads through the same two caches the Activity feed itself renders from, so
 * the badge can never disagree with the list underneath it. Clears on its own:
 * opening a saved search routes through /discover?savedId=…, which stamps
 * last_seen_at and invalidates these keys.
 */
export function useActivityUnreadCount(userId: string | null): number {
  const searchesQ = useSavedSearchesQuery(userId);
  const matchesQ = useSavedSearchMatchesQuery(userId, searchesQ.data ?? EMPTY_SAVED_SEARCHES);
  return (matchesQ.data ?? NO_MATCHES).total;
}

export function useSavedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.savedListings(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchSavedListings(userId as string),
  });
}

// Optimistic saved-search delete: drop the chip from cache immediately, roll
// back if the server rejects.
export function useDeleteSavedSearch(userId: string | null) {
  const qc = useQueryClient();
  const key = qk.savedSearches(userId);
  return useMutation({
    mutationFn: async (id: string) => {
      const ok = await deleteSavedSearch(id);
      if (!ok) throw new Error('delete failed');
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SavedSearch[]>(key);
      qc.setQueryData<SavedSearch[]>(key, (old) => (old ?? []).filter((s) => s.id !== id));
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    // Refetch rather than trusting the optimistic write, because the Query
    // cache is persisted to AsyncStorage on a 1s throttle while staleTime is
    // 60s (see lib/queryClient.ts). A reload inside that window rehydrated the
    // PRE-delete snapshot and then considered it fresh for a minute — so a
    // deleted saved search reappeared and sat there. Invalidating forces the
    // server's answer to be what gets persisted.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ['savedSearchMatches'] });
    },
  });
}

// The home screen's three tabs. 'following' is a non-paginated, user-scoped
// feed; the other two paginate.
export type HomeFeedTab = FeedTab | 'following';
const HOME_FEED_PAGE_SIZE = 60;

// Paginated home feed as an infinite query. This single hook subsumes a large
// amount of the old hand-rolled machinery in app/(tabs)/index.tsx:
//   - per-tab caching (keyed by tab) replaces the feedSnapshots cache
//   - throwing on a wedge (ok:false) makes React Query keep the last good pages
//     instead of blanking the feed — the resilience the ok:false branch gave us
//   - the default retry/backoff replaces the manual wedge-killer + retry timers
//   - getNextPageParam replaces the manual offset bookkeeping in loadMore
export function useHomeFeedQuery(tab: HomeFeedTab, userId: string | null) {
  return useInfiniteQuery({
    queryKey: qk.homeFeed(tab, userId),
    // Following requires a signed-in user; the other tabs are public.
    enabled: tab !== 'following' || !!userId,
    initialPageParam: 0,
    queryFn: async ({ pageParam }): Promise<Listing[]> => {
      if (tab === 'following') {
        if (!userId) return [];
        const r = await fetchFollowingListingsResult(userId);
        if (!r.ok) throw new Error('following feed unavailable');
        return r.rows;
      }
      const r = await fetchListingsResult({
        tab,
        limit: HOME_FEED_PAGE_SIZE,
        offset: pageParam,
      });
      if (!r.ok) throw new Error('feed unavailable');
      return r.rows;
    },
    getNextPageParam: (lastPage, allPages) => {
      // Following never paginates. Otherwise, a short final page = end of feed;
      // the next offset is the total rows loaded so far.
      if (tab === 'following') return undefined;
      if (lastPage.length < HOME_FEED_PAGE_SIZE) return undefined;
      return allPages.reduce((total, page) => total + page.length, 0);
    },
  });
}

export function useFeedListingsQuery(opts: {
  tab: FeedTab;
  category?: string | null;
  subcategory?: string | null;
  sort?: SortKey | null;
  limit?: number;
  enabled?: boolean;
}) {
  const { tab, category = null, subcategory = null, sort = null, limit = 60, enabled = true } = opts;
  return useQuery({
    queryKey: qk.feedListings(tab, category, subcategory, sort),
    enabled,
    queryFn: (): Promise<Listing[]> => fetchListings({ tab, category, subcategory, sort, limit }),
  });
}

// Personalized recommendation rail. User-scoped via auth.uid in the RPC; we key
// by userId so a sign-out/sign-in can't serve another user's cached rows.
export function useRecommendationsQuery(userId: string | null, limit = 12) {
  return useQuery({
    queryKey: qk.recommendations(userId),
    enabled: !!userId,
    queryFn: () => fetchRecommendations(limit),
  });
}

export function useRecentlyViewedQuery(userId: string | null, limit = 10) {
  return useQuery({
    queryKey: qk.recentlyViewed(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchRecentlyViewed(limit),
  });
}

export function useProfileQuery(userId: string) {
  return useQuery({
    queryKey: qk.profile(userId),
    enabled: !!userId,
    queryFn: async (): Promise<Profile | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as Profile | null) ?? null;
    },
  });
}

export function useUserListingsQuery(userId: string) {
  return useQuery({
    queryKey: qk.userListings(userId),
    enabled: !!userId,
    queryFn: (): Promise<Listing[]> => fetchUserListings(userId),
  });
}

export function useFollowStateQuery(viewerId: string | null, targetId: string) {
  return useQuery({
    queryKey: qk.followState(viewerId, targetId),
    // get_follow_state requires an authenticated caller (public execute was
    // revoked — see supabase/migrations/20260611223243_revoke_public_execute_on_rpcs.sql).
    // Signed-out visitors can't be "following" anyone anyway, so skip the call
    // rather than let it 403 every time.
    enabled: !!viewerId && !!targetId,
    // Seed from the last-known-good module cache so the Follow button renders
    // correctly on first paint instead of flashing the default state.
    initialData: () => getCachedFollowState(viewerId, targetId) ?? undefined,
    queryFn: async (): Promise<FollowState> => {
      const state = await fetchFollowState(viewerId, targetId);
      // fetchFollowState returns null on RPC failure. Throw so React Query keeps
      // the previous (good) value instead of clobbering it with a default — this
      // is the resilience the old followCache provided against the "Follow
      // button reverts on reopen" bug.
      if (!state) throw new Error('follow state unavailable');
      return state;
    },
  });
}

// Optimistic follow toggle. Snapshots the current follow state, flips it
// immediately, then reconciles with the server's authoritative counts (or rolls
// back on error) — replacing the manual setState juggling the screens did.
export function useToggleFollow(viewerId: string | null, targetId: string) {
  const qc = useQueryClient();
  const key = qk.followState(viewerId, targetId);
  return useMutation({
    mutationFn: ({ currentlyFollowing }: { currentlyFollowing: boolean }) =>
      toggleFollow(viewerId as string, targetId, currentlyFollowing),
    onMutate: async ({ currentlyFollowing }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<FollowState>(key);
      if (prev) {
        qc.setQueryData<FollowState>(key, {
          ...prev,
          isFollowing: !currentlyFollowing,
          followersCount: Math.max(
            0,
            prev.followersCount + (currentlyFollowing ? -1 : 1),
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSuccess: (next) => {
      qc.setQueryData(key, next);
    },
  });
}

// ── Follow lists (profile/followers, profile/following) ─────────────────────
// These two screens previously fetched in a hand-rolled `load()` that awaited
// three calls in series — list, then mask, then the header's username — even
// though the username depends on neither of the others. As sibling useQuery
// calls the independent ones now start together, and revisiting the screen
// paints from cache instead of re-running the whole chain.
type FollowRow = Awaited<ReturnType<typeof fetchFollowers>>[number];

// Paged, because these lists are as long as the account is popular. `pageParam`
// is the page INDEX (fetchFollowers/fetchFollowing take a page number, not an
// offset); a short page means the end of the list.
//
// Both hooks return the raw useInfiniteQuery result — callers flatten
// `data.pages` themselves, the same way the home feed does.
export function useFollowersQuery(userId: string) {
  return useInfiniteQuery({
    queryKey: qk.followers(userId),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<FollowRow[]> => fetchFollowers(userId, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FOLLOW_PAGE_SIZE ? undefined : allPages.length,
  });
}

export function useFollowingQuery(userId: string) {
  return useInfiniteQuery({
    queryKey: qk.following(userId),
    enabled: !!userId,
    initialPageParam: 0,
    queryFn: ({ pageParam }): Promise<FollowRow[]> => fetchFollowing(userId, pageParam),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.length < FOLLOW_PAGE_SIZE ? undefined : allPages.length,
  });
}

/**
 * Which of `ids` the viewer already follows — drives each row's Follow/Following
 * button. Dependent on the list query, so it stays disabled until ids arrive.
 *
 * Returns string[], NOT the Set that fetchFollowingMask hands back. That is
 * load-bearing: the Query cache is persisted to AsyncStorage through
 * JSON.stringify (see persistOptions in lib/queryClient.ts), and
 * `JSON.stringify(new Set(['a']))` is `"{}"` — a cached Set would silently
 * rehydrate empty on the next cold launch and every row would render "Follow"
 * regardless of the truth. Callers rebuild the Set for O(1) lookups.
 */
export function useFollowingMaskQuery(
  viewerId: string | null,
  scope: string,
  ids: string[],
) {
  return useQuery({
    queryKey: qk.followingMask(viewerId, scope, ids),
    enabled: !!viewerId && ids.length > 0,
    // Keep the previous mask on screen while a changed id set refetches, so
    // rows don't flash back to "Follow" mid-refresh.
    placeholderData: (prev) => prev,
    queryFn: async (): Promise<string[]> =>
      Array.from(await fetchFollowingMask(viewerId, ids)),
  });
}

/**
 * Follow/unfollow one row of a follow list. Flips that id in the cached mask
 * immediately and rolls back if the server rejects, which is what keeps the
 * button from visibly bouncing on a slow link.
 *
 * Distinct from useToggleFollow above: that one owns a single profile's
 * FollowState (with counts) for the profile screen, this one owns membership in
 * a list-wide mask. Both are invalidated on success so the two views cannot
 * disagree after a toggle in either place.
 */
export function useToggleFollowInList(viewerId: string | null, scope: string) {
  const qc = useQueryClient();
  // Prefix, NOT the exact key. The exact key embeds the id array, and these
  // lists paginate — a page landing mid-flight changes it, which would strand
  // the optimistic write on a cache entry nothing reads and snap the button
  // back. Writing through the prefix hits every mask cached for this list.
  const prefix = qk.followingMaskScope(viewerId, scope);

  // Flip one id in a mask, or reconcile it to a known server answer.
  const withId = (list: string[] | undefined, id: string, following: boolean) => {
    const without = (list ?? []).filter((x) => x !== id);
    return following ? [...without, id] : without;
  };

  return useMutation({
    mutationFn: ({ id, currentlyFollowing }: { id: string; currentlyFollowing: boolean }) =>
      toggleFollow(viewerId as string, id, currentlyFollowing),
    onMutate: async ({ id, currentlyFollowing }) => {
      await qc.cancelQueries({ queryKey: prefix });
      // Snapshot every matching entry so a failure restores all of them.
      const prev = qc.getQueriesData<string[]>({ queryKey: prefix });
      qc.setQueriesData<string[]>({ queryKey: prefix }, (old) =>
        withId(old, id, !currentlyFollowing),
      );
      return { prev };
    },
    onError: (_e, _vars, ctx) => {
      for (const [key, data] of ctx?.prev ?? []) qc.setQueryData(key, data);
    },
    onSuccess: (state, { id }) => {
      // Reconcile against what the RPC actually decided rather than assuming
      // the optimistic flip was right.
      qc.setQueriesData<string[]>({ queryKey: prefix }, (old) =>
        withId(old, id, state.isFollowing),
      );
      // The profile screen caches this pair's FollowState (with counts)
      // separately; drop it so a later visit re-reads the new truth.
      qc.invalidateQueries({ queryKey: qk.followState(viewerId, id) });
    },
  });
}

// ── Wardrobe ────────────────────────────────────────────────────────────────
export function useWardrobeDeckQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.wardrobeDeck(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchDeck(userId as string),
  });
}

export function useMyWardrobeQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myWardrobe(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchMyWardrobe(userId as string),
  });
}

export function useLikedWardrobeQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.likedWardrobe(userId),
    enabled: !!userId,
    queryFn: (): Promise<WardrobePost[]> => fetchLikedWardrobe(userId as string),
  });
}

// Record a swipe. The deck screen removes the card optimistically on its own;
// this mutation just persists and, on success, refreshes the Liked list.
export function useRecordSwipe(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, direction }: { postId: string; direction: SwipeDirection }) =>
      recordSwipe(postId, userId as string, direction),
    onSuccess: (_r, { direction }) => {
      if (direction === 'like') qc.invalidateQueries({ queryKey: qk.likedWardrobe(userId) });
    },
  });
}

export function useCreateWardrobePost(userId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: {
      imageUrl: string;
      caption: string | null;
      tags: string[];
      faceHidden: boolean;
      bgRemoved: boolean;
    }) => createWardrobePost({ userId: userId as string, ...args }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.myWardrobe(userId) }),
  });
}

export function useDeleteWardrobePost(userId: string | null) {
  const qc = useQueryClient();
  const key = qk.myWardrobe(userId);
  return useMutation({
    mutationFn: (id: string) => deleteWardrobePost(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<WardrobePost[]>(key);
      qc.setQueryData<WardrobePost[]>(key, (old) => (old ?? []).filter((p) => p.id !== id));
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
  });
}
