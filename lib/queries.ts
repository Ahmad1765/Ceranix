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
  fetchUserListings,
  type FeedTab,
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
  getCachedFollowState,
  toggleFollow,
  type FollowState,
} from '@/lib/follows';
import type { User as Profile, Listing } from '@/types';

// Centralized, typed query keys. One place to see every cache key in the app
// and to invalidate consistently (e.g. qc.invalidateQueries({ queryKey: qk.profile(id) })).
export const qk = {
  profile: (id: string) => ['profile', id] as const,
  userListings: (id: string) => ['userListings', id] as const,
  followState: (viewerId: string | null, targetId: string) =>
    ['followState', viewerId, targetId] as const,
  feedListings: (tab: FeedTab, category: string | null) =>
    ['feedListings', tab, category] as const,
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
};

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
  limit?: number;
  enabled?: boolean;
}) {
  const { tab, category = null, limit = 60, enabled = true } = opts;
  return useQuery({
    queryKey: qk.feedListings(tab, category),
    enabled,
    queryFn: (): Promise<Listing[]> => fetchListings({ tab, category, limit }),
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
