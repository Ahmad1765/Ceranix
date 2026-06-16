// TanStack Query hooks + a central query-key factory. Screens import these
// instead of calling fetch* directly, so caching, dedup, retries, and
// background refetch are handled in one place. The underlying fetch functions
// in lib/listings.ts / lib/follows.ts stay the single source of data logic —
// these hooks just wrap them with React Query.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchListings, fetchUserListings, type FeedTab } from '@/lib/listings';
import { fetchRecommendations, fetchRecentlyViewed } from '@/lib/recommendations';
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
};

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
