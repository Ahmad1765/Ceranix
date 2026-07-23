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
} from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  fetchFollowingListingsResult,
  fetchLikedListings,
  fetchListings,
  fetchListingsResult,
  fetchSellerOtherListings,
  fetchSimilarListings,
  fetchUserListings,
  type FeedTab,
  type SortKey,
} from '@/lib/listings';
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
  listSavedSearches,
  type SavedSearch,
} from '@/lib/savedSearches';
import {
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
// trending as the anonymous fallback. Returns RecommendedListing[] for users
// (carries rec_reason, used to detect the cold-start "fallback" state).
export function useMyFeedListingsQuery(userId: string | null) {
  return useQuery({
    queryKey: qk.myFeedListings(userId),
    queryFn: () =>
      userId ? fetchRecommendations(48) : fetchListings({ tab: 'popular', limit: 60 }),
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
    enabled: !!targetId,
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
